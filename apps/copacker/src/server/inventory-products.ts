import type { OrderInput } from "@repo/aisle"
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

// AWD USA replenishes US FBA, which Shopify's Amazon location mirrors. AWD China stock is not in that mirror.
const amazonDestinations = new Set<OrderInput["destination"]>(["awd_us", "fba"])

// The Shopify locations a PO's stock will appear at. Amazon-bound stock shows at the locations mirroring Amazon, and
// stock sent to one of the buyer's delivery addresses at the Shopify location that address is linked to. Other
// destinations aren't linked to a Shopify location, so their units count only toward "All locations".
export function receivingLocations(
  order: Pick<OrderInput, "destination" | "deliveryId">,
  classifications: ReadonlyMap<string, LocationClassification>,
  deliveryLocations: ReadonlyMap<string, string | null> = new Map()
) {
  if (amazonDestinations.has(order.destination)) {
    return [...classifications].flatMap(([id, classification]) => (classification === "amazon_mirror" ? [id] : []))
  }
  const linked = order.destination === "warehouse" && order.deliveryId ? deliveryLocations.get(order.deliveryId) : null
  return linked ? [linked] : []
}

// PO quantities are pieces; Shopify counts sellable units, which are sets of piecesPerSet pieces. Pieces already
// received (by PO item) are no longer on order.
export function onOrderByVariant(
  orders: {
    id: string
    data: Pick<OrderInput, "reference" | "destination" | "deliveryId"> & {
      items: Pick<OrderItem, "id" | "variantId" | "pieces" | "piecesPerSet">[]
    }
    received?: Record<string, number>
  }[],
  classifications: ReadonlyMap<string, LocationClassification> = new Map(),
  deliveryLocations: ReadonlyMap<string, string | null> = new Map()
) {
  const byVariant = new Map<string, PendingOrder[]>()
  for (const order of orders) {
    const locationIds = receivingLocations(order.data, classifications, deliveryLocations)
    for (const item of order.data.items) {
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

// Products per page the Inventory page offers.
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

export function groupInventory(
  rows: StockRow[],
  {
    locationId,
    query,
    classifications = new Map(),
    includeExcluded = false,
    onOrder = new Map()
  }: {
    locationId?: string | null
    query?: string | null
    classifications?: ReadonlyMap<string, LocationClassification>
    includeExcluded?: boolean
    onOrder?: ReadonlyMap<string, PendingOrder[]>
  } = {}
): InventoryProduct[] {
  const search = query?.trim().toLocaleLowerCase() ?? ""
  const products = new Map<string, InventoryProduct>()
  for (const row of rows) {
    // Excluded locations, such as Shopify Collective partners' stock, are left out unless asked for. A variant stocked
    // only at excluded locations is hidden with them.
    const counted = includeExcluded
      ? row.levels
      : row.levels.filter((level) => classificationOf(classifications, level.locationId) !== "excluded")
    const levels = locationId ? counted.filter((level) => level.locationId === locationId) : counted
    if ((locationId || row.levels.length > 0) && levels.length === 0) {
      continue
    }
    const title = row.productTitle ?? row.buyerSku ?? "Untitled product"
    const variantTitle = row.variantTitle && row.variantTitle !== "Default Title" ? row.variantTitle : null
    if (search && ![title, variantTitle, row.buyerSku].some((text) => text?.toLocaleLowerCase().includes(search))) {
      continue
    }
    const productId = row.productId ?? row.variantId
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
    const variantTotals = {
      tracked: () => totals(levels),
      // Shopify reports a bundle's availability for the whole store, so it is unknown at any single location.
      bundle: () => ({ ...unknown, available: locationId ? null : (row.bundle?.available ?? null) }),
      untracked: () => unknown
    }[stock]()
    product.variants.push({
      variantId: row.variantId,
      title: variantTitle,
      sku: row.buyerSku,
      imageUrl: row.imageUrl ?? null,
      stock,
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
