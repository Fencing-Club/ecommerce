import { randomUUID } from "node:crypto"
import type { OrderInput } from "@repo/aisle"
import { combinePdfs } from "@repo/aisle/documents"
import { splitPdfPages } from "@repo/aisle/labels"
import { labelTitle, standardProductLabels, suffocationWarningLabels } from "@repo/aisle/product-labels"
import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { connections, productBarcodes, stockSnapshots } from "@/db/schema"
import { accessibleOrder } from "./access"
import type { Session } from "./auth"
import { amazonFor, shopifyFor } from "./connections"
import { inventoryContext } from "./inventory-context"
import { isCollective } from "./inventory-products"
import { type ProductDefaults, readProductDefaults } from "./product-defaults"
import { describeError } from "./stock"
import { deleteFile, getFile, putFile, validatePdf } from "./storage"

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

// Whether a product needs no label on a PO: it's set to "No label" and the PO doesn't go to Amazon, which labels every
// unit with its FNSKU.
const labelFree = (
  defaults: ReadonlyMap<string, ProductDefaults>,
  productId: string | undefined,
  destination: OrderInput["destination"]
) => productId !== undefined && defaults.get(productId)?.productLabel === "none" && destination !== "amazon"

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

// Each variation's countries of origin, for the label's "Made in" line: the one Shopify records on its inventory item,
// or for a bundle, which has no inventory item of its own, its components' in order.
async function countriesOfOrigin(orgId: string, domain: string, variantIds: string[]) {
  if (!variantIds.length) {
    return []
  }
  try {
    const shopify = await shopifyFor(orgId, domain)
    // Shopify returns at most 250 nodes a request.
    const lookup = async (ids: string[]) => {
      const found = []
      for (const batch of chunks(ids, 250)) {
        found.push(...(await shopify.variants(batch)))
      }
      return found.flatMap((variant) => (variant ? [variant] : []))
    }
    const variants = await lookup(variantIds)
    const componentIds = (variant: (typeof variants)[number]) =>
      variant.inventoryItem.countryCodeOfOrigin
        ? []
        : variant.productVariantComponents.nodes.map((component) => component.productVariant.id)
    const components = new Map(
      (await lookup([...new Set(variants.flatMap(componentIds))])).map((variant) => [
        variant.id,
        variant.inventoryItem.countryCodeOfOrigin ?? null
      ])
    )
    return variants.map((variant) => {
      const own = variant.inventoryItem.countryCodeOfOrigin
      const codes = own ? [own] : componentIds(variant).flatMap((id) => components.get(id) ?? [])
      return [variant.id, codes] as const
    })
  } catch (error) {
    console.error(JSON.stringify({ event: "label_origin_lookup_failed", orgId, error: describeError(error) }))
    throw new ProductBarcodeError("Shopify couldn't be reached to look up the country of origin. Try again.", 409)
  }
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

// What a PO line prints as its product label. It's worked out from the product whenever it's needed, so it follows
// changes to the product's barcode, label setting, title or FNSKU: an uploaded label, the standard FNSKU (or SKU)
// label, none, or why there's none yet.
export type LineLabel =
  | { itemId: string; state: "uploaded"; name: string; objectKey: string }
  | { itemId: string; state: "standard"; variantId: string; code: string; title: string }
  | { itemId: string; state: "none" }
  | { itemId: string; state: "missing"; problem: string }

type LabelOrder = { buyerOrgId: string; shopifyDomain: string; data: OrderInput }

export async function lineLabels(order: LabelOrder): Promise<LineLabel[]> {
  const variantIds = [...new Set(order.data.items.map((item) => item.variantId))]
  const [barcodes, defaults, rows] = await Promise.all([
    db()
      .select()
      .from(productBarcodes)
      .where(
        and(
          eq(productBarcodes.orgId, order.buyerOrgId),
          eq(productBarcodes.shopifyDomain, order.shopifyDomain),
          inArray(productBarcodes.variantId, variantIds)
        )
      ),
    readProductDefaults(order.buyerOrgId, order.shopifyDomain),
    storeRows(order.buyerOrgId, order.shopifyDomain)
  ])
  // Amazon only accepts its FNSKU, which is filled in when the PO is sent. Other destinations print the Shopify SKU
  // when there's no FNSKU, such as for a product Amazon doesn't list or a store without Amazon.
  const forAmazon = order.data.destination === "amazon"
  return order.data.items.map((item): LineLabel => {
    const barcode = barcodes.find((row) => row.variantId === item.variantId)
    const productId = rows.find((row) => row.variantId === item.variantId)?.productId
    if (barcode) {
      return { itemId: item.id, state: "uploaded", name: barcode.name, objectKey: barcode.objectKey }
    }
    // A line set to go without its label skips it, except to Amazon, which needs every unit labeled.
    const unlabeled =
      item.skuLabel === undefined ? labelFree(defaults, productId, order.data.destination) : !item.skuLabel
    if (unlabeled && !forAmazon) {
      return { itemId: item.id, state: "none" }
    }
    if (needsUpload(defaults, productId)) {
      return { itemId: item.id, state: "missing", problem: "Upload its label on the Products page" }
    }
    const code = item.fnsku || (forAmazon ? "" : item.buyerSku)
    if (!code) {
      return { itemId: item.id, state: "missing", problem: "Its FNSKU is looked up when the purchase order is sent" }
    }
    return {
      itemId: item.id,
      state: "standard",
      variantId: item.variantId,
      code,
      title: labelTitle(item.name, item.variant)
    }
  })
}

// The label files for the given lines, in their order: uploaded labels as they are, standard labels made now with the
// "Made in" line Shopify records. Lines with no label are left out.
export async function lineLabelFiles(order: LabelOrder, labels: LineLabel[]) {
  const standard = labels.flatMap((label) => (label.state === "standard" ? [label] : []))
  const origins = new Map(
    await countriesOfOrigin(
      order.buyerOrgId,
      order.shopifyDomain,
      standard.map((label) => label.variantId)
    )
  )
  const files: Array<{ itemId: string; name: string; bytes: Uint8Array }> = []
  for (const label of labels) {
    if (label.state === "uploaded") {
      files.push({ itemId: label.itemId, name: label.name, bytes: await getFile(label.objectKey) })
    } else if (label.state === "standard") {
      const bytes = await standardProductLabels({
        code: label.code,
        title: label.title,
        countryOfOrigin: origins.get(label.variantId) ?? null
      })
      files.push({ itemId: label.itemId, name: labelFileName(label.title), bytes })
    }
  }
  return files
}

// One sheet of suffocation warning labels when any of the lines needs them, for the supplier to print as many as it
// bags; null when none does.
export async function warningLabelFile(items: readonly Pick<OrderInput["items"][number], "suffocationWarning">[]) {
  return items.some((item) => item.suffocationWarning)
    ? { name: "Suffocation warning labels.pdf", bytes: await suffocationWarningLabels() }
    : null
}

// The lines of a PO the workspace can see whose product can't make a label yet.
export async function linesMissingLabels(s: Session, orderId: string) {
  const { order } = await accessibleOrder(s, orderId)
  return new Set((await lineLabels(order)).flatMap((label) => (label.state === "missing" ? [label.itemId] : [])))
}

// One PO line's product label, for downloading from the PO.
export async function orderLineLabel(s: Session, orderId: string, itemId: string) {
  const { order } = await accessibleOrder(s, orderId)
  const label = (await lineLabels(order)).find((row) => row.itemId === itemId)
  if (!label) {
    throw new ProductBarcodeError("This line isn't on the purchase order", 404)
  }
  if (label.state === "none") {
    throw new ProductBarcodeError("This product doesn't need a label", 404)
  }
  if (label.state === "missing") {
    throw new ProductBarcodeError(label.problem, 404)
  }
  const [file] = await lineLabelFiles(order, [label])
  return file!
}

// All of a PO's product labels in one PDF, in the PO's line order, then its suffocation warning labels, for printing
// them together.
export async function orderLabelsPdf(s: Session, orderId: string) {
  const { order } = await accessibleOrder(s, orderId)
  const files = await lineLabelFiles(order, await lineLabels(order))
  const warnings = await warningLabelFile(order.data.items)
  if (warnings) {
    files.push({ itemId: "", ...warnings })
  }
  if (!files.length) {
    throw new ProductBarcodeError("This purchase order has no product labels", 404)
  }
  return {
    name: labelFileName(`${order.data.reference} product labels`),
    bytes: await combinePdfs(files.map((file) => file.bytes))
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
  // Shopify Collective items are partners' stock, with nothing to label.
  for (const row of rows.filter((item) => !isCollective(item))) {
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
