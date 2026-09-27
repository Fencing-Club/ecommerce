import { orderTotal, type OrderInput } from "@repo/aisle"
import { and, eq, sql } from "drizzle-orm"
import { db } from "@/db"
import {
  connections,
  contacts,
  events,
  inventoryLocationMappings,
  orders,
  productDefaults,
  salesSyncs,
  type ShipmentState,
  shipments,
  stockSnapshots,
  suppliers
} from "@/db/schema"
import { type CoverBucket, coverBucket, coverBuckets } from "@/lib/cover"
import { comparisons, rangeLabel, readPeriod } from "@/lib/date-range"
import { addDays, addMonths, zonedDay, zonedStart } from "@/lib/time-zone"
import { amazonFreightByOrder } from "./amazon-shipments"
import { receivingLocations } from "./inventory-products"
import { landedMarkupsFor } from "./landed-costs"
import { listMonthlyCosts, monthlyCostShares } from "./monthly-costs"
import {
  amazonFreight,
  catalogIndex,
  type ChargeLine,
  dailySales,
  grossProfit,
  movers,
  orderFees,
  otherMarketplaceOrders,
  periodTotal,
  platformCharges,
  platformFees,
  rangeBounds,
  reportingCurrency,
  salesByDay,
  shopifyCustomers,
  salesByItem,
  sellingPrices
} from "./overview-sales"
import { restockAllChannels } from "./restock-page"
import type { RestockLine } from "./restock-plan"
import { restockDefaults } from "./restock-report"
import { customerDataVersion, hasCustomerScope, salesDataVersion, type SalesSource, salesSources } from "./sales-orders"

const day = 86400000
// A sync that hasn't finished within this long is out of date.
const staleAfter = 2 * day
const amazonDestinations = new Set<string>(["fba", "awd_us", "awd_china", "amazon"])

export type Money = { currency: string; minor: number }[]
type Price = { minor: number; currency: string }

function addMoney(totals: Map<string, number>, currency: string | null | undefined, minor: number | null | undefined) {
  if (currency && minor) {
    totals.set(currency, (totals.get(currency) ?? 0) + minor)
  }
}

// Largest currency first, so the headline figure is the one most of the money is in.
function moneyList(totals: ReadonlyMap<string, number>): Money {
  return [...totals]
    .map(([currency, minor]) => ({ currency, minor }))
    .filter((entry) => entry.minor !== 0)
    .toSorted((a, b) => b.minor - a.minor)
}

type ChannelLines = { key: string; label: string; lines: RestockLine[] }

// What restock says across the chosen channels: stock and its value at cost and at retail, days of cover, lost
// sales, slow-moving stock, the items to reorder and what reordering them costs, and the best sellers.
// `priceFor` is what one unit sells for in a channel, when known.
export function summarizeRestock(
  channels: ChannelLines[],
  priceFor: (line: RestockLine, channelKey: string) => Price | null = () => null,
  // What one unit cost to land, when known. Restock's own unit cost by default; the Overview's includes PO landed costs
  // and prices a bundle held as its own item (such as a 2-pack at Amazon) from its components, which restock doesn't.
  unitCostFor: (line: RestockLine) => Price | null = (line) =>
    line.unitCostMinor !== null && line.costCurrency ? { minor: line.unitCostMinor, currency: line.costCurrency } : null
) {
  const reorderCost = new Map<string, number>()
  const stockValue = new Map<string, number>()
  const retailValue = new Map<string, number>()
  const lostValue = new Map<string, number>()
  const slowValue = new Map<string, number>()
  const cover = new Map<CoverBucket, Map<string, number>>(coverBuckets.map((bucket) => [bucket.key, new Map()]))
  const slow: {
    variantId: string
    channel: string
    channelKey: string
    product: string
    variant: string | null
    sku: string | null
    imageUrl: string | null
    available: number
    daysRemaining: number | null
    bucket: "over90" | "unsold"
    value: Price | null
  }[] = []
  let stockouts = 0,
    reorders = 0,
    blocked = 0,
    lostDays = 0,
    lostUnits = 0,
    itemsOut = 0,
    unitsOnHand = 0,
    uncosted = 0,
    unpriced = 0,
    reorderUncosted = 0
  const byChannel = channels.map((channel) => {
    const value = new Map<string, number>()
    const retail = new Map<string, number>()
    let available = 0,
      incoming = 0
    for (const line of channel.lines) {
      if (line.status === "not_stocked") {
        continue
      }
      if (line.status === "stockout") {
        stockouts++
      } else if (line.status === "reorder") {
        reorders++
      } else if (line.status === "blocked") {
        blocked++
      }
      if (line.status === "stockout" || line.status === "reorder") {
        if (line.estimatedCostMinor === null) {
          reorderUncosted++
        }
        addMoney(reorderCost, line.costCurrency, line.estimatedCostMinor)
      }
      const price = priceFor(line, channel.key)
      if (line.stockoutDays > 0) {
        lostDays += line.stockoutDays
        itemsOut++
        // Sales it would have made on the days it was out, at the rate it sold while in stock.
        if (line.sold) {
          const units = (line.stockoutDays * line.sold) / line.rateDays
          lostUnits += units
          if (price) {
            addMoney(lostValue, price.currency, Math.round(units * price.minor))
          }
        }
      }
      const bucket = coverBucket(line)
      if (bucket) {
        const counts = cover.get(bucket)!
        counts.set(channel.key, (counts.get(channel.key) ?? 0) + 1)
      }
      const onHand = Math.max(0, line.available ?? 0)
      available += onHand
      incoming += line.incoming ?? 0
      if (onHand > 0) {
        const unit = unitCostFor(line)
        const cost = unit ? Math.round(onHand * unit.minor) : null
        if (cost === null) {
          uncosted++
        } else {
          addMoney(value, unit!.currency, cost)
          addMoney(stockValue, unit!.currency, cost)
        }
        if (price) {
          addMoney(retail, price.currency, onHand * price.minor)
          addMoney(retailValue, price.currency, onHand * price.minor)
        } else {
          unpriced++
        }
        if (bucket === "over90" || bucket === "unsold") {
          if (cost !== null) {
            addMoney(slowValue, unit!.currency, cost)
          }
          slow.push({
            variantId: line.variantId,
            channel: channel.label,
            channelKey: channel.key,
            product: line.product,
            variant: line.variant,
            sku: line.sku,
            imageUrl: line.imageUrl,
            available: onHand,
            daysRemaining: line.daysRemaining,
            bucket,
            value: cost === null ? null : { minor: cost, currency: unit!.currency }
          })
        }
      }
    }
    unitsOnHand += available
    return {
      key: channel.key,
      label: channel.label,
      available,
      incoming,
      value: moneyList(value),
      retail: moneyList(retail)
    }
  })

  // Best sellers across channels, one row per variation.
  const sellers = new Map<
    string,
    Pick<RestockLine, "variantId" | "product" | "variant" | "sku" | "imageUrl"> & {
      sold: number
      available: number
      daysRemaining: number | null
      status: "stockout" | "reorder" | "stocked"
      channels: { key: string; label: string; sold: number }[]
    }
  >()
  const urgency = { stockout: 2, reorder: 1, stocked: 0 } as const
  for (const channel of channels) {
    for (const line of channel.lines) {
      if (!line.sold) {
        continue
      }
      const current = sellers.get(line.variantId) ?? {
        variantId: line.variantId,
        product: line.product,
        variant: line.variant,
        sku: line.sku,
        imageUrl: line.imageUrl,
        sold: 0,
        available: 0,
        daysRemaining: null,
        status: "stocked" as const,
        channels: []
      }
      const lineStatus = line.status === "stockout" || line.status === "reorder" ? line.status : "stocked"
      sellers.set(line.variantId, {
        ...current,
        sold: current.sold + line.sold,
        available: current.available + Math.max(0, line.available ?? 0),
        daysRemaining:
          line.daysRemaining === null
            ? current.daysRemaining
            : Math.min(current.daysRemaining ?? line.daysRemaining, line.daysRemaining),
        status: urgency[lineStatus] > urgency[current.status] ? lineStatus : current.status,
        channels: [...current.channels, { key: channel.key, label: channel.label, sold: line.sold }]
      })
    }
  }

  return {
    stockouts,
    reorders,
    blocked,
    reorderCost: moneyList(reorderCost),
    // Items due for a reorder whose cost can't be estimated, because Shopify has no unit cost for them.
    reorderUncosted,
    lostDays,
    lostUnits: Math.round(lostUnits),
    lostValue: moneyList(lostValue),
    itemsOut,
    unitsOnHand,
    stockValue: moneyList(stockValue),
    retailValue: moneyList(retailValue),
    // Items in stock without a unit cost, or without a selling price, left out of those values.
    uncosted,
    unpriced,
    channels: byChannel,
    cover: coverBuckets.map((bucket) => {
      const counts = cover.get(bucket.key)!
      return {
        ...bucket,
        items: [...counts.values()].reduce((sum, count) => sum + count, 0),
        // The channel holding most of the group's items, where Restock opens for it.
        channel: [...counts].toSorted((a, b) => b[1] - a[1])[0]?.[0] ?? null
      }
    }),
    slow: {
      items: slow.length,
      units: slow.reduce((sum, item) => sum + item.available, 0),
      value: moneyList(slowValue),
      top: slow
        .toSorted((a, b) => (b.value?.minor ?? -1) - (a.value?.minor ?? -1) || b.available - a.available)
        .slice(0, 6)
    },
    bestSellers: [...sellers.values()]
      .toSorted((a, b) => b.sold - a.sold)
      .slice(0, 8)
      .map((seller) => ({
        ...seller,
        // Restock opens on the channel it sells most in.
        channel: seller.channels.toSorted((a, b) => b.sold - a.sold)[0]?.key ?? null,
        channels: seller.channels.map((channel) => channel.label)
      }))
  }
}

// Shipments grouped by where they are, for the pipeline. Finished and cancelled shipments are left out.
export const shipmentStages = [
  { key: "you", label: "Waiting on you", states: ["approval", "waiting_labels"] },
  { key: "packing", label: "Supplier packing", states: ["packing", "correction"] },
  { key: "booking", label: "Booking with Amazon", states: ["queued", "creating"] },
  { key: "ready", label: "Ready for pickup", states: ["ready"] },
  { key: "transit", label: "On the way", states: ["collected"] },
  { key: "problem", label: "Needs attention", states: ["needs_attention"] }
] as const satisfies readonly { key: string; label: string; states: readonly ShipmentState[] }[]

export function shipmentPipeline(states: ShipmentState[]) {
  return shipmentStages.map((stage) => ({
    key: stage.key,
    label: stage.label,
    shipments: states.filter((state) => (stage.states as readonly ShipmentState[]).includes(state)).length
  }))
}

type PurchaseOrder = {
  status: "draft" | "submitted" | "closed"
  supplier: string
  data: OrderInput
  // When the PO was sent to its supplier; null for drafts.
  sentAt: Date | null
}

// Open and draft PO value, open value by supplier, and what was sent each month over the last year, by the month in
// the store's time zone.
export function purchasing(list: PurchaseOrder[], now: Date, timeZone: string) {
  const open = new Map<string, number>()
  const drafts = new Map<string, number>()
  const bySupplier = new Map<string, { orders: number; value: Map<string, number> }>()
  let openCount = 0,
    draftCount = 0
  for (const order of list) {
    const total = orderTotal(order.data)
    if (order.status === "submitted") {
      openCount++
      addMoney(open, order.data.currency, total)
      const supplier = bySupplier.get(order.supplier) ?? { orders: 0, value: new Map() }
      supplier.orders++
      addMoney(supplier.value, order.data.currency, total)
      bySupplier.set(order.supplier, supplier)
    } else if (order.status === "draft") {
      draftCount++
      addMoney(drafts, order.data.currency, total)
    }
  }
  // Months are counted in the currency most of the spend is in; spend in other currencies is reported apart.
  const sent = list.filter((order) => order.sentAt)
  const spendByCurrency = new Map<string, number>()
  for (const order of sent) {
    addMoney(spendByCurrency, order.data.currency, orderTotal(order.data))
  }
  const currency = moneyList(spendByCurrency)[0]?.currency ?? null
  const thisMonth = zonedDay(now, timeZone).slice(0, 7)
  const months = Array.from({ length: 12 }, (_, index) => addMonths(thisMonth, index - 11)).map((month) => ({
    month,
    minor: sent
      .filter((order) => order.data.currency === currency && zonedDay(order.sentAt!, timeZone).slice(0, 7) === month)
      .reduce((sum, order) => sum + orderTotal(order.data), 0)
  }))
  return {
    openCount,
    open: moneyList(open),
    draftCount,
    drafts: moneyList(drafts),
    bySupplier: [...bySupplier]
      .map(([name, supplier]) => ({ name, orders: supplier.orders, value: moneyList(supplier.value) }))
      .toSorted((a, b) => (b.value[0]?.minor ?? 0) - (a.value[0]?.minor ?? 0)),
    spend: { currency, months, otherCurrencies: spendByCurrency.size > 1 }
  }
}

// The money coming due: reorders that are due now, and sent POs by their due date.
export function upcomingSpend(list: PurchaseOrder[], reorderCost: Money, today: string) {
  const buckets = [
    { key: "overdue", label: "Past due", totals: new Map<string, number>(), orders: 0 },
    { key: "next30", label: "Due in the next 30 days", totals: new Map<string, number>(), orders: 0 },
    { key: "next60", label: "Due in 31 to 60 days", totals: new Map<string, number>(), orders: 0 },
    { key: "later", label: "Due later", totals: new Map<string, number>(), orders: 0 }
  ]
  for (const order of list) {
    if (order.status !== "submitted") {
      continue
    }
    const due = order.data.dueDate
    let bucket = buckets[3]!
    if (due < today) {
      bucket = buckets[0]!
    } else if (due <= addDays(today, 30)) {
      bucket = buckets[1]!
    } else if (due <= addDays(today, 60)) {
      bucket = buckets[2]!
    }
    bucket.orders++
    addMoney(bucket.totals, order.data.currency, orderTotal(order.data))
  }
  // Reorders are due now; with past-due and next-60-day POs, they're what's needed over the next 60 days.
  const soon = new Map<string, number>()
  for (const entry of reorderCost) {
    addMoney(soon, entry.currency, entry.minor)
  }
  for (const bucket of buckets.slice(0, 3)) {
    for (const [currency, minor] of bucket.totals) {
      addMoney(soon, currency, minor)
    }
  }
  return {
    reorders: reorderCost,
    purchaseOrders: buckets.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      orders: bucket.orders,
      value: moneyList(bucket.totals)
    })),
    next60: moneyList(soon)
  }
}

export type AttentionItem = {
  key: string
  tone: "critical" | "warning" | "info"
  title: string
  detail: string
  href: string
  action: string
}

const sourceNames: Record<SalesSource, string> = { shopify: "Shopify", amazon: "Amazon" }
const tones = { critical: 0, warning: 1, info: 2 }

// What needs the buyer, most urgent first, each with where to fix it.
export function attentionItems(input: {
  now: Date
  restock: {
    stockouts: number
    reorders: number
    reorderCost: Money
    sources: { source: SalesSource; error: string | null }[]
  }
  shipments: { waiting: number; problems: number }
  drafts: number
  syncs: {
    source: SalesSource
    status: string
    coveredTo: Date | null
    finishedAt: Date | null
    feesErrorCode?: string | null
    // Orders in the chosen period without prices, and whether a sync would copy them.
    unpriced?: number
    outdated?: boolean
  }[]
  stock: { source: string; status: string; finishedAt: Date | null }[]
  shopifyHistoryLimited: boolean
}): AttentionItem[] {
  const items: AttentionItem[] = []
  const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`
  if (input.restock.stockouts) {
    items.push({
      key: "stockouts",
      tone: "critical",
      title: `${plural(input.restock.stockouts, "item is", "items are")} out of stock or will run out before a reorder arrives`,
      detail: "Reorder now to limit the days they can't sell.",
      href: "/restock?status=order",
      action: "Plan restock"
    })
  }
  if (input.shipments.problems) {
    items.push({
      key: "shipment-problems",
      tone: "critical",
      title: `${plural(input.shipments.problems, "shipment needs", "shipments need")} attention`,
      detail: "Something went wrong while creating the shipment with Amazon.",
      href: "/shipments",
      action: "View shipments"
    })
  }
  if (input.shipments.waiting) {
    items.push({
      key: "shipments-waiting",
      tone: "warning",
      title: `${plural(input.shipments.waiting, "shipment is", "shipments are")} waiting for your approval or labels`,
      detail: "Your supplier can't ship until you respond.",
      href: "/shipments",
      action: "View shipments"
    })
  }
  if (input.restock.reorders) {
    items.push({
      key: "reorders",
      tone: "warning",
      title: `${plural(input.restock.reorders, "item is", "items are")} due for a reorder`,
      detail: "They have enough stock for now, but not through the next lead time.",
      href: "/restock?status=order",
      action: "Plan restock"
    })
  }
  for (const source of input.restock.sources) {
    if (source.error) {
      items.push({
        key: `demand-${source.source}`,
        tone: "warning",
        title: `Restock can't read ${sourceNames[source.source]} orders`,
        detail: source.error,
        href: "/sales",
        action: "View orders"
      })
    }
  }
  for (const sync of input.syncs) {
    const name = sourceNames[sync.source]
    const busy = ["queued", "running"].includes(sync.status)
    if (sync.status === "failed") {
      items.push({
        key: `sync-${sync.source}`,
        tone: "warning",
        title: `The last ${name} order sync failed`,
        detail: "Sales and restock use the orders copied before it.",
        href: "/sales",
        action: "View orders"
      })
    } else if (!busy && sync.coveredTo && input.now.getTime() - sync.coveredTo.getTime() > staleAfter) {
      items.push({
        key: `sync-${sync.source}`,
        tone: "info",
        title: `${name} orders haven't synced in ${Math.floor((input.now.getTime() - sync.coveredTo.getTime()) / day)} days`,
        detail: "Sync them so sales and restock include recent orders.",
        href: "/sales",
        action: "View orders"
      })
    }
    if (sync.feesErrorCode === "reconnect") {
      items.push({
        key: `fees-${sync.source}`,
        tone: "warning",
        title: `Reconnect ${name} to include shipping labels and ${name} charges`,
        detail: "Gross profit leaves them out until Copacker can read your payouts.",
        href: "/settings",
        action: "Open settings"
      })
    } else if (sync.feesErrorCode) {
      items.push({
        key: `fees-${sync.source}`,
        tone: "warning",
        title: sync.source === "amazon" ? "Amazon fees couldn't be copied" : "Shopify charges couldn't be copied",
        detail:
          sync.source === "amazon"
            ? "Margins leave out Amazon's fees until the next order sync copies them."
            : "Gross profit leaves out shipping labels and Shopify charges until the next order sync copies them.",
        href: "/sales",
        action: "View orders"
      })
    }
    if (sync.unpriced && sync.outdated && !busy) {
      items.push({
        key: `prices-${sync.source}`,
        tone: "info",
        title: `Sync ${name} orders again to copy their prices`,
        detail: `${plural(sync.unpriced, "order", "orders")} in this period ${sync.unpriced === 1 ? "has" : "have"} no price, so sales and margins leave ${sync.unpriced === 1 ? "it" : "them"} out.`,
        href: "/sales",
        action: "View orders"
      })
    }
  }
  const failedStock = input.stock.filter((row) => row.status === "failed")
  const staleStock = input.stock.filter(
    (row) => row.status === "idle" && row.finishedAt && input.now.getTime() - row.finishedAt.getTime() > staleAfter
  )
  if (failedStock.length) {
    items.push({
      key: "stock-failed",
      tone: "warning",
      title: "The last stock sync failed",
      detail: "Stock and restock use the counts from before it.",
      href: "/products",
      action: "View products"
    })
  } else if (staleStock.length) {
    items.push({
      key: "stock-stale",
      tone: "info",
      title: "Stock hasn't synced in over 2 days",
      detail: "Sync it so stock counts are current.",
      href: "/products",
      action: "View products"
    })
  }
  if (input.shopifyHistoryLimited) {
    items.push({
      key: "shopify-history",
      tone: "info",
      title: "Shopify shares only the last 60 days of orders",
      detail: "Reconnect Shopify with access to all orders to see a full year.",
      href: "/settings",
      action: "Open settings"
    })
  }
  if (input.drafts) {
    items.push({
      key: "drafts",
      tone: "info",
      title: `${plural(input.drafts, "draft purchase order hasn't", "draft purchase orders haven't")} been sent`,
      detail: "Send them when you're ready for your supplier to start.",
      href: "/orders",
      action: "View purchase orders"
    })
  }
  return items.toSorted((a, b) => tones[a.tone] - tones[b.tone])
}

export type SetupStep = { key: string; title: string; detail: string; href: string; done: boolean }

// The steps that make the Overview complete, in the order a new buyer takes them.
export function setupSteps(input: {
  connected: SalesSource[]
  ordersCopied: SalesSource[]
  stockSynced: boolean
  inStock: number
  uncosted: number
  suppliers: number
}): SetupStep[] {
  const allCopied = input.connected.length > 0 && input.connected.every((source) => input.ordersCopied.includes(source))
  return [
    {
      key: "shopify",
      title: "Connect Shopify",
      detail: "Your catalog, stock, costs and store orders.",
      href: "/settings",
      done: input.connected.includes("shopify")
    },
    {
      key: "amazon",
      title: "Connect Amazon",
      detail: "Amazon orders, FBA and AWD stock, and fees.",
      href: "/settings",
      done: input.connected.includes("amazon")
    },
    {
      key: "orders",
      title: "Copy your orders",
      detail: "Sales, trends and restock read the copied orders.",
      href: "/sales",
      done: allCopied
    },
    {
      key: "stock",
      title: "Sync your stock",
      detail: "Stock by channel, days of cover and restock.",
      href: "/products",
      done: input.stockSynced
    },
    {
      key: "costs",
      title: "Add unit costs in Shopify",
      detail: "Stock value, reorder estimates and margins need them.",
      href: "/products",
      done: input.inStock > 0 && input.uncosted === 0
    },
    {
      key: "supplier",
      title: "Invite a supplier",
      detail: "Send purchase orders and track shipments together.",
      href: "/suppliers",
      done: input.suppliers > 0
    }
  ]
}

// Restock for every channel is the slowest part of the page, so it's kept for a few minutes while nothing it reads
// has changed: POs, shipments, stock and order syncs, product details, suppliers, locations and connections.
type RestockResult = Awaited<ReturnType<typeof restockAllChannels>>
const restockCache = new Map<string, { fingerprint: string; at: number; value: RestockResult }>()
const restockCacheMs = 5 * 60 * 1000

async function restockFingerprint(orgId: string) {
  const result = await db().execute(sql`select concat_ws('|',
    (select max(${orders.updatedAt})::text || count(*) from ${orders} where ${orders.buyerOrgId} = ${orgId}),
    (select max(${shipments.updatedAt})::text || count(*) from ${shipments}
      join ${orders} on ${orders.id} = ${shipments.orderId} where ${orders.buyerOrgId} = ${orgId}),
    (select string_agg(coalesce(${stockSnapshots.snapshotId}::text, '') || ${stockSnapshots.status}, ','
      order by ${stockSnapshots.source}, ${stockSnapshots.scopeKey}) from ${stockSnapshots}
      where ${stockSnapshots.orgId} = ${orgId}),
    (select string_agg(${salesSyncs.source} || ${salesSyncs.revision} || coalesce(${salesSyncs.coveredTo}::text, '')
      || coalesce(${salesSyncs.stockCoveredTo}::text, ''), ',' order by ${salesSyncs.source}) from ${salesSyncs}
      where ${salesSyncs.orgId} = ${orgId}),
    (select max(${productDefaults.updatedAt})::text || count(*) from ${productDefaults}
      where ${productDefaults.orgId} = ${orgId}),
    (select string_agg(${suppliers.id}::text || coalesce(${suppliers.leadTimeDays}, -1)
      || coalesce(${suppliers.amazonLeadTimeDays}, -1) || coalesce(${suppliers.removedAt}::text, ''), ','
      order by ${suppliers.id}) from ${suppliers} where ${suppliers.buyerOrgId} = ${orgId}),
    (select sum(${inventoryLocationMappings.revision})::text || count(*) from ${inventoryLocationMappings}
      where ${inventoryLocationMappings.orgId} = ${orgId}),
    (select string_agg(${contacts.id}::text || coalesce(${contacts.shopifyLocationId}, ''), ',' order by ${contacts.id})
      from ${contacts} where ${contacts.orgId} = ${orgId}),
    (select string_agg(${connections.provider} || ${connections.externalId}, ',' order by ${connections.provider})
      from ${connections} where ${connections.orgId} = ${orgId})
  ) as fingerprint`)
  return String((result as unknown as { rows: { fingerprint: unknown }[] }).rows[0]?.fingerprint ?? "")
}

async function cachedRestock(orgId: string, now: number) {
  const fingerprint = await restockFingerprint(orgId)
  const cached = restockCache.get(orgId)
  if (cached && cached.fingerprint === fingerprint && now - cached.at < restockCacheMs) {
    return cached.value
  }
  const value = await restockAllChannels(orgId, restockDefaults.days, restockDefaults.leadTimeDays)
  restockCache.set(orgId, { fingerprint, at: now, value })
  return value
}

// Everything the Overview shows for a buyer, for every channel or one of them (a restock channel key: "amazon" or
// "shopify:<location>").
export async function overview(
  // `timeZone` is the store's: the one set in Settings, or else the viewer's computer's (see storeTimeZone).
  org: { id: string; timeZone: string },
  // `period` is the page's query: `period`, or `from` and `to`, and `compare` (see readPeriod).
  options: { channel?: string | null; period?: Record<string, string | string[] | undefined>; now?: Date } = {}
) {
  const now = options.now ?? new Date()
  const orgId = org.id
  const { timeZone } = org
  const today = zonedDay(now, timeZone)
  const connected = await db()
    .select({ provider: connections.provider, externalId: connections.externalId, scopes: connections.scopes })
    .from(connections)
    .where(eq(connections.orgId, orgId))
  const accounts = connected.flatMap((row) =>
    salesSources.includes(row.provider as SalesSource)
      ? [{ provider: row.provider as SalesSource, externalId: row.externalId }]
      : []
  )
  const [restock, currency] = await Promise.all([cachedRestock(orgId, now.getTime()), reportingCurrency(orgId)])
  const channelOptions = restock.channels.map((channel) => ({ key: channel.key, label: channel.label }))
  const selected = channelOptions.find((channel) => channel.key === options.channel) ?? null
  let channelSource: SalesSource | null = null
  if (selected) {
    channelSource = selected.key === "amazon" ? "amazon" : "shopify"
  }
  // A Shopify location shows the Shopify orders shipped from it.
  const locationId = selected?.key.startsWith("shopify:") ? selected.key.slice("shopify:".length) : null
  // With Amazon connected, its orders come from Amazon, not from the copies Shopify's Amazon channel keeps.
  const amazonConnected = accounts.some((account) => account.provider === "amazon")
  const scopedAccounts = accounts
    .filter((account) => !channelSource || account.provider === channelSource)
    .map((account) => ({
      ...account,
      locationId: account.provider === "shopify" ? locationId : null,
      withoutAmazon: account.provider === "shopify" && amazonConnected
    }))
  const shopifyWithoutAmazon = scopedAccounts.find((account) => account.provider === "shopify" && account.withoutAmazon)
  const shopifyAccount = scopedAccounts.find((account) => account.provider === "shopify")
  const period = readPeriod(options.period ?? {}, today)
  const window = {
    current: rangeBounds(period.range, timeZone),
    previous: period.previous ? rangeBounds(period.previous, timeZone) : null
  }
  // Inbound freight is costed over the year up to the period's end, and retail value uses the last 60 days' prices,
  // whatever the period.
  const yearStart = zonedStart(addDays(period.range.to, -364), timeZone)
  const priceWindow = {
    current: rangeBounds({ from: addDays(today, -60), to: addDays(today, -1) }, timeZone),
    previous: null
  }
  const earliest = new Date(
    Math.min(yearStart.getTime(), window.current.from.getTime(), window.previous?.from.getTime() ?? Infinity)
  )

  const [
    syncs,
    dayRows,
    itemRows,
    feeRows,
    purchaseOrders,
    sent,
    deliveries,
    shipmentRows,
    stock,
    supplierRows,
    markups,
    otherMarketplaces,
    platformLines,
    costs,
    linkedFreight,
    priceRows,
    customerRows
  ] = await Promise.all([
    db().select().from(salesSyncs).where(eq(salesSyncs.orgId, orgId)),
    salesByDay(orgId, scopedAccounts, earliest, timeZone, currency),
    salesByItem(orgId, scopedAccounts, window, currency),
    Promise.all(
      scopedAccounts.map(async (account) => ({
        source: account.provider,
        list: await orderFees(orgId, account, window.current.from, window.current.to, currency)
      }))
    ),
    db()
      .select({
        id: orders.id,
        status: orders.status,
        data: orders.data,
        createdAt: orders.createdAt,
        supplier: suppliers.name
      })
      .from(orders)
      .innerJoin(suppliers, eq(suppliers.id, orders.supplierId))
      .where(eq(orders.buyerOrgId, orgId)),
    db()
      .select({ orderId: events.orderId, at: sql<Date>`min(${events.createdAt})`.mapWith(orders.createdAt) })
      .from(events)
      .innerJoin(orders, eq(orders.id, events.orderId))
      .where(and(eq(orders.buyerOrgId, orgId), eq(events.message, "PO submitted to supplier")))
      .groupBy(events.orderId),
    db()
      .select({ id: contacts.id, locationId: contacts.shopifyLocationId })
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), eq(contacts.kind, "delivery"))),
    db()
      .select({ status: shipments.status, orderId: shipments.orderId })
      .from(shipments)
      .innerJoin(orders, eq(orders.id, shipments.orderId))
      .where(eq(orders.buyerOrgId, orgId)),
    db()
      .select({
        source: stockSnapshots.source,
        status: stockSnapshots.status,
        finishedAt: stockSnapshots.attemptFinishedAt,
        snapshotId: stockSnapshots.snapshotId
      })
      .from(stockSnapshots)
      .where(eq(stockSnapshots.orgId, orgId)),
    db()
      .select({ id: suppliers.id, removedAt: suppliers.removedAt })
      .from(suppliers)
      .where(eq(suppliers.buyerOrgId, orgId)),
    landedMarkupsFor(orgId),
    shopifyWithoutAmazon
      ? otherMarketplaceOrders(orgId, shopifyWithoutAmazon.externalId, window.current.from, window.current.to)
      : Promise.resolve(0),
    platformCharges(orgId, scopedAccounts, window.current.from, window.current.to, currency),
    listMonthlyCosts(orgId),
    amazonFreightByOrder(orgId),
    salesByItem(orgId, scopedAccounts, priceWindow, currency),
    shopifyAccount ? shopifyCustomers(orgId, shopifyAccount, window.current, currency) : Promise.resolve(null)
  ])
  // Monthly costs for the whole business count on every view; one for a channel counts when that channel is chosen.
  const monthly: ChargeLine[] = monthlyCostShares(
    costs.filter((cost) => cost.currency === currency && (!channelSource || cost.channel === channelSource)),
    period.range.from,
    addDays(period.range.to, 1)
  ).map((cost) => ({
    key: `monthly:${cost.id}`,
    label: `${cost.name}, monthly cost`,
    minor: -cost.shareMinor,
    currency
  }))
  const charges = [...platformLines, ...monthly]

  const current = syncs.filter((sync) =>
    accounts.some((account) => account.provider === sync.source && account.externalId === sync.externalAccountId)
  )
  const coverage: Partial<Record<SalesSource, { from: Date; to: Date }>> = {}
  for (const sync of current) {
    if (sync.coveredFrom && sync.coveredTo) {
      coverage[sync.source] = { from: sync.coveredFrom, to: sync.coveredTo }
    }
  }
  const sources = scopedAccounts.map((account) => account.provider)
  const covered = sources.filter((source) => coverage[source])
  const series = dailySales(dayRows, coverage, period.range, timeZone, now)
  const previousSeries = period.previous ? dailySales(dayRows, coverage, period.previous, timeZone, now) : null
  const totals = periodTotal(series, previousSeries, covered)
  const salesCurrency =
    dayRows.filter((row) => row.currency).toSorted((a, b) => b.revenueMinor - a.revenueMinor)[0]?.currency ?? null
  const index = catalogIndex(restock.catalog, markups)
  const fees = Object.fromEntries(feeRows.map((row) => [row.source, platformFees(row.list)])) as Partial<
    Record<SalesSource, ReturnType<typeof platformFees>>
  >
  // Amazon inbound freight over the year up to the period's end (or the stretch Amazon's orders cover, if shorter), as a
  // cost per unit: by the SKUs each shipment carried, and the rest over the Amazon units sold in it. Freight for
  // shipments sent from a PO is in that PO's landed costs instead.
  const amazonAccount = scopedAccounts.find((account) => account.provider === "amazon")
  const freightFrom = coverage.amazon ? new Date(Math.max(coverage.amazon.from.getTime(), yearStart.getTime())) : null
  const freightDays = dayRows.filter(
    (row) =>
      row.source === "amazon" &&
      freightFrom &&
      zonedStart(row.date, timeZone) >= freightFrom &&
      zonedStart(row.date, timeZone) < window.current.to
  )
  const freight =
    amazonAccount && freightFrom
      ? await amazonFreight(
          orgId,
          amazonAccount.externalId,
          { from: freightFrom, to: window.current.to },
          currency,
          freightDays.reduce((sum, row) => sum + row.units, 0),
          new Set(linkedFreight.map((row) => row.reference))
        )
      : null
  const profit = grossProfit(itemRows, index, fees, charges, freight)
  // Trends compare the period with the one it's compared with, for sources whose orders cover both.
  const previousStart = window.previous?.from
  const comparable = previousStart ? covered.filter((source) => coverage[source]!.from <= previousStart) : []
  const trending = movers(itemRows, index, comparable)
  const priceOf = sellingPrices(priceRows, index)

  const scopedChannels = restock.channels.filter((channel) => !selected || channel.key === selected.key)
  const landedCost = (line: RestockLine) => index.unitCost(index.byVariant.get(line.variantId) ?? null)
  const summary = summarizeRestock(
    scopedChannels,
    (line, channelKey) => {
      const source: SalesSource = channelKey === "amazon" ? "amazon" : "shopify"
      const recent = priceOf(source, line.variantId)
      if (recent) {
        return recent
      }
      const row = index.byVariant.get(line.variantId)
      return row?.priceMinor && row.priceCurrency ? { minor: row.priceMinor, currency: row.priceCurrency } : null
    },
    landedCost
  )
  // The setup checklist looks at every channel, whichever is chosen.
  const everyChannel = selected ? summarizeRestock(restock.channels, undefined, landedCost) : summary

  // POs (and their shipments) for the chosen channel: to Amazon, or received at the chosen Shopify location.
  const deliveryLocations = new Map(deliveries.map((row) => [row.id, row.locationId]))
  const scopedOrders = purchaseOrders.filter((order) => {
    if (!selected) {
      return true
    }
    if (selected.key === "amazon") {
      return amazonDestinations.has(order.data.destination)
    }
    return receivingLocations(order.data, deliveryLocations).includes(locationId!)
  })
  const orderIds = new Set(scopedOrders.map((order) => order.id))
  const sentAt = new Map(sent.map((row) => [row.orderId, row.at]))
  const poList = scopedOrders.map((order) => ({
    status: order.status,
    supplier: order.supplier,
    data: order.data,
    // A PO sent before submissions were recorded counts from its creation.
    sentAt: order.status === "draft" ? null : (sentAt.get(order.id) ?? order.createdAt)
  }))
  const buying = purchasing(poList, now, timeZone)
  const states = shipmentRows.filter((row) => orderIds.has(row.orderId)).map((row) => row.status)
  const shopify = connected.find((row) => row.provider === "shopify")
  // Customer figures need the customer IDs, which a Shopify sync copies once the store grants read_customers.
  const shopifySync = current.find((sync) => sync.source === "shopify")
  let customerStatus: "ready" | "reconnect" | "syncing" = "ready"
  if (!shopify || !hasCustomerScope(shopify.scopes)) {
    customerStatus = "reconnect"
  } else if (!shopifySync || shopifySync.dataVersion < customerDataVersion) {
    customerStatus = "syncing"
  }
  const unpricedBySource = (source: SalesSource) => series.reduce((sum, row) => sum + (row[source]?.unpriced ?? 0), 0)
  const stockSources = [
    ...(connected.some((row) => row.provider === "shopify") ? (["shopify"] as const) : []),
    ...(connected.some((row) => row.provider === "amazon") ? (["fba"] as const) : [])
  ]

  return {
    generatedAt: now.toISOString(),
    timeZone,
    connected: accounts.map((account) => account.provider),
    channels: channelOptions,
    channel: selected,
    period: {
      key: period.key,
      label: period.label,
      range: period.range,
      rangeLabel: rangeLabel(period.range),
      comparison: period.comparison,
      comparisonLabel: comparisons.find((option) => option.key === period.comparison)!.label,
      previous: period.previous,
      previousLabel: period.previous ? rangeLabel(period.previous) : null,
      today
    },
    setup: setupSteps({
      connected: accounts.map((account) => account.provider),
      ordersCopied: current.filter((sync) => sync.coveredTo).map((sync) => sync.source),
      stockSynced:
        stockSources.length > 0 &&
        stockSources.every((source) => stock.some((row) => row.source === source && row.snapshotId)),
      inStock: everyChannel.unitsOnHand,
      uncosted: everyChannel.uncosted,
      suppliers: supplierRows.filter((row) => !row.removedAt).length
    }),
    sales: {
      sources,
      daily: series,
      totals,
      // The previous period's days, for the chart's comparison line.
      previousDaily: previousSeries,
      currency: salesCurrency,
      profit,
      fees: {
        feesMinor: Object.values(fees).reduce((sum, platform) => sum + platform.feesMinor, 0),
        estimatedOrders: Object.values(fees).reduce((sum, platform) => sum + platform.estimatedOrders, 0)
      },
      movers: trending,
      // Shopify customers, when a Shopify channel is shown.
      customers: customerRows && {
        ...customerRows,
        status: customerStatus,
        // Orders reach back to here, so the year's figures cover less than a year before it.
        historyFrom: shopifySync?.coveredFrom?.toISOString() ?? null
      },
      // Shopify copies of orders from Amazon marketplaces Copacker doesn't read, left out over the period.
      otherMarketplaceOrders: otherMarketplaces,
      moversComparable: comparable.length > 0
    },
    restock: {
      days: restockDefaults.days,
      leadTimeDays: restockDefaults.leadTimeDays,
      ...summary,
      // Products whose costs include freight and duty from a PO's landed costs.
      landedProducts: markups.size
    },
    purchasing: buying,
    upcoming: upcomingSpend(poList, summary.reorderCost, today),
    shipments: shipmentPipeline(states),
    attention: attentionItems({
      now,
      restock: {
        ...summary,
        sources: restock.sources.filter((source) => !channelSource || source.source === channelSource)
      },
      shipments: {
        waiting: states.filter((state) => state === "approval" || state === "waiting_labels").length,
        problems: states.filter((state) => state === "needs_attention").length
      },
      drafts: buying.draftCount,
      syncs: current.map((sync) => ({
        source: sync.source,
        status: sync.status,
        coveredTo: sync.coveredTo,
        finishedAt: sync.finishedAt,
        feesErrorCode: sync.feesErrorCode,
        unpriced: unpricedBySource(sync.source),
        outdated: sync.dataVersion < salesDataVersion
      })),
      stock: stock.map((row) => ({ source: row.source, status: row.status, finishedAt: row.finishedAt })),
      shopifyHistoryLimited: Boolean(shopify && !shopify.scopes.split(/[,\s]+/).includes("read_all_orders"))
    })
  }
}

export type Overview = Awaited<ReturnType<typeof overview>>
