import { randomUUID } from "node:crypto"
import { splitPdfPages } from "@repo/aisle/labels"
import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { connections, documents, productBarcodes, stockSnapshots } from "@/db/schema"
import { accessibleOrder } from "./access"
import type { Session } from "./auth"
import { copyFile, getFile, putFile, validatePdf } from "./storage"

// What the products page shows about a variation's saved barcode.
export type ProductBarcode = { name: string; bytes: number; uploadedAt: string }

export const variantIdSchema = z.string().regex(/^gid:\/\/shopify\/ProductVariant\/\d+$/)

export class ProductBarcodeError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 403 | 404 | 409
  ) {
    super(message)
  }
}

const maxBytes = 32 * 1024 * 1024

async function shopifyDomain(s: Session) {
  if (s.org.kind !== "buyer") {
    throw new ProductBarcodeError("A buyer workspace is required", 403)
  }
  const [account] = await db()
    .select({ domain: connections.externalId })
    .from(connections)
    .where(and(eq(connections.orgId, s.org.id), eq(connections.provider, "shopify")))
  if (!account) {
    throw new ProductBarcodeError("Connect Shopify before editing products", 409)
  }
  return account.domain
}

export async function readProductBarcodes(orgId: string, domain: string) {
  const rows = await db()
    .select()
    .from(productBarcodes)
    .where(and(eq(productBarcodes.orgId, orgId), eq(productBarcodes.shopifyDomain, domain)))
  return new Map<string, ProductBarcode>(
    rows.map((row) => [row.variantId, { name: row.name, bytes: row.bytes, uploadedAt: row.createdAt.toISOString() }])
  )
}

// Saves a variation's barcode label, replacing any earlier one. POs that already have a label keep theirs.
export async function saveProductBarcode(s: Session, form: FormData) {
  const domain = await shopifyDomain(s)
  const variantId = variantIdSchema.safeParse(form.get("variantId"))
  if (!variantId.success) {
    throw new ProductBarcodeError("Choose a product variation", 400)
  }
  const file = form.get("file")
  if (!(file instanceof File) || file.size > maxBytes) {
    throw new ProductBarcodeError("Choose a PDF smaller than 32 MB", 400)
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  try {
    await validatePdf(bytes)
  } catch (error) {
    throw new ProductBarcodeError(error instanceof Error ? error.message : "Upload a PDF smaller than 32 MB", 400)
  }
  if ((await splitPdfPages(bytes)).length !== 1) {
    throw new ProductBarcodeError("Upload a barcode PDF with one page", 400)
  }
  const [stock] = await db()
    .select({ data: stockSnapshots.data })
    .from(stockSnapshots)
    .where(
      and(
        eq(stockSnapshots.orgId, s.org.id),
        eq(stockSnapshots.source, "shopify"),
        eq(stockSnapshots.externalAccountId, domain),
        eq(stockSnapshots.scopeKey, "store")
      )
    )
  const row =
    stock?.data?.source === "shopify" ? stock.data.rows.find((item) => item.variantId === variantId.data) : undefined
  if (!row?.productId) {
    throw new ProductBarcodeError("This product isn't in your synced Shopify inventory", 404)
  }
  const objectKey = `barcodes/${s.org.id}/${randomUUID()}.pdf`
  await putFile(objectKey, bytes)
  const value = {
    productId: row.productId,
    objectKey,
    name: file.name.replace(/[^a-zA-Z0-9 ._-]/g, "_").slice(0, 180) || "Barcode.pdf",
    bytes: bytes.length,
    uploadedBy: s.user.id,
    createdAt: new Date()
  }
  await db()
    .insert(productBarcodes)
    .values({ orgId: s.org.id, shopifyDomain: domain, variantId: variantId.data, ...value })
    .onConflictDoUpdate({
      target: [productBarcodes.orgId, productBarcodes.shopifyDomain, productBarcodes.variantId],
      set: value
    })
  return { name: value.name, bytes: value.bytes, uploadedAt: value.createdAt.toISOString() } satisfies ProductBarcode
}

function barcodeScope(orgId: string, domain: string, variantId: string) {
  return and(
    eq(productBarcodes.orgId, orgId),
    eq(productBarcodes.shopifyDomain, domain),
    eq(productBarcodes.variantId, variantId)
  )
}

export async function removeProductBarcode(s: Session, variantId: string) {
  const domain = await shopifyDomain(s)
  await db()
    .delete(productBarcodes)
    .where(barcodeScope(s.org.id, domain, variantId))
}

export async function productBarcodeFile(s: Session, variantId: string) {
  const domain = await shopifyDomain(s)
  const [barcode] = await db()
    .select()
    .from(productBarcodes)
    .where(barcodeScope(s.org.id, domain, variantId))
  if (!barcode) {
    throw new ProductBarcodeError("This variation has no barcode", 404)
  }
  return { name: barcode.name, bytes: await getFile(barcode.objectKey) }
}

// Copies saved barcodes onto a PO as product labels for the lines that don't have one yet. Labels uploaded on the PO
// itself are kept.
export async function attachProductBarcodes(s: Session, orderId: string) {
  if (s.org.kind !== "buyer") {
    return
  }
  const { order } = await accessibleOrder(s, orderId)
  const labelled = await db()
    .select({ itemId: documents.itemId })
    .from(documents)
    .where(and(eq(documents.orderId, orderId), eq(documents.kind, "product_label"), eq(documents.outdated, 0)))
  const missing = order.data.items.filter((item) => !labelled.some((label) => label.itemId === item.id))
  if (!missing.length) {
    return
  }
  const barcodes = await db()
    .select()
    .from(productBarcodes)
    .where(
      and(
        eq(productBarcodes.orgId, order.buyerOrgId),
        eq(productBarcodes.shopifyDomain, order.shopifyDomain),
        inArray(
          productBarcodes.variantId,
          missing.map((item) => item.variantId)
        )
      )
    )
  const staged: (typeof documents.$inferInsert)[] = []
  for (const item of missing) {
    const barcode = barcodes.find((row) => row.variantId === item.variantId)
    if (!barcode) {
      continue
    }
    const id = randomUUID()
    const objectKey = `orders/${orderId}/${id}.pdf`
    await copyFile(barcode.objectKey, objectKey)
    staged.push({
      id,
      orderId,
      kind: "product_label",
      itemId: item.id,
      objectKey,
      name: barcode.name,
      bytes: barcode.bytes,
      orderRevision: order.revision,
      uploadedBy: barcode.uploadedBy
    })
  }
  if (!staged.length) {
    return
  }
  await db().transaction(async (tx) => {
    const { order: fresh } = await accessibleOrder(s, orderId, tx, true)
    const current = await tx
      .select({ itemId: documents.itemId })
      .from(documents)
      .where(and(eq(documents.orderId, orderId), eq(documents.kind, "product_label"), eq(documents.outdated, 0)))
    // A label uploaded meanwhile, or a line removed from the PO, wins over the saved barcode.
    const values = staged.filter(
      (doc) =>
        fresh.data.items.some((item) => item.id === doc.itemId) && !current.some((label) => label.itemId === doc.itemId)
    )
    if (values.length) {
      await tx.insert(documents).values(values)
    }
  })
}
