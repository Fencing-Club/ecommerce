import { randomUUID } from "node:crypto"
import { variantIdSchema, variantName } from "@repo/copacker-marketplaces/shopify"
import { type Destination, type OrderInput } from "@repo/copacker-orders"
import { orderDestination } from "@repo/copacker-shipments"
import { combinePdfs } from "@repo/copacker-shipments/documents"
import { splitPdfPages } from "@repo/copacker-shipments/labels"
import { labelTitle, standardProductLabels, suffocationWarningLabels } from "@repo/copacker-shipments/product-labels"
import { needsWarningLabel } from "@repo/copacker-shipments/requirements"
import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/db"
import { connections, productBarcodes, shipments, stockSnapshots } from "@/db/schema"
import { LocalizedError, NotFoundError, type ErrorKey } from "@/i18n/errors"
import { accessibleOrder } from "./access"
import { requireAccess, requireBuyer } from "./authorization"
import { amazonFor, shopifyFor } from "./connections"
import { errorText, StatusError } from "./errors"
import { inventoryContext } from "./inventory-context"
import { isCollective } from "./inventory-products"
import { queueLabels, type QueuedLabels } from "./label-release"
import type { ProductDefaults } from "./product-defaults"
import { readProductDefaults } from "./product-defaults"
import { describeError } from "./stock"
import { deleteFile, getFile, putFile, validatePdf } from "./storage"
import type { Session } from "./workspace-session"

// What the products page shows about a variation's saved barcode.
export type ProductBarcode = { name: string; bytes: number; uploadedAt: string }

const maxBytes = 32 * 1024 * 1024

async function shopifyDomain(s: Session) {
  requireBuyer(s)
  const [account] = await db()
    .select({ domain: connections.externalId })
    .from(connections)
    .where(and(eq(connections.orgId, s.org.id), eq(connections.provider, "shopify")))
  if (!account) {
    throw new StatusError("connectShopifyBeforeEditing", 409)
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
  destination: Destination
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
      throw new StatusError("productNotSynced", 404)
    }
    return row
  }
  if (!sku) {
    throw new StatusError("enterVariationSku", 400)
  }
  const matches = rows.filter((item) => item.buyerSku?.trim().toLowerCase() === sku.toLowerCase())
  if (matches.length > 1) {
    throw new StatusError("skuShared", 409, { count: matches.length, sku })
  }
  if (!matches[0]?.productId) {
    throw new StatusError("noVariationWithSku", 404, { sku })
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
    throw new StatusError("chooseVariation", 400)
  }
  const file = form.get("file")
  if (!(file instanceof File) || file.size > maxBytes) {
    throw new StatusError("choosePdfUnder32", 400)
  }
  const rawSku = form.get("sku")
  const sku = typeof rawSku === "string" && rawSku.trim() ? rawSku.trim() : skuFromFileName(file.name)
  const row = resolveVariant(await storeRows(s.org.id, domain), variantId?.data ?? null, sku.slice(0, 255))
  const bytes = new Uint8Array(await file.arrayBuffer())
  try {
    await validatePdf(bytes)
  } catch (error) {
    throw error instanceof LocalizedError
      ? new StatusError(error.key, 400, error.values)
      : new StatusError("uploadPdfUnder32", 400)
  }
  if ((await splitPdfPages(bytes)).length !== 1) {
    throw new StatusError("barcodeOnePage", 400)
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
  let saved: { replaced: string | null; labels: QueuedLabels }
  try {
    saved = await db().transaction(async (tx) => {
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
      // A product's barcode can complete the packets of the buyer's shipments that waited on it.
      return {
        replaced: previous?.objectKey ?? null,
        labels: await queueLabels(tx, { buyerOrgId: s.org.id, actor: s.user.id })
      }
    })
  } catch (error) {
    await discardFile(objectKey)
    throw error
  }
  const { replaced, labels } = saved
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
      product: row.productTitle,
      variant: variantName(row.variantTitle)
    } satisfies BarcodeTarget,
    // The job that sends any packets the barcode completed, for the caller to send straight away.
    labels
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
type LabelFile = { variantId: string; name: string; bytes: Uint8Array } | { variantId: string; problem: ErrorKey }

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
  const problems = new Map<string, ErrorKey>()
  const standard: StockRow[] = []
  for (const id of ids) {
    if (uploads.some((upload) => upload.variantId === id)) {
      continue
    }
    const row = context.rows.find((item) => item.variantId === id)
    if (!row) {
      problems.set(id, "productNotSynced")
    } else if (needsUpload(defaults, row.productId)) {
      problems.set(id, "productNeedsUploadedLabel")
    } else if (!row.buyerSku) {
      problems.set(id, "variationNoSku")
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
      const title = labelTitle(row.productTitle, row.variantTitle ?? null)
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
    throw new StatusError(file?.problem ?? "variationNoLabel", 404)
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
      throw new StatusError("amazonFnskuUnreachable", 409)
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
    throw new StatusError("shopifyOriginUnreachable", 409)
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
// label, none, or why there's none yet: its key under the "errors" messages, and that message in the request's language.
// Each barcode label is a SKU or FNSKU label, which the supplier can download on its own.
export type LineLabel =
  | { itemId: string; type: BarcodeType; state: "uploaded"; name: string; objectKey: string }
  | { itemId: string; type: BarcodeType; state: "standard"; variantId: string; code: string; title: string }
  | { itemId: string; state: "none" }
  | { itemId: string; type: BarcodeType; state: "missing"; problem: string; problemKey: ErrorKey }
type BarcodeType = "sku" | "fnsku"

type LabelOrder = { buyerOrgId: string; shopifyDomain: string; data: OrderInput }

export function hasProductLabels(items: OrderInput["items"], labels: LineLabel[], included: ReadonlySet<string>) {
  return (
    labels.some((label) => included.has(label.itemId) && (label.state === "standard" || label.state === "uploaded")) ||
    items.some((item) => included.has(item.id) && needsWarningLabel(item))
  )
}

export async function lineLabels(order: LabelOrder): Promise<LineLabel[]> {
  const t = await errorText()
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
  const forAmazon = orderDestination(order.data) === "amazon"
  return order.data.items.flatMap((item): LineLabel[] => {
    const barcode = barcodes.find((row) => row.variantId === item.variantId)
    const productId = rows.find((row) => row.variantId === item.variantId)?.productId
    if (item.packingRequirements) {
      const required = item.packingRequirements.labels
      const labels: LineLabel[] = []
      if (required.includes("sku")) {
        labels.push({
          itemId: item.id,
          type: "sku",
          state: "standard",
          variantId: item.variantId,
          code: item.buyerSku,
          title: labelTitle(item.name, item.variant)
        })
      }
      if (required.includes("fnsku")) {
        if (barcode) {
          labels.push({
            itemId: item.id,
            type: "fnsku",
            state: "uploaded",
            name: barcode.name,
            objectKey: barcode.objectKey
          })
        } else if (item.fnsku) {
          labels.push({
            itemId: item.id,
            type: "fnsku",
            state: "standard",
            variantId: item.variantId,
            code: item.fnsku,
            title: labelTitle(item.name, item.variant)
          })
        } else {
          labels.push({
            itemId: item.id,
            type: "fnsku",
            state: "missing",
            problem: t("fnskuLookedUpOnSend"),
            problemKey: "fnskuLookedUpOnSend"
          })
        }
      }
      return labels.length ? labels : [{ itemId: item.id, state: "none" }]
    }
    // Without packing requirements, a line has one label: its FNSKU when it has one or ships to Amazon, else its SKU.
    const type = item.fnsku || forAmazon ? "fnsku" : "sku"
    if (barcode) {
      return [{ itemId: item.id, type, state: "uploaded", name: barcode.name, objectKey: barcode.objectKey }]
    }
    // A line set to go without its label skips it, except to Amazon, which needs every unit labeled.
    const unlabeled =
      item.skuLabel === undefined ? labelFree(defaults, productId, orderDestination(order.data)) : !item.skuLabel
    if (unlabeled && !forAmazon) {
      return [{ itemId: item.id, state: "none" }]
    }
    if (needsUpload(defaults, productId)) {
      return [
        {
          itemId: item.id,
          type,
          state: "missing",
          problem: t("uploadLabelOnProducts"),
          problemKey: "uploadLabelOnProducts"
        }
      ]
    }
    const code = item.fnsku || (forAmazon ? "" : item.buyerSku)
    if (!code) {
      return [
        {
          itemId: item.id,
          type,
          state: "missing",
          problem: t("fnskuLookedUpOnSend"),
          problemKey: "fnskuLookedUpOnSend"
        }
      ]
    }
    return [
      {
        itemId: item.id,
        type,
        state: "standard",
        variantId: item.variantId,
        code,
        title: labelTitle(item.name, item.variant)
      }
    ]
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
      standard
        .filter((label) => !order.data.items.find((item) => item.id === label.itemId)?.packingRequirements)
        .map((label) => label.variantId)
    )
  )
  const files: Array<{ itemId: string; name: string; bytes: Uint8Array }> = []
  for (const label of labels) {
    if (label.state === "uploaded") {
      files.push({ itemId: label.itemId, name: label.name, bytes: await getFile(label.objectKey) })
    } else if (label.state === "standard") {
      const requirements = order.data.items.find((item) => item.id === label.itemId)?.packingRequirements
      let countryOfOrigin = origins.get(label.variantId) ?? null
      if (requirements) {
        countryOfOrigin = requirements.labels.includes("countryOfOrigin") ? [requirements.countryCode] : null
      }
      const bytes = await standardProductLabels({
        code: label.code,
        title: label.title,
        countryOfOrigin
      })
      files.push({ itemId: label.itemId, name: labelFileName(label.title), bytes })
    }
  }
  return files
}

// One sheet of suffocation warning labels when any of the lines needs them, for the supplier to print as many as it
// bags; null when none does.
export async function warningLabelFile(
  items: readonly Pick<OrderInput["items"][number], "suffocationWarning" | "packingRequirements">[]
) {
  return items.some(needsWarningLabel)
    ? { name: "Suffocation warning labels.pdf", bytes: await suffocationWarningLabels() }
    : null
}

// The lines of a PO whose product can't make a label yet.
export async function linesMissingLabels(order: LabelOrder) {
  return new Set((await lineLabels(order)).flatMap((label) => (label.state === "missing" ? [label.itemId] : [])))
}

// One PO line's product label, for downloading from the PO.
export async function orderLineLabel(s: Session, orderId: string, itemId: string) {
  const { order } = await accessibleOrder(s, orderId)
  const labels = (await lineLabels(order)).filter((row) => row.itemId === itemId)
  const label = labels.find((row) => row.state === "missing") ?? labels[0]
  if (!label) {
    throw new StatusError("lineNotOnOrder", 404)
  }
  if (label.state === "none") {
    throw new StatusError("productNeedsNoLabel", 404)
  }
  if (label.state === "missing") {
    throw new StatusError(label.problemKey, 404)
  }
  const files = await lineLabelFiles(order, labels)
  return {
    ...files[0]!,
    bytes: files.length === 1 ? files[0]!.bytes : await combinePdfs(files.map((file) => file.bytes))
  }
}

// A shipment's product labels for whoever packs it, who may not open purchase orders: its SKU or FNSKU labels, the
// suffocation warning sheet, or all of them, for one line or every line the shipment carries.
export async function shipmentLabelsPdf(
  s: Session,
  shipmentId: string,
  { itemId, kind }: { itemId?: string; kind: "sku" | "fnsku" | "suffocation" | "all" }
) {
  requireAccess(s, "shipments")
  const [shipment] = await db().select().from(shipments).where(eq(shipments.id, shipmentId))
  if (!shipment) {
    throw new NotFoundError()
  }
  const { order } = await accessibleOrder(s, shipment.orderId)
  const data = shipment.snapshot ?? order.data
  const items = data.items.filter(
    (item) => (!shipment.amazonNetwork || item.receiver === shipment.amazonNetwork) && (!itemId || item.id === itemId)
  )
  if (itemId && !items.length) {
    throw new StatusError("lineNotOnOrder", 404)
  }
  const labels =
    kind === "suffocation"
      ? []
      : (await lineLabels({ ...order, data })).filter(
          (label) =>
            items.some((item) => item.id === label.itemId) &&
            (kind === "all" || (label.state !== "none" && label.type === kind))
        )
  const missing = labels.find((label) => label.state === "missing")
  if (itemId && kind !== "all" && missing?.state === "missing") {
    throw new StatusError(missing.problemKey, 404)
  }
  const files = await lineLabelFiles({ ...order, data }, labels)
  const warnings = kind === "all" || kind === "suffocation" ? await warningLabelFile(items) : null
  if (warnings) {
    files.push({ itemId: "", ...warnings })
  }
  if (!files.length) {
    // One line with nothing to print says why its label can't be made yet, rather than that it needs none.
    if (itemId && missing?.state === "missing") {
      throw new StatusError(missing.problemKey, 404)
    }
    throw new StatusError(itemId ? "productNeedsNoLabel" : "shipmentHasNoLabels", 404)
  }
  return {
    name: files.length === 1 ? files[0]!.name : labelFileName(`${data.reference} product labels`),
    bytes: files.length === 1 ? files[0]!.bytes : await combinePdfs(files.map((file) => file.bytes))
  }
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
    throw new StatusError("orderHasNoLabels", 404)
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
    throw new StatusError("tooManyLabelVariations", 400)
  }
  const files = await productLabelFiles(s, variantIds)
  const sheets = files.flatMap((file) => ("bytes" in file ? [file.bytes] : []))
  if (!sheets.length) {
    throw new StatusError("noVariationLabels", 404)
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
    const productId = row.productId
    const product = products.get(productId) ?? {
      productId,
      title: row.productTitle,
      variations: 0
    }
    product.variations++
    products.set(productId, product)
  }
  return [...products.values()]
    .map((product) => ({ ...product, productLabel: defaults.get(product.productId)?.productLabel ?? "standard" }))
    .toSorted((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }))
}
