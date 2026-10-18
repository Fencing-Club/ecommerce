import type { AmazonNetwork } from "@repo/aisle"
import type { OrderInput } from "@repo/aisle"
import type { Amazon } from "@repo/aisle/amazon"
import type { Shopify } from "@repo/aisle/shopify"
import type { LocationClassification } from "./inventory-locations"

type OrderItem = OrderInput["items"][number]
type StockRow = Awaited<ReturnType<Shopify["stock"]>>["rows"][number]
type Quantities = { available: number | null; onHand: number | null; incoming: number | null }
// "bundle": sold from its components' stock, so only Available (derived by Shopify) is meaningful.
// "untracked": Shopify doesn't count its stock, so no quantity is meaningful.
export type StockKind = "tracked" | "bundle" | "untracked"

export type PurchaseOrderLink = { id: string; reference: string }

// One variant's sellable units on one sent PO, and the Shopify locations that PO will stock.
export type PendingOrder = PurchaseOrderLink & {
  units: number
  locationIds: string[]
  destination: OrderInput["destination"]
}

// Sellable units on POs already sent to suppliers.
export type OnOrder = { units: number; orders: PurchaseOrderLink[] }

export type InventoryVariant = Quantities & {
  variantId: string
  // Null for a product's only variant, which Shopify names "Default Title".
  title: string | null
  sku: string | null
  imageUrl: string | null
  stock: StockKind
  onOrder: OnOrder
  // The least to keep at Amazon, kept in Copacker; 0 means not stocked there.
  amazonStockTarget: number | null
  levels: (Quantities & { locationId: string; locationName: string; classification: LocationClassification })[]
}

export type InventoryLocation = { id: string; name: string; classification: LocationClassification }

export type InventoryProduct = Quantities & {
  productId: string
  title: string
  imageUrl: string | null
  // A kind shared by every variation; "tracked" when they differ.
  stock: StockKind
  onOrder: OnOrder
  variants: InventoryVariant[]
}

// Adds the known values; null only when every value is unknown, so a missing count is never shown as zero.
function total(values: (number | null)[]) {
  const known = values.filter((value) => value !== null)
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null
}

const unknown: Quantities = { available: null, onHand: null, incoming: null }
const none: Quantities = { available: 0, onHand: 0, incoming: 0 }

function stockKind(row: StockRow): StockKind {
  if (row.bundle) {
    return "bundle"
  }
  return row.tracked ? "tracked" : "untracked"
}

function totals(items: Quantities[]): Quantities {
  return {
    available: total(items.map((item) => item.available)),
    onHand: total(items.map((item) => item.onHand)),
    incoming: total(items.map((item) => item.incoming))
  }
}

const nothingOnOrder: OnOrder = { units: 0, orders: [] }

// Where a PO's stock will appear: for a PO to Amazon, the FBA or AWD pool of each line's network, or the Shopify
// location a delivery address is linked to. A delivery address that isn't linked counts only toward "All locations".
const networkPools: Record<AmazonNetwork, string> = { fba: "amazon:fba", awd_us: "amazon:awd" }
export function receivingLocations(
  order: Pick<OrderInput, "destination" | "deliveryId"> & { items: Pick<OrderItem, "amazonNetwork">[] },
  deliveryLocations: ReadonlyMap<string, string | null> = new Map()
) {
  if (order.destination === "amazon") {
    return [...new Set(order.items.map((item) => networkPools[item.amazonNetwork]))]
  }
  const linked = order.deliveryId ? deliveryLocations.get(order.deliveryId) : null
  return linked ? [linked] : []
}

// PO quantities are pieces; Shopify counts sellable units, which are sets of piecesPerSet pieces. Pieces already
// received (by PO item) are no longer on order.
export function onOrderByVariant(
  orders: {
    id: string
    data: Pick<OrderInput, "reference" | "destination" | "deliveryId"> & {
      items: Pick<OrderItem, "id" | "variantId" | "pieces" | "piecesPerSet" | "amazonNetwork">[]
    }
    received?: Record<string, number>
  }[],
  deliveryLocations: ReadonlyMap<string, string | null> = new Map()
) {
  const byVariant = new Map<string, PendingOrder[]>()
  for (const order of orders) {
    for (const item of order.data.items) {
      // Each line to Amazon stocks its own network's pool.
      const locationIds = receivingLocations({ ...order.data, items: [item] }, deliveryLocations)
      const pending = byVariant.get(item.variantId) ?? []
      const units = Math.floor(Math.max(0, item.pieces - (order.received?.[item.id] ?? 0)) / item.piecesPerSet)
      const existing = pending.find((entry) => entry.id === order.id)
      if (existing) {
        existing.units += units
      } else {
        pending.push({
          id: order.id,
          reference: order.data.reference,
          units,
          locationIds,
          destination: order.data.destination
        })
      }
      byVariant.set(item.variantId, pending)
    }
  }
  return byVariant
}

// Units on order for all locations, or only POs stocking the selected one.
function onOrderAt(pending: PendingOrder[], locationId: string | null | undefined): OnOrder {
  const orders = locationId ? pending.filter((entry) => entry.locationIds.includes(locationId)) : pending
  return {
    units: orders.reduce((sum, entry) => sum + entry.units, 0),
    orders: orders.map(({ id, reference }) => ({ id, reference }))
  }
}

function combineOnOrder(items: OnOrder[]): OnOrder {
  const orders = new Map(items.flatMap((item) => item.orders).map((link) => [link.id, link]))
  return { units: items.reduce((sum, item) => sum + item.units, 0), orders: [...orders.values()] }
}

// Amazon's stock pools, shown alongside Shopify's locations under these ids.
export const amazonPools = {
  fba: { id: "amazon:fba", name: "Amazon FBA" },
  awd: { id: "amazon:awd", name: "Amazon AWD" }
} as const
export function isAmazonPool(locationId: string) {
  return locationId === amazonPools.fba.id || locationId === amazonPools.awd.id
}

type FbaRow = Awaited<ReturnType<Amazon["fbaStock"]>>["rows"][number]
type AwdRow = Awaited<ReturnType<Amazon["awdStock"]>>["rows"][number]

// An Amazon seller SKU that matches no single Shopify variant, with what Amazon holds of it.
export type AmazonOnlyStock = { sku: string; fba: Quantities | null; awd: Quantities | null; resold: boolean }

// FBA can report a SKU more than once (by condition), so its rows add up.
function addQuantities(into: Map<string, Quantities>, sku: string, quantities: Quantities) {
  const current = into.get(sku)
  into.set(sku, current ? totals([current, quantities]) : quantities)
}

// Adds Amazon's FBA and AWD stock to the Shopify variants they belong to, as two more locations. Amazon's seller SKU
// must match exactly one Shopify variant's SKU; a multipack's SKU matches its Shopify bundle. Anything else is listed
// separately, including Amazon's resold-returns listings (seller SKUs starting "amzn.gr.").
export function withAmazonStock(rows: StockRow[], fba: FbaRow[] | null, awd: AwdRow[] | null) {
  const fbaBySku = new Map<string, Quantities>()
  for (const row of fba ?? []) {
    const details = row.inventoryDetails
    addQuantities(fbaBySku, row.sellerSku, {
      available: details?.fulfillableQuantity ?? null,
      onHand: row.totalQuantity,
      incoming: total([
        details?.inboundWorkingQuantity ?? null,
        details?.inboundShippedQuantity ?? null,
        details?.inboundReceivingQuantity ?? null
      ])
    })
  }
  const awdBySku = new Map<string, Quantities>()
  for (const row of awd ?? []) {
    addQuantities(awdBySku, row.sellerSku, {
      available: row.availableDistributable,
      onHand: row.onHand,
      incoming: row.inbound
    })
  }
  const skuCounts = new Map<string, number>()
  for (const row of rows) {
    if (row.buyerSku) {
      skuCounts.set(row.buyerSku, (skuCounts.get(row.buyerSku) ?? 0) + 1)
    }
  }
  const level = (pool: (typeof amazonPools)[keyof typeof amazonPools], quantities: Quantities) => ({
    locationId: pool.id,
    locationName: pool.name,
    available: quantities.available,
    onHand: quantities.onHand,
    incoming: quantities.incoming,
    committed: null
  })
  const matched = new Set<string>()
  const merged = rows.map((row) => {
    const sku = row.buyerSku
    if (!sku || skuCounts.get(sku) !== 1) {
      return row
    }
    const fbaStock = fbaBySku.get(sku),
      awdStock = awdBySku.get(sku)
    const pools = [
      ...(fbaStock ? [level(amazonPools.fba, fbaStock)] : []),
      ...(awdStock ? [level(amazonPools.awd, awdStock)] : [])
    ]
    if (!pools.length) {
      return row
    }
    matched.add(sku)
    return { ...row, levels: [...row.levels, ...pools] }
  })
  const amazonOnly: AmazonOnlyStock[] = [...new Set([...fbaBySku.keys(), ...awdBySku.keys()])]
    .filter((sku) => !matched.has(sku))
    .toSorted(byName)
    .map((sku) => ({
      sku,
      fba: fbaBySku.get(sku) ?? null,
      awd: awdBySku.get(sku) ?? null,
      resold: sku.startsWith("amzn.gr.")
    }))
  return { rows: merged, amazonOnly }
}

// Products per page the Products page offers.
export const pageSizes = [10, 25, 50, 100] as const

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })

const rank: Record<LocationClassification, number> = { merchant: 0, amazon_mirror: 1, unresolved: 2, excluded: 3 }

const classificationOf = (classifications: ReadonlyMap<string, LocationClassification>, locationId: string) =>
  classifications.get(locationId) ?? "unresolved"

// Every location in the snapshot with its classification; the store's own locations first.
export function inventoryLocations(
  rows: StockRow[],
  classifications: ReadonlyMap<string, LocationClassification>
): InventoryLocation[] {
  const locations = new Map<string, InventoryLocation>()
  for (const row of rows) {
    for (const level of row.levels) {
      locations.set(level.locationId, {
        id: level.locationId,
        name: level.locationName,
        classification: classificationOf(classifications, level.locationId)
      })
    }
  }
  const order = (location: InventoryLocation) => rank[location.classification]
  return [...locations.values()].toSorted((a, b) => order(a) - order(b) || byName(a.name, b.name))
}

// A Shopify Collective item: stocked only at partners' Collective locations, which partners stock and ship, so there's
// nothing to order, label or pack for it.
export function isCollective(row: StockRow) {
  return row.levels.length > 0 && row.levels.every((level) => level.locationKind === "shopify_collective")
}

export function groupInventory(
  rows: StockRow[],
  {
    locationId,
    query,
    classifications = new Map(),
    includeExcluded = false,
    everyProduct = false,
    onOrder = new Map()
  }: {
    locationId?: string | null
    query?: string | null
    classifications?: ReadonlyMap<string, LocationClassification>
    includeExcluded?: boolean
    // Keeps variants stocked only at uncounted locations, with none counted, instead of hiding them. Shopify Collective
    // items, which partners stock and ship, are still left out.
    everyProduct?: boolean
    onOrder?: ReadonlyMap<string, PendingOrder[]>
  } = {}
): InventoryProduct[] {
  const search = query?.trim().toLocaleLowerCase() ?? ""
  const products = new Map<string, InventoryProduct>()
  for (const row of rows) {
    // Only the locations the buyer counts as its own stock (and the Amazon pools) add up, unless asked for all.
    // Shopify's Amazon location mirrors FBA, which comes from Amazon directly, and Collective holds partners' stock.
    // A variant stocked only at uncounted locations is hidden with them, unless every product is asked for.
    const counted = includeExcluded
      ? row.levels
      : row.levels.filter((level) => (classifications.get(level.locationId) ?? "merchant") === "merchant")
    const levels = locationId ? counted.filter((level) => level.locationId === locationId) : counted
    const uncounted = row.levels.length > 0 && levels.length === 0
    if ((locationId && levels.length === 0) || (uncounted && !everyProduct) || (everyProduct && isCollective(row))) {
      continue
    }
    const title = row.productTitle
    const variantTitle = row.variantTitle && row.variantTitle !== "Default Title" ? row.variantTitle : null
    if (search && ![title, variantTitle, row.buyerSku].some((text) => text?.toLocaleLowerCase().includes(search))) {
      continue
    }
    const productId = row.productId
    const product = products.get(productId) ?? {
      productId,
      title,
      imageUrl: null,
      stock: "tracked" as StockKind,
      onOrder: nothingOnOrder,
      variants: [],
      available: null,
      onHand: null,
      incoming: null
    }
    product.imageUrl ??= row.imageUrl ?? null
    const stock = stockKind(row)
    const amazonLevels = levels.filter((level) => isAmazonPool(level.locationId))
    const variantTotals = {
      tracked: () => (uncounted ? none : totals(levels)),
      // Shopify reports a bundle's availability for the whole store, so it is unknown at any single Shopify location.
      // A multipack stocked at Amazon adds its own units.
      bundle: () => {
        if (locationId) {
          return isAmazonPool(locationId) ? totals(amazonLevels) : unknown
        }
        const pooled = totals(amazonLevels)
        return { ...pooled, available: total([row.bundle?.available ?? null, pooled.available]) }
      },
      // Shopify doesn't count it, but Amazon may hold some.
      untracked: () => (amazonLevels.length ? totals(amazonLevels) : unknown)
    }[stock]()
    product.variants.push({
      variantId: row.variantId,
      title: variantTitle,
      sku: row.buyerSku,
      imageUrl: row.imageUrl ?? null,
      stock,
      amazonStockTarget: row.amazonStockTarget ?? null,
      onOrder: onOrderAt(onOrder.get(row.variantId) ?? [], locationId),
      levels: levels.map(({ locationId: id, locationName, available, onHand, incoming }) => ({
        locationId: id,
        locationName,
        classification: classificationOf(classifications, id),
        available,
        onHand,
        incoming
      })),
      ...variantTotals
    })
    products.set(productId, product)
  }
  return [...products.values()]
    .map((product) => ({
      ...product,
      onOrder: combineOnOrder(product.variants.map((variant) => variant.onOrder)),
      stock: product.variants.every((variant) => variant.stock === product.variants[0]?.stock)
        ? (product.variants[0]?.stock ?? "tracked")
        : "tracked",
      variants: product.variants.toSorted((a, b) => byName(a.title ?? "", b.title ?? "")),
      ...totals(product.variants)
    }))
    .toSorted((a, b) => byName(a.title, b.title))
}
