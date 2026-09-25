import type { OrderInput } from "@repo/aisle"
import type { Shopify, ShopifyLocationKind } from "@repo/aisle/shopify"

type OrderItem = OrderInput["items"][number]
type StockRow = Awaited<ReturnType<Shopify["stock"]>>["rows"][number]
type Quantities = { available: number | null; onHand: number | null; incoming: number | null }
// "bundle": sold from its components' stock, so only Available (derived by Shopify) is meaningful.
// "untracked": Shopify doesn't count its stock, so no quantity is meaningful.
export type StockKind = "tracked" | "bundle" | "untracked"

export type PurchaseOrderLink = { id: string; reference: string }

// Sellable units on POs already sent to suppliers, per Shopify variant.
export type OnOrder = { units: number; orders: PurchaseOrderLink[] }

export type InventoryVariant = Quantities & {
  variantId: string
  // Null for a product's only variant, which Shopify names "Default Title".
  title: string | null
  sku: string | null
  imageUrl: string | null
  stock: StockKind
  onOrder: OnOrder
  levels: (Quantities & { locationId: string; locationName: string; locationKind: ShopifyLocationKind | null })[]
}

export type InventoryLocation = { id: string; name: string; kind: ShopifyLocationKind | null }

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

// PO quantities are pieces; Shopify counts sellable units, which are sets of piecesPerSet pieces.
export function onOrderByVariant(
  orders: {
    id: string
    data: Pick<OrderInput, "reference"> & { items: Pick<OrderItem, "variantId" | "pieces" | "piecesPerSet">[] }
  }[]
) {
  const byVariant = new Map<string, OnOrder>()
  for (const order of orders) {
    for (const item of order.data.items) {
      const current = byVariant.get(item.variantId) ?? { units: 0, orders: [] }
      current.units += Math.floor(item.pieces / item.piecesPerSet)
      if (!current.orders.some((link) => link.id === order.id)) {
        current.orders.push({ id: order.id, reference: order.data.reference })
      }
      byVariant.set(item.variantId, current)
    }
  }
  return byVariant
}

function combineOnOrder(items: OnOrder[]): OnOrder {
  const orders = new Map(items.flatMap((item) => item.orders).map((link) => [link.id, link]))
  return { units: items.reduce((sum, item) => sum + item.units, 0), orders: [...orders.values()] }
}

// Products per page the Inventory page offers.
export const pageSizes = [10, 25, 50, 100] as const

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })

// Every location in the snapshot with its kind; the store's own locations first. Kind is null for snapshots saved
// before location kinds were collected.
export function inventoryLocations(rows: StockRow[]): InventoryLocation[] {
  const locations = new Map<string, InventoryLocation>()
  for (const row of rows) {
    for (const level of row.levels) {
      locations.set(level.locationId, {
        id: level.locationId,
        name: level.locationName,
        kind: level.locationKind ?? null
      })
    }
  }
  const rank = { merchant: 0, fulfillment_service: 1, shopify_collective: 2 }
  const order = (location: InventoryLocation) => rank[location.kind ?? "merchant"]
  return [...locations.values()].toSorted((a, b) => order(a) - order(b) || byName(a.name, b.name))
}

export function groupInventory(
  rows: StockRow[],
  {
    locationId,
    query,
    includeCollective = false,
    onOrder = new Map()
  }: {
    locationId?: string | null
    query?: string | null
    includeCollective?: boolean
    onOrder?: Map<string, OnOrder>
  } = {}
): InventoryProduct[] {
  const search = query?.trim().toLocaleLowerCase() ?? ""
  const products = new Map<string, InventoryProduct>()
  for (const row of rows) {
    // Shopify Collective quantities belong to partner stores, so they are left out unless asked for. A variant stocked
    // only through Collective is a partner's product and is hidden with them.
    const counted = includeCollective
      ? row.levels
      : row.levels.filter((level) => level.locationKind !== "shopify_collective")
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
      onOrder: onOrder.get(row.variantId) ?? nothingOnOrder,
      levels: levels.map(({ locationId: id, locationName, locationKind, available, onHand, incoming }) => ({
        locationId: id,
        locationName,
        locationKind: locationKind ?? null,
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
