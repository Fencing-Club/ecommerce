import { createHash } from "node:crypto"
import { db } from "@/db"
import { supplierCatalogImports } from "@/db/schema"
import { session } from "@/server/auth"
import { commitImport, previewImport } from "@/server/product-import"
import { readSheet } from "@/server/product-sheet"
import { appUrl } from "@/server/security"
import { putFile } from "@/server/storage"

const maxBytes = 5 * 1024 * 1024
const types = {
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
}

// Imports a filled-in product template, CSV or Excel: first a preview of what would change, then the import itself,
// which the preview's hash guards against changes made in between. Each file is imported once.
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
    const file = form.get("file")
    const mode = form.get("mode")
    const extension = file instanceof File ? file.name.toLowerCase().split(".").pop() : undefined
    if (
      !(file instanceof File) ||
      (extension !== "csv" && extension !== "xlsx") ||
      !file.size ||
      file.size > maxBytes
    ) {
      throw new Error("Upload the product template as a CSV or Excel file of up to 5 MB")
    }
    if (mode !== "preview" && mode !== "commit") {
      throw new Error("Choose preview or import")
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    const products = await readSheet({ name: file.name, bytes })
    const fileHash = createHash("sha256").update(bytes).digest("hex")
    if (mode === "preview") {
      return Response.json({ ...(await previewImport(s.org.id, products)), fileHash })
    }
    const expected = String(form.get("revisionHash") ?? "")
    if (form.get("fileHash") !== fileHash) {
      throw new Error("The file changed after the preview. Preview it again before importing")
    }
    const objectKey = `supplier-catalogs/${s.org.id}/${fileHash}.${extension}`
    await putFile(objectKey, bytes, types[extension])
    const result = await db().transaction(async (tx) => {
      const [imported] = await tx
        .insert(supplierCatalogImports)
        .values({
          supplierOrgId: s.org.id,
          objectKey,
          filename: file.name.slice(0, 255),
          createdBy: s.user.id,
          rowCount: products.reduce((sum, product) => sum + product.variants.length, 0)
        })
        .onConflictDoNothing()
        .returning({ id: supplierCatalogImports.id })
      if (!imported) {
        return { imported: false }
      }
      await commitImport(tx, s.org.id, products, expected)
      return { imported: true }
    })
    return Response.json(result)
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Import failed" }, { status: 400 })
  }
}
