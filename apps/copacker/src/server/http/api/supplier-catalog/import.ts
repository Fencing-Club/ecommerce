import { createHash } from "node:crypto"
import { db } from "@/db"
import { supplierCatalogImports } from "@/db/schema"
import { LocalizedError } from "@/i18n/errors"
import { session } from "@/server/auth"
import { requireAccess } from "@/server/authorization"
import { errorResponse, failureMessage, failureStatus } from "@/server/errors"
import { commitImport, previewImport } from "@/server/product-import"
import { readSheet } from "@/server/product-sheet"
import { isAppOrigin } from "@/server/security"
import { putFile } from "@/server/storage"

const maxBytes = 5 * 1024 * 1024
const types = {
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
}

// Imports a filled-in product template, CSV or Excel: first a preview of what would change, then the import itself,
// which the preview's hash guards against changes made in between. Each file is imported once.
export async function POST(request: Request) {
  if (!isAppOrigin(request.headers.get("origin"))) {
    return errorResponse("invalidOrigin", 403)
  }
  try {
    const s = await session()
    if (s.org.kind !== "supplier") {
      return errorResponse("supplierWorkspaceRequired", 403)
    }
    requireAccess(s, "products", "edit")
    // The sheet sets prices.
    requireAccess(s, "prices")
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
      throw new LocalizedError("uploadProductTemplate")
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
      throw new LocalizedError("fileChangedAfterPreview")
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
    return Response.json({ error: await failureMessage(error, "importFailed") }, { status: failureStatus(error) })
  }
}
