import { randomUUID } from "node:crypto"
import { amazonDestinations } from "@repo/aisle"
import { combinePdfs } from "@repo/aisle/documents"
import { splitPdfPages } from "@repo/aisle/labels"
import { labelTitle, standardProductLabels } from "@repo/aisle/product-labels"
import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { connections, documents, productBarcodes, shipments, stockSnapshots } from "@/db/schema"
import { accessibleOrder } from "./access"
import type { Session } from "./auth"
import { amazonFor, shopifyFor } from "./connections"
import { inventoryContext } from "./inventory-context"
import { type ProductDefaults, readProductDefaults } from "./product-defaults"
import { releasedStates } from "./readiness"
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

async function storeRows(orgId: string, domain: string) {
  const [stock] = await db()
    .select({ data: stockSnapshots.data })
    .from(stockSnapshots)
    .where(
      and(
        eq(stockSnapshots.orgId, orgId),
        eq(stockSnapshots.source, "shopify"),
        eq(stockSnapshots.externalAccountId, domain),
        eq(stockSnapshots.scopeKey, "store")
      )
    )
  return stock?.data?.source === "shopify" ? stock.data.rows : []
}

// Whether a variation's product needs an uploaded label rather than the standard FNSKU label.
const needsUpload = (defaults: ReadonlyMap<string, ProductDefaults>, productId: string | undefined) =>
  productId !== undefined && defaults.get(productId)?.productLabel === "uploaded"

// Variations whose product needs an uploaded label, such as one with size measurements, and that don't have one yet.
export async function variantsNeedingBarcode(orgId: string) {
  const [account] = await db()
    .select({ domain: connections.externalId })
    .from(connections)
    .where(and(eq(connections.orgId, orgId), eq(connections.provider, "shopify")))
  if (!account) {
    return []
  }
  const [rows, defaults, barcodes] = await Promise.all([
    storeRows(orgId, account.domain),
    readProductDefaults(orgId, account.domain),
    readProductBarcodes(orgId, account.domain)
  ])
  return rows
    .filter((row) => needsUpload(defaults, row.productId) && !barcodes.has(row.variantId))
    .map((row) => row.variantId)
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
export async function discardFile(objectKey: string) {
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
  const row = resolveVariant(await storeRows(s.org.id, domain), variantId?.data ?? null, sku.slice(0, 255))
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

// A variation's product label, or why it has none.
type LabelFile = { variantId: string; name: string; bytes: Uint8Array } | { variantId: string; problem: string }

// Variations' product labels: each one's uploaded barcode, or else the standard label sheet, unless its product needs
// an uploaded one. Lookups are batched, so a whole catalog's labels need a few Amazon and Shopify requests, not one per
// variation. Results keep the order of variantIds.
export async function productLabelFiles(s: Session, variantIds: string[]): Promise<LabelFile[]> {
  const domain = await shopifyDomain(s)
  const ids = [...new Set(variantIds)]
  const uploads = ids.length
    ? await db()
        .select()
        .from(productBarcodes)
        .where(
          and(
            eq(productBarcodes.orgId, s.org.id),
            eq(productBarcodes.shopifyDomain, domain),
            inArray(productBarcodes.variantId, ids)
          )
        )
    : []
  const context = await inventoryContext(s.org.id)
  const defaults = await readProductDefaults(s.org.id, domain)
  const problems = new Map<string, string>()
  const standard: StockRow[] = []
  for (const id of ids) {
    if (uploads.some((upload) => upload.variantId === id)) {
      continue
    }
    const row = context.rows.find((item) => item.variantId === id)
    if (!row) {
      problems.set(id, "This product isn't in your synced Shopify inventory")
    } else if (needsUpload(defaults, row.productId)) {
      problems.set(id, "This product needs an uploaded label")
    } else if (!row.buyerSku) {
      problems.set(id, "This variation has no SKU to print. Add one in Shopify.")
    } else {
      standard.push(row)
    }
  }
  const codes = await labelCodes(
    s.org.id,
    context.fbaRows ?? [],
    standard.map((row) => row.buyerSku!)
  )
  const origins = new Map(
    await countriesOfOrigin(
      s.org.id,
      domain,
      standard.map((row) => row.variantId)
    )
  )
  return Promise.all(
    ids.map(async (id): Promise<LabelFile> => {
      const upload = uploads.find((row) => row.variantId === id)
      if (upload) {
        return { variantId: id, name: upload.name, bytes: await getFile(upload.objectKey) }
      }
      const row = standard.find((item) => item.variantId === id)
      if (!row) {
        return { variantId: id, problem: problems.get(id)! }
      }
      const title = labelTitle(row.productTitle ?? row.buyerSku ?? "Untitled product", row.variantTitle ?? null)
      const bytes = await standardProductLabels({
        code: codes.get(row.buyerSku!)!,
        title,
        countryOfOrigin: origins.get(id) ?? null
      })
      return { variantId: id, name: labelFileName(title), bytes }
    })
  )
}

// One variation's product label, for its preview and download.
export async function productLabelFile(s: Session, variantId: string) {
  const [file] = await productLabelFiles(s, [variantId])
  if (!file || "problem" in file) {
    throw new ProductBarcodeError(file?.problem ?? "This variation has no label", 404)
  }
  return file
}

async function amazonSeller(orgId: string) {
  const [amazon] = await db()
    .select({ sellerId: connections.externalId })
    .from(connections)
    .where(and(eq(connections.orgId, orgId), eq(connections.provider, "amazon")))
  return amazon?.sellerId ?? null
}

const chunks = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size))

// The code each SKU's standard label prints: its FNSKU from the latest FBA stock sync, or else from Amazon's listing,
// which also covers products Amazon holds no stock of. Without Amazon, or for a product Amazon doesn't list, it's the
// Shopify SKU.
async function labelCodes(orgId: string, fbaRows: { sellerSku: string; fnSku?: string }[], skus: string[]) {
  const codes = new Map<string, string>()
  const unsynced: string[] = []
  for (const sku of new Set(skus)) {
    const synced = fnskuFor(fbaRows, sku)
    if (synced) {
      codes.set(sku, synced)
    } else {
      unsynced.push(sku)
    }
  }
  const sellerId = unsynced.length ? await amazonSeller(orgId) : null
  if (sellerId) {
    try {
      const amazon = await amazonFor(orgId, sellerId)
      // Amazon looks up at most 150 SKUs at a time.
      for (const batch of chunks(unsynced, 150)) {
        for (const [sku, listing] of await amazon.listings(sellerId, batch)) {
          if (listing.fnsku) {
            codes.set(sku, listing.fnsku)
          }
        }
      }
    } catch (error) {
      console.error(JSON.stringify({ event: "label_fnsku_lookup_failed", orgId, error: describeError(error) }))
      throw new ProductBarcodeError("Amazon couldn't be reached to look up the FNSKU. Try again.", 409)
    }
  }
  for (const sku of unsynced) {
    if (!codes.has(sku)) {
      codes.set(sku, sku)
    }
  }
  return codes
}

// Each variation's country of origin as Shopify records it on the inventory item, for the label's "Made in" line.
async function countriesOfOrigin(orgId: string, domain: string, variantIds: string[]) {
  if (!variantIds.length) {
    return []
  }
  let variants: Awaited<ReturnType<Awaited<ReturnType<typeof shopifyFor>>["variants"]>>
  try {
    const shopify = await shopifyFor(orgId, domain)
    // Shopify returns at most 250 nodes a request.
    variants = []
    for (const batch of chunks(variantIds, 250)) {
      variants.push(...(await shopify.variants(batch)))
    }
  } catch (error) {
    console.error(JSON.stringify({ event: "label_origin_lookup_failed", orgId, error: describeError(error) }))
    throw new ProductBarcodeError("Shopify couldn't be reached to look up the country of origin. Try again.", 409)
  }
  return variants.flatMap((variant) =>
    variant ? [[variant.id, variant.inventoryItem.countryCodeOfOrigin ?? null] as const] : []
  )
}

// A generated label's file name: its title, such as "Pro-Grip Fencing Glove (10, Left).pdf", without characters
// Windows and macOS don't allow in file names.
export function labelFileName(title: string) {
  const name = title
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180)
  return `${name || "Product label"}.pdf`
}

// The FNSKU Amazon lists for a seller SKU, when exactly one is known.
export function fnskuFor(rows: { sellerSku: string; fnSku?: string }[], sku: string) {
  const fnskus = new Set(rows.flatMap((row) => (row.sellerSku === sku && row.fnSku ? [row.fnSku] : [])))
  return fnskus.size === 1 ? [...fnskus][0]! : null
}

// Whether every current label on a PO line was added by Copacker, not uploaded on the PO, so a refresh may replace it.
const addedLabels = (labels: { itemId: string | null; uploadedBy: string }[], itemId: string) =>
  labels.filter((label) => label.itemId === itemId).every((label) => label.uploadedBy === "system")

// Lines packed in shipments released to the supplier. Their labels are part of the released packet and stay as they are.
async function releasedItems(orderId: string) {
  const rows = await db()
    .select({ status: shipments.status, packing: shipments.packing })
    .from(shipments)
    .where(eq(shipments.orderId, orderId))
  return new Set(
    rows
      .filter((row) => releasedStates.includes(row.status))
      .flatMap((row) => row.packing?.cartons.flatMap((carton) => carton.items.map((item) => item.itemId)) ?? [])
  )
}

// Adds product labels to a PO's lines that don't have one: the variation's uploaded barcode, or else the standard FNSKU
// label with the Shopify title, unless its product needs an uploaded label. Labels uploaded on the PO itself are kept.
// With refresh, labels Copacker added are made again from current barcodes and Shopify and Amazon details, except on
// lines in released shipments. Returns how many labels were added.
export async function attachProductBarcodes(s: Session, orderId: string, { refresh = false } = {}) {
  if (s.org.kind !== "buyer") {
    return 0
  }
  const { order } = await accessibleOrder(s, orderId)
  const labelled = await db()
    .select({ itemId: documents.itemId, uploadedBy: documents.uploadedBy })
    .from(documents)
    .where(and(eq(documents.orderId, orderId), eq(documents.kind, "product_label"), eq(documents.outdated, 0)))
  const released = refresh ? await releasedItems(orderId) : new Set<string>()
  const replaceable = (itemId: string) => refresh && !released.has(itemId) && addedLabels(labelled, itemId)
  const missing = order.data.items.filter(
    (item) => !labelled.some((label) => label.itemId === item.id) || replaceable(item.id)
  )
  if (!missing.length) {
    return 0
  }
  const [barcodes, defaults, rows] = await Promise.all([
    db()
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
      ),
    readProductDefaults(order.buyerOrgId, order.shopifyDomain),
    storeRows(order.buyerOrgId, order.shopifyDomain)
  ])
  // Amazon only accepts its FNSKU, which is filled in when the PO is sent. Other destinations print the Shopify SKU
  // when there's no FNSKU, such as for a product Amazon doesn't list or a store without Amazon.
  const forAmazon = amazonDestinations.includes(order.data.destination)
  // Standard labels print each variation's country of origin, looked up in one Shopify request. If Shopify can't be
  // reached, those lines stay without a label; the PO shows them, and sending it tries again.
  const standard = missing.filter(
    (item) =>
      !barcodes.some((row) => row.variantId === item.variantId) &&
      !needsUpload(defaults, rows.find((row) => row.variantId === item.variantId)?.productId)
  )
  const origins = await countriesOfOrigin(
    order.buyerOrgId,
    order.shopifyDomain,
    standard.map((item) => item.variantId)
  )
    .then((entries) => new Map(entries))
    .catch(() => null)
  const staged: (typeof documents.$inferInsert)[] = []
  for (const item of missing) {
    const barcode = barcodes.find((row) => row.variantId === item.variantId)
    const productId = rows.find((row) => row.variantId === item.variantId)?.productId
    const id = randomUUID()
    const objectKey = `orders/${orderId}/${id}.pdf`
    const label = {
      id,
      orderId,
      kind: "product_label" as const,
      itemId: item.id,
      objectKey,
      orderRevision: order.revision
    }
    if (barcode) {
      await copyFile(barcode.objectKey, objectKey)
      // Copied labels count as added by Copacker, so a refresh picks up a replaced barcode.
      staged.push({ ...label, name: barcode.name, bytes: barcode.bytes, uploadedBy: "system" })
    } else if (!needsUpload(defaults, productId)) {
      const code = item.fnsku || (forAmazon ? "" : item.buyerSku)
      if (!code || !origins) {
        continue
      }
      const title = labelTitle(item.name, item.variant)
      const bytes = await standardProductLabels({
        code,
        title,
        countryOfOrigin: origins.get(item.variantId) ?? null
      })
      await putFile(objectKey, bytes)
      staged.push({ ...label, name: labelFileName(title), bytes: bytes.length, uploadedBy: "system" })
    }
  }
  if (!staged.length) {
    return 0
  }
  const kept = await db().transaction(async (tx) => {
    const { order: fresh } = await accessibleOrder(s, orderId, tx, true)
    const current = await tx
      .select({ id: documents.id, itemId: documents.itemId, uploadedBy: documents.uploadedBy })
      .from(documents)
      .where(and(eq(documents.orderId, orderId), eq(documents.kind, "product_label"), eq(documents.outdated, 0)))
    // A label uploaded meanwhile, or a line removed from the PO, wins over the saved or standard one. A refreshed label
    // replaces only labels Copacker added; the old ones stay as outdated versions.
    const values = staged.filter((doc) => {
      if (!fresh.data.items.some((item) => item.id === doc.itemId)) {
        return false
      }
      const labels = current.filter((label) => label.itemId === doc.itemId)
      return !labels.length || (refresh && !released.has(doc.itemId!) && addedLabels(current, doc.itemId!))
    })
    const replaced = current.filter((label) => values.some((doc) => doc.itemId === label.itemId))
    if (replaced.length) {
      await tx
        .update(documents)
        .set({ outdated: 1 })
        .where(
          inArray(
            documents.id,
            replaced.map((label) => label.id)
          )
        )
    }
    if (values.length) {
      await tx.insert(documents).values(values)
    }
    return values
  })
  for (const doc of staged) {
    if (!kept.includes(doc)) {
      await discardFile(doc.objectKey)
    }
  }
  return kept.length
}

// Adds missing product labels to an open PO and makes the ones Copacker added again, such as after a barcode upload or
// a title, FNSKU or country change. Labels uploaded on the PO, and lines in released shipments, stay as they are.
export async function refreshProductLabels(s: Session, orderId: string) {
  if (s.org.kind !== "buyer") {
    throw new ProductBarcodeError("A buyer workspace is required", 403)
  }
  const { order } = await accessibleOrder(s, orderId)
  if (order.status === "closed") {
    throw new ProductBarcodeError("This PO is closed, so its labels can't change", 409)
  }
  return { updated: await attachProductBarcodes(s, orderId, { refresh: true }) }
}

// All of a PO's current product labels in one PDF, in the PO's line order, for printing them together.
export async function orderLabelsPdf(s: Session, orderId: string) {
  const { order } = await accessibleOrder(s, orderId)
  const labels = await db()
    .select({ itemId: documents.itemId, objectKey: documents.objectKey })
    .from(documents)
    .where(and(eq(documents.orderId, orderId), eq(documents.kind, "product_label"), eq(documents.outdated, 0)))
  const ordered = order.data.items.flatMap((item) => labels.filter((label) => label.itemId === item.id))
  if (!ordered.length) {
    throw new ProductBarcodeError("This PO has no product labels yet", 404)
  }
  return {
    name: labelFileName(`${order.data.reference} product labels`),
    bytes: await combinePdfs(await Promise.all(ordered.map((label) => getFile(label.objectKey))))
  }
}

// Labels for every variation of the chosen products in one PDF, one sheet each, and the variations left out because
// they have no label yet.
export async function productsLabelsPdf(s: Session, productIds: string[]) {
  const domain = await shopifyDomain(s)
  const rows = await storeRows(s.org.id, domain)
  const variantIds = productIds.flatMap((productId) =>
    rows.filter((row) => row.productId === productId).map((row) => row.variantId)
  )
  if (variantIds.length > 1000) {
    throw new ProductBarcodeError("Choose fewer products. One download holds up to 1,000 variations.", 400)
  }
  const files = await productLabelFiles(s, variantIds)
  const sheets = files.flatMap((file) => ("bytes" in file ? [file.bytes] : []))
  if (!sheets.length) {
    throw new ProductBarcodeError("None of these variations has a label yet", 404)
  }
  return { bytes: await combinePdfs(sheets), skipped: files.length - sheets.length }
}

// Every synced Shopify product with its label type, for choosing several at once on the Products page.
export async function productLabelChoices(s: Session) {
  const domain = await shopifyDomain(s)
  const [rows, defaults] = await Promise.all([storeRows(s.org.id, domain), readProductDefaults(s.org.id, domain)])
  const products = new Map<string, { productId: string; title: string; variations: number }>()
  for (const row of rows) {
    const productId = row.productId ?? row.variantId
    const product = products.get(productId) ?? {
      productId,
      title: row.productTitle ?? row.buyerSku ?? "Untitled product",
      variations: 0
    }
    product.variations++
    products.set(productId, product)
  }
  return [...products.values()]
    .map((product) => ({ ...product, productLabel: defaults.get(product.productId)?.productLabel ?? "standard" }))
    .toSorted((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }))
}
