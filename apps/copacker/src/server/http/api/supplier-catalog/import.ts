import { createHash } from "node:crypto"
import { z } from "zod"
import { db } from "@/db"
import { supplierCatalogImports } from "@/db/schema"
import { LocalizedError } from "@/i18n/errors"
import { session } from "@/server/auth"
import { requireAccess, requireSupplier } from "@/server/authorization"
import { requestForm, requestInput } from "@/server/errors"
import { commitImport, previewImport } from "@/server/product-import"
import { readSheet } from "@/server/product-sheet"
import { putFile } from "@/server/storage"

const maxBytes = 5 * 1024 * 1024
const types = {
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
}

// Imports a filled-in product template, CSV or Excel: first a preview of what would change, then the import itself,
// which the preview's hash guards against changes made in between. Each file is imported once.
export async function POST(request: Request) {
  const s = await session()
  requireSupplier(s)
  // The sheet sets prices, which a supplier's Products: Edit includes.
  requireAccess(s, "products", "edit")
  const form = await requestForm(request)
  const file = form.get("file")
  const extension = file instanceof File ? file.name.toLowerCase().split(".").pop() : undefined
  if (!(file instanceof File) || (extension !== "csv" && extension !== "xlsx") || !file.size || file.size > maxBytes) {
    throw new LocalizedError("uploadProductTemplate")
  }
  const mode = requestInput(z.enum(["preview", "commit"]), form.get("mode"))
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
}
