import { createHash } from "node:crypto"
import { and, eq, inArray, sql } from "drizzle-orm"
import { db } from "@/db"
import { supplierCatalogImports, supplierProducts } from "@/db/schema"
import { session } from "@/server/auth"
import { appUrl } from "@/server/security"
import { putFile } from "@/server/storage"
import { catalogRevisionHash, parseSupplierCatalogCsv, sameSupplierCatalogFields } from "@/server/supplier-catalog-csv"

export async function POST(request: Request) {
  if (request.headers.get("origin") !== appUrl()) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 })
  }
  try {
    const s = await session()
    if (s.org.kind !== "supplier") {
      return Response.json({ error: "A supplier workspace is required" }, { status: 403 })
    }
    const form = await request.formData()
    const file = form.get("file"),
      mode = form.get("mode")
    if (
      !(file instanceof File) ||
      !file.name.toLowerCase().endsWith(".csv") ||
      file.size > 2 * 1024 * 1024 ||
      file.size === 0
    ) {
      throw new Error("Upload a CSV file smaller than 2 MB")
    }
    if (mode !== "preview" && mode !== "commit") {
      throw new Error("Choose preview or import")
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    const rows = parseSupplierCatalogCsv(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
    const skus = rows.map((row) => row.supplierSku)
    const digest = createHash("sha256").update(bytes).digest("hex")
    if (mode === "preview") {
      const existing = skus.length
        ? await db()
            .select()
            .from(supplierProducts)
            .where(and(eq(supplierProducts.supplierOrgId, s.org.id), inArray(supplierProducts.supplierSku, skus)))
        : []
      const currentBySku = new Map(existing.map((product) => [product.supplierSku, product]))
      const created = rows.filter((row) => !currentBySku.has(row.supplierSku)).length
      const unchanged = rows.filter((row) => {
        const current = currentBySku.get(row.supplierSku)
        return current && sameSupplierCatalogFields(current, row)
      }).length
      return Response.json({
        rows,
        count: rows.length,
        created,
        updated: rows.length - created - unchanged,
        unchanged,
        revisionHash: catalogRevisionHash(existing),
        fileHash: digest
      })
    }
    const expectedRevisionHash = form.get("revisionHash"),
      expectedFileHash = form.get("fileHash")
    if (
      typeof expectedRevisionHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(expectedRevisionHash) ||
      expectedFileHash !== digest
    ) {
      throw new Error("Preview this file before importing")
    }
    const objectKey = `supplier-catalogs/${s.org.id}/${digest}.csv`
    await putFile(objectKey, bytes, "text/csv; charset=utf-8")
    const result = await db().transaction(async (tx) => {
      const [imported] = await tx
        .insert(supplierCatalogImports)
        .values({
          supplierOrgId: s.org.id,
          objectKey,
          filename: file.name.slice(0, 255),
          createdBy: s.user.id,
          rowCount: rows.length
        })
        .onConflictDoNothing()
        .returning({ id: supplierCatalogImports.id })
      if (!imported) {
        return { imported: false, created: 0, updated: 0 }
      }
      const existing = skus.length
        ? await tx
            .select({
              supplierSku: supplierProducts.supplierSku,
              id: supplierProducts.id,
              revision: supplierProducts.revision
            })
            .from(supplierProducts)
            .where(and(eq(supplierProducts.supplierOrgId, s.org.id), inArray(supplierProducts.supplierSku, skus)))
            .for("update")
        : []
      if (catalogRevisionHash(existing) !== expectedRevisionHash) {
        throw new Error("Catalog changed after preview. Preview the file again before importing")
      }
      let created = 0,
        updated = 0,
        unchanged = 0
      for (const row of rows) {
        const [prior] = await tx
          .select()
          .from(supplierProducts)
          .where(
            sql`${supplierProducts.supplierOrgId} = ${s.org.id} AND ${supplierProducts.supplierSku} = ${row.supplierSku}`
          )
          .for("update")
        if (!prior) {
          await tx.insert(supplierProducts).values({ supplierOrgId: s.org.id, ...row })
          created++
        } else if (sameSupplierCatalogFields(prior, row)) {
          unchanged++
        } else {
          await tx
            .update(supplierProducts)
            .set({ ...row, active: 1, revision: prior.revision + 1, updatedAt: new Date() })
            .where(eq(supplierProducts.id, prior.id))
          updated++
        }
      }
      return { imported: true, created, updated, unchanged }
    })
    return Response.json(result)
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Catalog import failed" }, { status: 400 })
  }
}
