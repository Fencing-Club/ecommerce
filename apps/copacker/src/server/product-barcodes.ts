import { randomUUID } from "node:crypto"
import { splitPdfPages } from "@repo/aisle/labels"
import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { connections, documents, productBarcodes, stockSnapshots } from "@/db/schema"
import { accessibleOrder } from "./access"
import type { Session } from "./auth"
import { describeError } from "./stock"
import { copyFile, deleteFile, getFile, putFile, validatePdf } from "./storage"

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

// Variations in the buyer's connected store that have a saved barcode.
export async function barcodedVariants(orgId: string) {
  const [account] = await db()
    .select({ domain: connections.externalId })
    .from(connections)
    .where(and(eq(connections.orgId, orgId), eq(connections.provider, "shopify")))
  return account ? [...(await readProductBarcodes(orgId, account.domain)).keys()] : []
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

// The variation a barcode upload is for, as the products page and bulk upload report it.
export type BarcodeTarget = { variantId: string; sku: string | null; product: string; variant: string | null }

// The SKU a file name gives, such as "fc-allenkey-wrench" for "fc-allenkey-wrench.pdf".
export function skuFromFileName(name: string) {
  return name.replace(/\.pdf$/i, "").trim()
}

type StockRow = Extract<NonNullable<typeof stockSnapshots.$inferSelect.data>, { source: "shopify" }>["rows"][number]

// Finds the variation by its ID or, for bulk uploads, by an exact SKU (ignoring case). A SKU several variations share
// can't choose one, so those barcodes are uploaded from the product's Edit panel.
function resolveVariant(rows: StockRow[], variantId: string | null, sku: string) {
  if (variantId) {
    const row = rows.find((item) => item.variantId === variantId)
    if (!row?.productId) {
      throw new ProductBarcodeError("This product isn't in your synced Shopify inventory", 404)
    }
    return row
  }
  if (!sku) {
    throw new ProductBarcodeError("Enter the variation's SKU", 400)
  }
  const matches = rows.filter((item) => item.buyerSku?.trim().toLowerCase() === sku.toLowerCase())
  if (matches.length > 1) {
    throw new ProductBarcodeError(
      `${matches.length} variations share the SKU "${sku}". Upload this barcode from the product's Edit panel.`,
      409
    )
  }
  if (!matches[0]?.productId) {
    throw new ProductBarcodeError(`No variation has the SKU "${sku}"`, 404)
  }
  return matches[0]
}

// Deleting a replaced or removed file only tidies storage; a failure is logged and leaves the file behind.
async function discardFile(objectKey: string) {
  try {
    await deleteFile(objectKey)
  } catch (error) {
    console.error(JSON.stringify({ event: "barcode_file_delete_failed", objectKey, error: describeError(error) }))
  }
}

// Saves a variation's barcode label, replacing any earlier one. POs that already have a label keep their own copy.
// The form names the variation with variantId, or with a SKU: the sku field, or else the file's name.
export async function saveProductBarcode(s: Session, form: FormData) {
  const domain = await shopifyDomain(s)
  const rawVariant = form.get("variantId")
  const variantId = rawVariant === null ? null : variantIdSchema.safeParse(rawVariant)
  if (variantId && !variantId.success) {
    throw new ProductBarcodeError("Choose a product variation", 400)
  }
  const file = form.get("file")
  if (!(file instanceof File) || file.size > maxBytes) {
    throw new ProductBarcodeError("Choose a PDF smaller than 32 MB", 400)
  }
  const rawSku = form.get("sku")
  const sku = typeof rawSku === "string" && rawSku.trim() ? rawSku.trim() : skuFromFileName(file.name)
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
  const row = resolveVariant(
    stock?.data?.source === "shopify" ? stock.data.rows : [],
    variantId?.data ?? null,
    sku.slice(0, 255)
  )
  const bytes = new Uint8Array(await file.arrayBuffer())
  try {
    await validatePdf(bytes)
  } catch (error) {
    throw new ProductBarcodeError(error instanceof Error ? error.message : "Upload a PDF smaller than 32 MB", 400)
  }
  if ((await splitPdfPages(bytes)).length !== 1) {
    throw new ProductBarcodeError("Upload a barcode PDF with one page", 400)
  }
  const objectKey = `barcodes/${s.org.id}/${randomUUID()}.pdf`
  await putFile(objectKey, bytes)
  const value = {
    productId: row.productId!,
    objectKey,
    name: file.name.replace(/[^a-zA-Z0-9 ._-]/g, "_").slice(0, 180) || "Barcode.pdf",
    bytes: bytes.length,
    uploadedBy: s.user.id,
    createdAt: new Date()
  }
  let replaced: string | null
  try {
    replaced = await db().transaction(async (tx) => {
      const [previous] = await tx
        .select({ objectKey: productBarcodes.objectKey })
        .from(productBarcodes)
        .where(barcodeScope(s.org.id, domain, row.variantId))
        .for("update")
      await tx
        .insert(productBarcodes)
        .values({ orgId: s.org.id, shopifyDomain: domain, variantId: row.variantId, ...value })
        .onConflictDoUpdate({
          target: [productBarcodes.orgId, productBarcodes.shopifyDomain, productBarcodes.variantId],
          set: value
        })
      return previous?.objectKey ?? null
    })
  } catch (error) {
    await discardFile(objectKey)
    throw error
  }
  if (replaced) {
    await discardFile(replaced)
  }
  return {
    name: value.name,
    bytes: value.bytes,
    uploadedAt: value.createdAt.toISOString(),
    replaced: replaced !== null,
    target: {
      variantId: row.variantId,
      sku: row.buyerSku,
      product: row.productTitle ?? row.buyerSku ?? "Untitled product",
      variant: row.variantTitle && row.variantTitle !== "Default Title" ? row.variantTitle : null
    } satisfies BarcodeTarget
  }
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
  const removed = await db()
    .delete(productBarcodes)
    .where(barcodeScope(s.org.id, domain, variantId))
    .returning({ objectKey: productBarcodes.objectKey })
  for (const { objectKey } of removed) {
    await discardFile(objectKey)
  }
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
