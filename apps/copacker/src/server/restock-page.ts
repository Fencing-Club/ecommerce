import { usMarketplaceId } from "@repo/copacker-marketplaces/amazon-marketplaces"
import { locationIdSchema } from "@repo/copacker-marketplaces/shopify"
import { and, desc, eq, inArray, isNull } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { connections, orders, salesSyncs, supplierProducts, suppliers } from "@/db/schema"
import { LocalizedError } from "@/i18n/errors"
import type { Store } from "@/lib/stores"
import { requestInput } from "./errors"
import { inventoryContext } from "./inventory-context"
import { inventoryLocations } from "./inventory-products"
import type { ProductDefaults } from "./product-defaults"
import { readProductDefaults } from "./product-defaults"
import { restockPlan, type RestockSupplier } from "./restock-plan"
import { dayRange } from "./restock-report"
import { resolveRestockSupplier } from "./restock-supplier"
import type { DemandRow } from "./sales-attribution"
import { restockDemand } from "./sales-orders"
import { stockoutDays } from "./stock-days"
import type { Session } from "./workspace-session"

const days = z.number().int().min(dayRange.min).max(dayRange.max)
export const restockInputSchema = z.strictObject({
  days,
  leadTimeDays: days,
  channel: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("amazon") }),
    z.strictObject({ kind: z.literal("shopify"), locationId: locationIdSchema })
  ]),
  // Every supplier, one supplier's products, or products never ordered from a supplier.
  supplier: z.union([z.literal("all"), z.uuid()]).default("all")
})

export class RestockInputError extends LocalizedError {}

type InventoryContext = Awaited<ReturnType<typeof inventoryContext>>
export type RestockChannelOption = {
  key: string
  label: string
  channel: z.infer<typeof restockInputSchema>["channel"]
}

// The channels a buyer can restock: Amazon once its stock has synced, and each Shopify location it counts.
export async function restockChannels(orgId: string) {
  return (await restockChannelDiscovery(orgId)).channels
}

export async function restockChannelDiscovery(orgId: string) {
  const context = await inventoryContext(orgId)
  return { channels: channelsIn(context), catalogAvailable: context.data !== null }
}

function channelsIn(context: InventoryContext) {
  const channels: RestockChannelOption[] = []
  if (context.fbaRows || context.awdRows) {
    channels.push({ key: "amazon", label: "Amazon", channel: { kind: "amazon" } })
  }
  for (const location of inventoryLocations(context.rows, context.classifications)) {
    if (location.classification === "merchant") {
      channels.push({
        key: `shopify:${location.id}`,
        label: location.name,
        channel: { kind: "shopify", locationId: location.id }
      })
    }
  }
  return channels
}

// The buyer's suppliers with their lead times, and each variation's supplier. The product's supplier comes first (the
// stored stock names it, matched to a supplier by name or Shopify name, else ordered outside Copacker); then the
// supplier chosen in Copacker, the one it was last ordered from, or the one linked supplier whose active catalog holds
// its supplier SKU.
export async function supplierLookup(
  orgId: string,
  catalog: { variantId: string; productId?: string; supplierSku?: string | null; supplierName?: string | null }[],
  chosen: ReadonlyMap<string, { supplierId: string | null }>
) {
  const [links, history] = await Promise.all([
    db()
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.buyerOrgId, orgId), isNull(suppliers.removedAt)))
      .orderBy(suppliers.name),
    db()
      .select({ supplierId: orders.supplierId, data: orders.data })
      .from(orders)
      .where(eq(orders.buyerOrgId, orgId))
      .orderBy(desc(orders.createdAt))
  ])
  const list: RestockSupplier[] = links.map((link) => ({
    id: link.id,
    name: link.name,
    leadTimeDays: link.leadTimeDays
  }))
  const byId = new Map(list.map((supplier) => [supplier.id, supplier]))
  const byVariant = new Map<string, RestockSupplier>()
  const external = new Map<string, string>()
  const byShopifyName = new Map<string, RestockSupplier>()
  for (const link of links) {
    for (const name of [link.name, link.shopifySupplierName]) {
      if (name?.trim()) {
        byShopifyName.set(name.trim().toLowerCase(), byId.get(link.id)!)
      }
    }
  }
  for (const row of catalog) {
    if (row.supplierName) {
      const supplier = byShopifyName.get(row.supplierName.trim().toLowerCase())
      if (supplier) {
        byVariant.set(row.variantId, supplier)
      } else {
        external.set(row.variantId, row.supplierName)
      }
    }
  }
  // Without one in Shopify, the supplier the buyer chose for the product comes first.
  for (const row of catalog) {
    if (byVariant.has(row.variantId) || external.has(row.variantId)) {
      continue
    }
    const supplierId = row.productId ? chosen.get(row.productId)?.supplierId : null
    const supplier = supplierId ? byId.get(supplierId) : undefined
    if (supplier) {
      byVariant.set(row.variantId, supplier)
    }
  }
  for (const order of history) {
    const supplier = byId.get(order.supplierId)
    if (!supplier) {
      continue
    }
    for (const item of order.data.items) {
      if (!byVariant.has(item.variantId) && !external.has(item.variantId)) {
        byVariant.set(item.variantId, supplier)
      }
    }
  }
  const supplierOrgIds = links.flatMap((link) => (link.supplierOrgId ? [link.supplierOrgId] : []))
  const products = supplierOrgIds.length
    ? await db().select().from(supplierProducts).where(inArray(supplierProducts.supplierOrgId, supplierOrgIds))
    : []
  for (const row of catalog) {
    if (byVariant.has(row.variantId) || external.has(row.variantId) || !row.supplierSku) {
      continue
    }
    const resolved = resolveRestockSupplier({ supplierSku: row.supplierSku, currency: "USD" }, links, products)
    const supplier = resolved.supplierId ? byId.get(resolved.supplierId) : undefined
    if (supplier) {
      byVariant.set(row.variantId, supplier)
    }
  }
  return {
    list,
    supplierFor: (variantId: string) => byVariant.get(variantId) ?? null,
    externalSupplierFor: (variantId: string) => external.get(variantId) ?? null
  }
}

// Stockout days per item over the channel's sales period: FBA by seller SKU (from Amazon's ledger and stock syncs),
// or one Shopify location by variant (from stock syncs since Copacker started recording them).
async function channelStockouts(
  orgId: string,
  channel: z.infer<typeof restockInputSchema>["channel"],
  catalog: { variantId: string; buyerSku: string | null }[],
  sources: {
    source: Store
    window: { from: string; to: string } | null
    saleDays: ReadonlyMap<string, ReadonlySet<string>>
  }[]
) {
  const source = channel.kind === "amazon" ? "amazon" : "shopify"
  const sales = sources.find((row) => row.source === source)
  const window = sales?.window
  const [account] = await db()
    .select({ externalId: connections.externalId })
    .from(connections)
    .where(and(eq(connections.orgId, orgId), eq(connections.provider, source)))
  if (!window || !account) {
    return new Map<string, number>()
  }
  const range = { from: new Date(window.from), to: new Date(window.to) }
  if (channel.kind === "shopify") {
    return stockoutDays({
      orgId,
      externalAccountId: account.externalId,
      pool: "shopify",
      scope: channel.locationId,
      itemKeys: catalog.map((row) => row.variantId),
      ...range,
      saleDays: sales?.saleDays
    })
  }
  const [sync] = await db()
    .select({ from: salesSyncs.stockCoveredFrom, to: salesSyncs.stockCoveredTo })
    .from(salesSyncs)
    .where(and(eq(salesSyncs.orgId, orgId), eq(salesSyncs.source, "amazon")))
  return stockoutDays({
    orgId,
    externalAccountId: account.externalId,
    pool: "fba",
    scope: usMarketplaceId,
    itemKeys: [...new Set(catalog.flatMap((row) => (row.buyerSku ? [row.buyerSku] : [])))],
    ...range,
    saleDays: sales?.saleDays,
    ledger: sync?.from && sync.to ? { from: sync.from, to: sync.to } : null
  })
}

// Everything restock reads once for a buyer, shared by every channel: stock, orders over the sales period, suppliers
// and product defaults.
async function restockInputs(orgId: string, days: number) {
  const context = await inventoryContext(orgId)
  const connected = await db()
    .select({ id: connections.id, provider: connections.provider, accountId: connections.externalId })
    .from(connections)
    .where(eq(connections.orgId, orgId))
  const productDefaults: Map<string, ProductDefaults> = context.domain
    ? await readProductDefaults(orgId, context.domain)
    : new Map()
  const [demand, lookup] = await Promise.all([
    restockDemand(
      orgId,
      connected.map((row) => row.provider),
      days
    ),
    supplierLookup(orgId, context.rows, productDefaults)
  ])
  const merchant = inventoryLocations(context.rows, context.classifications)
    .filter((location) => location.classification === "merchant")
    .map((location) => location.id)
  return {
    orgId,
    days,
    context,
    productDefaults,
    demand,
    lookup,
    connected,
    ebayLocationId: demand.ebaySales ? ebayLocation(demand.shopifySales?.rows ?? [], merchant) : null
  }
}

// The Shopify location eBay orders count at. eBay doesn't say where an order shipped from, so its orders count where
// the store ships most of its own: the counted location that shipped the most Shopify units over the sales period, or
// the only one there is.
export function ebayLocation(shopifyRows: readonly DemandRow[], merchantLocations: readonly string[]) {
  const shipped = new Map<string, number>()
  for (const row of shopifyRows) {
    if (row.pool === "shopify" && row.locationId && merchantLocations.includes(row.locationId)) {
      shipped.set(row.locationId, (shipped.get(row.locationId) ?? 0) + row.fulfilledUnits)
    }
  }
  const busiest = [...shipped].toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0]
  return busiest ?? (merchantLocations.length === 1 ? merchantLocations[0]! : null)
}

async function channelPlan(
  inputs: Awaited<ReturnType<typeof restockInputs>>,
  channel: z.infer<typeof restockInputSchema>["channel"],
  leadTimeDays: number
) {
  const { context, demand } = inputs
  const stockouts = await channelStockouts(inputs.orgId, channel, context.rows, demand.sources)
  return restockPlan({
    channel,
    catalog: context.rows,
    classifications: context.classifications,
    onOrder: context.onOrder,
    shopifySales: demand.shopifySales,
    amazonSales: demand.amazonSales,
    ebaySales: demand.ebaySales,
    ebayLocationId: inputs.ebayLocationId,
    fbaRows: context.fbaRows,
    awdRows: context.awdRows,
    salesDays: inputs.days,
    leadTimeDays,
    productDefaults: inputs.productDefaults,
    supplierFor: inputs.lookup.supplierFor,
    externalSupplierFor: inputs.lookup.externalSupplierFor,
    // Amazon history is by seller SKU, Shopify's by variant.
    stockoutsFor: (variantId, sku) => stockouts.get(channel.kind === "amazon" ? (sku ?? "") : variantId) ?? 0
  })
}

// Restock suggestions for one channel from stored orders, current stock and open POs.
export async function restockReport(s: Session, raw: unknown) {
  const input = requestInput(restockInputSchema, raw)
  const inputs = await restockInputs(s.org.id, input.days)
  const { context } = inputs
  const { channel } = input
  if (
    channel.kind === "shopify" &&
    !inventoryLocations(context.rows, context.classifications).some(
      (location) => location.id === channel.locationId && location.classification === "merchant"
    )
  ) {
    throw new RestockInputError("chooseIncludedLocation")
  }
  if (channel.kind === "amazon" && !context.fbaRows && !context.awdRows) {
    throw new RestockInputError("syncAmazonBeforeRestock")
  }
  const plan = await channelPlan(inputs, channel, input.leadTimeDays)
  // Restock lists products with a supplier, in Copacker or in Shopify; the Products page warns about the rest.
  const lines = plan.filter((line) =>
    input.supplier === "all"
      ? line.supplier !== null || line.externalSupplier !== null
      : line.supplier?.id === input.supplier
  )
  const needsSupplier = plan.filter(
    (line) =>
      line.supplier === null &&
      line.externalSupplier === null &&
      (line.status === "stockout" || line.status === "reorder")
  ).length
  const salesSources: Store[] =
    channel.kind === "amazon"
      ? ["amazon"]
      : ["shopify", ...(channel.locationId === inputs.ebayLocationId ? (["ebay"] as const) : [])]
  return {
    days: input.days,
    leadTimeDays: input.leadTimeDays,
    channel,
    supplier: input.supplier,
    // Products that need reordering here but have no supplier, so they aren't listed.
    needsSupplier,
    suppliers: inputs.lookup.list,
    sources: inputs.demand.sources
      .filter((source) => salesSources.includes(source.source))
      .map(({ saleDays: _saleDays, ...source }) => source),
    lines
  }
}

// Restock suggestions for every channel at once, for the Overview: each channel's lines and each source's read.
// Days each item was out of stock in `period`, by restock channel key: Amazon's by seller SKU, Shopify's by variant.
// The Overview values the sales these cost over its own period rather than restock's.
export async function periodStockouts(
  orgId: string,
  restock: Awaited<ReturnType<typeof restockAllChannels>>,
  period: { from: Date; to: Date }
) {
  const window = { from: period.from.toISOString(), to: period.to.toISOString() }
  const sources = restock.saleDays.map((row) => ({ ...row, window }))
  const entries = await Promise.all(
    restock.channels.map(
      async (channel) =>
        [channel.key, await channelStockouts(orgId, channel.channel, restock.catalog, sources)] as const
    )
  )
  return new Map(entries)
}

export async function restockAllChannels(orgId: string, days: number, leadTimeDays: number) {
  const inputs = await restockInputs(orgId, days)
  const channels = await Promise.all(
    channelsIn(inputs.context).map(async (option) => ({
      ...option,
      lines: await channelPlan(inputs, option.channel, leadTimeDays)
    }))
  )
  return {
    channels,
    evidence: {
      snapshots: inputs.context.snapshots,
      connections: inputs.connected,
      suppliers: inputs.lookup.list,
      onOrder: inputs.context.onOrder,
      catalogAvailable: inputs.context.data !== null
    },
    sources: inputs.demand.sources.map(({ saleDays: _saleDays, ...source }) => source),
    // The days each item sold, by source, for counting stockout days over another period (see periodStockouts).
    saleDays: inputs.demand.sources.map(({ source, saleDays }) => ({ source, saleDays })),
    // The Shopify catalog behind the lines: costs, prices and bundle components by variant.
    catalog: inputs.context.rows,
    // The Shopify location eBay orders count at (see ebayLocation), or null without one.
    ebayLocationId: inputs.ebayLocationId
  }
}
