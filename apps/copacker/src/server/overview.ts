import { orderTotal, type OrderInput } from "@repo/aisle"
import { and, eq, gte, inArray, sql } from "drizzle-orm"
import { db } from "@/db"
import {
  connections,
  events,
  orders,
  salesOrders,
  salesSyncs,
  type ShipmentState,
  shipments,
  stockSnapshots,
  suppliers
} from "@/db/schema"
import { restockAllChannels } from "./restock-page"
import type { RestockLine } from "./restock-plan"
import { restockDefaults } from "./restock-report"
import { salesHistoryDays, type SalesSource, salesSources } from "./sales-orders"

const day = 86400000
// A sync that hasn't finished within this long is out of date.
const staleAfter = 2 * day
// Stock that sells out within this many days counts as low in the days-of-cover spread.
export const coverBuckets = [
  { key: "out", label: "Out of stock" },
  { key: "under14", label: "Under 2 weeks" },
  { key: "under30", label: "2 to 4 weeks" },
  { key: "under60", label: "1 to 2 months" },
  { key: "under90", label: "2 to 3 months" },
  { key: "over90", label: "Over 3 months" },
  { key: "unsold", label: "Not selling" }
] as const
export type CoverBucket = (typeof coverBuckets)[number]["key"]

export type Money = { currency: string; minor: number }[]

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

// The UTC calendar day of a time, as the Orders page and stock history count days.
export function dayKey(time: Date | number) {
  return new Date(time).toISOString().slice(0, 10)
}

export type DailySales = { date: string } & Record<SalesSource, { orders: number; units: number } | null>

// One row per day for the last `days` full days, oldest first. A source's day is null when its stored orders don't
// cover the whole day, so charts show a gap instead of a false zero.
export function dailySales(
  rows: { source: SalesSource; date: string; orders: number; units: number }[],
  coverage: Partial<Record<SalesSource, { from: Date; to: Date }>>,
  today: Date,
  days: number
): DailySales[] {
  const end = Date.parse(dayKey(today))
  const byKey = new Map(rows.map((row) => [`${row.source}:${row.date}`, row]))
  const series: DailySales[] = []
  for (let index = days; index >= 1; index--) {
    const start = end - index * day
    const date = dayKey(start)
    const cell = (source: SalesSource) => {
      const covered = coverage[source]
      if (!covered || covered.from.getTime() > start || covered.to.getTime() < start + day) {
        return null
      }
      const row = byKey.get(`${source}:${date}`)
      return { orders: row?.orders ?? 0, units: row?.units ?? 0 }
    }
    series.push({ date, shopify: cell("shopify"), amazon: cell("amazon") })
  }
  return series
}

export type PeriodTotal = { orders: number; units: number; previous: { orders: number; units: number } | null }

// Orders and units over the last `days` days against the days before them. A comparison is made only when every
// counted source covers both periods.
export function periodTotal(series: DailySales[], sources: SalesSource[], days: number): PeriodTotal {
  const sum = (rows: DailySales[]) => {
    let orders = 0,
      units = 0,
      complete = true
    for (const row of rows) {
      for (const source of sources) {
        const cell = row[source]
        if (cell) {
          orders += cell.orders
          units += cell.units
        } else {
          complete = false
        }
      }
    }
    return { orders, units, complete }
  }
  const current = sum(series.slice(-days))
  const before = series.length >= days * 2 ? sum(series.slice(-days * 2, -days)) : null
  return {
    orders: current.orders,
    units: current.units,
    previous:
      before?.complete && current.complete && sources.length ? { orders: before.orders, units: before.units } : null
  }
}

export function coverBucket(line: Pick<RestockLine, "available" | "sold" | "daysRemaining">): CoverBucket | null {
  if (line.available === null) {
    return null
  }
  if (line.available <= 0) {
    return "out"
  }
  if (line.sold === 0) {
    return "unsold"
  }
  if (line.daysRemaining === null) {
    return null
  }
  if (line.daysRemaining < 14) {
    return "under14"
  }
  if (line.daysRemaining < 30) {
    return "under30"
  }
  if (line.daysRemaining < 60) {
    return "under60"
  }
  return line.daysRemaining < 90 ? "under90" : "over90"
}

type ChannelLines = { key: string; label: string; lines: RestockLine[] }

// What restock says across every channel: stock and its value at cost, days of cover, lost selling days, the items to
// reorder and what reordering them costs, and the best sellers.
export function summarizeRestock(channels: ChannelLines[]) {
  const reorderCost = new Map<string, number>()
  const stockValue = new Map<string, number>()
  const cover = new Map<CoverBucket, number>(coverBuckets.map((bucket) => [bucket.key, 0]))
  let stockouts = 0,
    reorders = 0,
    blocked = 0,
    lostDays = 0,
    itemsOut = 0,
    unitsOnHand = 0,
    uncosted = 0,
    reorderUncosted = 0
  const byChannel = channels.map((channel) => {
    const value = new Map<string, number>()
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
      if (line.stockoutDays > 0) {
        lostDays += line.stockoutDays
        itemsOut++
      }
      const bucket = coverBucket(line)
      if (bucket) {
        cover.set(bucket, (cover.get(bucket) ?? 0) + 1)
      }
      const onHand = Math.max(0, line.available ?? 0)
      available += onHand
      incoming += line.incoming ?? 0
      if (onHand > 0) {
        if (line.unitCostMinor === null || !line.costCurrency) {
          uncosted++
        } else {
          addMoney(value, line.costCurrency, onHand * line.unitCostMinor)
          addMoney(stockValue, line.costCurrency, onHand * line.unitCostMinor)
        }
      }
    }
    unitsOnHand += available
    return { key: channel.key, label: channel.label, available, incoming, value: moneyList(value) }
  })

  // Best sellers across channels, one row per variation.
  const sellers = new Map<
    string,
    Pick<RestockLine, "variantId" | "product" | "variant" | "sku" | "imageUrl"> & {
      sold: number
      available: number
      daysRemaining: number | null
      status: "stockout" | "reorder" | "stocked"
      channels: string[]
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
        channels: [...current.channels, channel.label]
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
    itemsOut,
    unitsOnHand,
    stockValue: moneyList(stockValue),
    uncosted,
    channels: byChannel,
    cover: coverBuckets.map((bucket) => ({ ...bucket, items: cover.get(bucket.key) ?? 0 })),
    bestSellers: [...sellers.values()].toSorted((a, b) => b.sold - a.sold).slice(0, 8)
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

// Open and draft PO value, open value by supplier, and what was ordered each month over the last year.
export function purchasing(list: PurchaseOrder[], today: Date) {
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
  const months: { month: string; minor: number }[] = []
  const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1))
  for (let index = 0; index < 12; index++) {
    const month = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + index, 1))
    const next = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1))
    months.push({
      month: month.toISOString().slice(0, 7),
      minor: sent
        .filter((order) => order.data.currency === currency && order.sentAt! >= month && order.sentAt! < next)
        .reduce((sum, order) => sum + orderTotal(order.data), 0)
    })
  }
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
  syncs: { source: SalesSource; status: string; coveredTo: Date | null; finishedAt: Date | null }[]
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
      href: "/restock",
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
      href: "/restock",
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
    if (sync.status === "failed") {
      items.push({
        key: `sync-${sync.source}`,
        tone: "warning",
        title: `The last ${name} order sync failed`,
        detail: "Sales and restock use the orders copied before it.",
        href: "/sales",
        action: "View orders"
      })
    } else if (
      !["queued", "running"].includes(sync.status) &&
      sync.coveredTo &&
      input.now.getTime() - sync.coveredTo.getTime() > staleAfter
    ) {
      items.push({
        key: `sync-${sync.source}`,
        tone: "info",
        title: `${name} orders haven't synced in ${Math.floor((input.now.getTime() - sync.coveredTo.getTime()) / day)} days`,
        detail: "Sync them so sales and restock include recent orders.",
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

// Units in a stored order, counted as the Orders page counts them: a bundle once, lines at their current quantity.
const orderUnits = sql<number>`case when ${salesOrders.source} = 'amazon' then
  (select coalesce(sum((item->>'quantityOrdered')::int), 0) from jsonb_array_elements(${salesOrders.data}->'orderItems') item)
else
  (select coalesce(sum((line->>'currentQuantity')::int), 0) from jsonb_array_elements(${salesOrders.data}->'lines') line
    where jsonb_typeof(line->'lineItemGroup') is distinct from 'object')
  + (select coalesce(sum(grp.quantity), 0) from (
      select distinct on (line->'lineItemGroup'->>'id') (line->'lineItemGroup'->>'quantity')::int as quantity
      from jsonb_array_elements(${salesOrders.data}->'lines') line
      where jsonb_typeof(line->'lineItemGroup') = 'object'
    ) grp)
end`

// Orders and units per source and UTC day since `since`, for the connected accounts.
export async function salesByDay(
  orgId: string,
  accounts: { provider: SalesSource; externalId: string }[],
  since: Date
) {
  if (!accounts.length) {
    return []
  }
  const date = sql<string>`to_char(${salesOrders.orderedAt} at time zone 'UTC', 'YYYY-MM-DD')`
  const rows = await db()
    .select({
      source: salesOrders.source,
      externalAccountId: salesOrders.externalAccountId,
      date,
      orders: sql<number>`count(*)::int`,
      units: sql<number>`sum(${orderUnits})::int`
    })
    .from(salesOrders)
    .where(
      and(
        eq(salesOrders.orgId, orgId),
        gte(salesOrders.orderedAt, since),
        inArray(
          salesOrders.source,
          accounts.map((account) => account.provider)
        )
      )
    )
    .groupBy(salesOrders.source, salesOrders.externalAccountId, date)
  return rows.filter((row) =>
    accounts.some((account) => account.provider === row.source && account.externalId === row.externalAccountId)
  )
}

// Everything the Overview shows for a buyer.
export async function overview(orgId: string, now = new Date()) {
  const connected = await db()
    .select({ provider: connections.provider, externalId: connections.externalId, scopes: connections.scopes })
    .from(connections)
    .where(eq(connections.orgId, orgId))
  const accounts = connected.flatMap((row) =>
    salesSources.includes(row.provider as SalesSource)
      ? [{ provider: row.provider as SalesSource, externalId: row.externalId }]
      : []
  )
  const [syncs, dailyRows, restock, purchaseOrders, sent, shipmentRows, stock] = await Promise.all([
    db().select().from(salesSyncs).where(eq(salesSyncs.orgId, orgId)),
    salesByDay(orgId, accounts, new Date(Date.parse(dayKey(now)) - salesHistoryDays * day)),
    restockAllChannels(orgId, restockDefaults.days, restockDefaults.leadTimeDays),
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
      .select({ status: shipments.status })
      .from(shipments)
      .innerJoin(orders, eq(orders.id, shipments.orderId))
      .where(eq(orders.buyerOrgId, orgId)),
    db()
      .select({
        source: stockSnapshots.source,
        status: stockSnapshots.status,
        finishedAt: stockSnapshots.attemptFinishedAt
      })
      .from(stockSnapshots)
      .where(eq(stockSnapshots.orgId, orgId))
  ])

  const current = syncs.filter((sync) =>
    accounts.some((account) => account.provider === sync.source && account.externalId === sync.externalAccountId)
  )
  const coverage: Partial<Record<SalesSource, { from: Date; to: Date }>> = {}
  for (const sync of current) {
    if (sync.coveredFrom && sync.coveredTo) {
      coverage[sync.source] = { from: sync.coveredFrom, to: sync.coveredTo }
    }
  }
  const series = dailySales(dailyRows, coverage, now, salesHistoryDays)
  const sources = accounts.map((account) => account.provider)
  const summary = summarizeRestock(restock.channels)
  const sentAt = new Map(sent.map((row) => [row.orderId, row.at]))
  const buying = purchasing(
    purchaseOrders.map((order) => ({
      status: order.status,
      supplier: order.supplier,
      data: order.data,
      // A PO sent before submissions were recorded counts from its creation.
      sentAt: order.status === "draft" ? null : (sentAt.get(order.id) ?? order.createdAt)
    })),
    now
  )
  const states = shipmentRows.map((row) => row.status)
  const shopify = connected.find((row) => row.provider === "shopify")

  return {
    generatedAt: now.toISOString(),
    connected: sources,
    sales: {
      sources,
      daily: series,
      last30: periodTotal(
        series,
        sources.filter((source) => coverage[source]),
        30
      )
    },
    restock: { days: restockDefaults.days, leadTimeDays: restockDefaults.leadTimeDays, ...summary },
    purchasing: buying,
    shipments: shipmentPipeline(states),
    attention: attentionItems({
      now,
      restock: { ...summary, sources: restock.sources },
      shipments: {
        waiting: states.filter((state) => state === "approval" || state === "waiting_labels").length,
        problems: states.filter((state) => state === "needs_attention").length
      },
      drafts: buying.draftCount,
      syncs: current.map((sync) => ({
        source: sync.source,
        status: sync.status,
        coveredTo: sync.coveredTo,
        finishedAt: sync.finishedAt
      })),
      stock: stock.map((row) => ({ source: row.source, status: row.status, finishedAt: row.finishedAt })),
      shopifyHistoryLimited: Boolean(shopify && !shopify.scopes.split(/[,\s]+/).includes("read_all_orders"))
    })
  }
}

export type Overview = Awaited<ReturnType<typeof overview>>
