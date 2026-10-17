import type { OrderInput } from "@repo/aisle"
import { orderTotal } from "@repo/aisle"
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
  shipments,
  stockSnapshots,
  suppliers
} from "@/db/schema"
import type { ServerText } from "@/i18n/server-text"
import { serverTextInEnglish } from "@/i18n/server-text"
import { type CoverBucket, coverBucket, coverBuckets } from "@/lib/cover"
import { comparisons, rangeLabel, readPeriod } from "@/lib/date-range"
import { addDays, zonedDay, zonedStart } from "@/lib/time-zone"
import { amazonFreightByOrder } from "./amazon-shipments"
import { receivingLocations } from "./inventory-products"
import { landedMarkupsFor } from "./landed-costs"
import { listMonthlyCosts, monthlyCostShares } from "./monthly-costs"
import type { ChargeLine } from "./overview-sales"
import {
  amazonFreight,
  catalogIndex,
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
  storedMarketplaces,
  shopifyCustomers,
  salesByItem,
  sellingPrices
} from "./overview-sales"
import { periodStockouts, restockAllChannels } from "./restock-page"
import type { RestockLine } from "./restock-plan"
import { restockSettings } from "./restock-report"
import {
  customerDataVersion,
  hasCustomerScope,
  historyDaysFor,
  orderSyncProgress,
  salesDataVersion,
  type SalesSource,
  salesSources
} from "./sales-orders"
import { excludedShopifyTags } from "./shopify-tags"
import { serverText } from "./text"

const day = 86400000
// A sync that hasn't finished within this long is out of date.
const staleAfter = 2 * day

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
    line.unitCostMinor !== null && line.costCurrency
      ? { minor: line.unitCostMinor, currency: line.costCurrency }
      : null,
  // Days each line was out of stock over the period its lost sales are counted for. Restock's sales period by default;
  // the Overview passes its own period's.
  stockoutDaysFor: (line: RestockLine, channelKey: string) => number = (line) => line.stockoutDays
) {
  const reorderCost = new Map<string, number>()
  const stockValue = new Map<string, number>()
  const retailValue = new Map<string, number>()
  const lostValue = new Map<string, number>()
  // Sales expected to be lost before a reorder placed today arrives, at each channel's selling price.
  const expectedLost = new Map<string, number>()
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
    reorderUncosted = 0,
    expectedLostUnits = 0,
    expectedLostItems = 0,
    expectedLostUnpriced = 0
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
      if (line.lostUnits) {
        expectedLostUnits += line.lostUnits
        expectedLostItems++
        if (price) {
          addMoney(expectedLost, price.currency, line.lostUnits * price.minor)
        } else {
          expectedLostUnpriced++
        }
      }
      const daysOut = stockoutDaysFor(line, channel.key)
      if (daysOut > 0) {
        lostDays += daysOut
        itemsOut++
        // Sales it would have made on the days it was out, at the rate it sold while in stock.
        if (line.sold) {
          const units = (daysOut * line.sold) / line.rateDays
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
      status: "stockout" | "reorder" | "stocked" | "out"
      channels: { key: string; label: string; sold: number }[]
    }
  >()
  const urgency = { stockout: 2, reorder: 1, stocked: 0, out: 0 } as const
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
    expectedLost: moneyList(expectedLost),
    expectedLostUnits,
    expectedLostItems,
    // Items expected to run out whose selling price isn't known, so they're missing from `expectedLost`.
    expectedLostUnpriced,
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
        channel: [...counts].toSorted((a, b) => b[1] - a[1]).at(0)?.[0] ?? null
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
    // An item restock can't plan (such as a bundle held as its own item) isn't "stocked" when none is on hand.
    bestSellers: [...sellers.values()]
      .map((seller) =>
        seller.status === "stocked" && seller.available === 0 ? { ...seller, status: "out" as const } : seller
      )
      .toSorted((a, b) => b.sold - a.sold)
      .slice(0, 8)
      .map((seller) => ({
        ...seller,
        // Restock opens on the channel it sells most in.
        channel: seller.channels.toSorted((a, b) => b.sold - a.sold).at(0)?.key ?? null,
        channels: seller.channels.map((channel) => channel.label)
      }))
  }
}

type PurchaseOrder = {
  status: "draft" | "submitted" | "closed"
  supplier: string
  data: OrderInput
  // When the PO was sent to its supplier; null for drafts.
  sentAt: Date | null
}

// Open and draft PO value, and open value by supplier.
export function purchasing(list: PurchaseOrder[]) {
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
  return {
    openCount,
    open: moneyList(open),
    draftCount,
    drafts: moneyList(drafts),
    bySupplier: [...bySupplier]
      .map(([name, supplier]) => ({ name, orders: supplier.orders, value: moneyList(supplier.value) }))
      .toSorted((a, b) => (b.value[0]?.minor ?? 0) - (a.value[0]?.minor ?? 0))
  }
}

// When a sent PO's payment falls due: its Net days after it was sent, or else the date it asked for the goods by, or
// else when it was sent (payment in advance, on receipt, or no terms).
export function paymentDue(order: Pick<PurchaseOrder, "data" | "sentAt">) {
  const sent = (order.sentAt ?? new Date()).toISOString().slice(0, 10)
  const net = /^Net (\d+)$/.exec(order.data.paymentTerms ?? "")
  if (net) {
    return addDays(sent, Number(net[1]))
  }
  return order.data.dueDate ?? sent
}

// The money coming due: reorders that are due now, and sent POs by when their payment falls due.
export function upcomingSpend(
  list: PurchaseOrder[],
  reorderCost: Money,
  today: string,
  t: ServerText = serverTextInEnglish
) {
  const buckets = [
    { key: "overdue", label: t("overview.due.overdue"), totals: new Map<string, number>(), orders: 0 },
    { key: "next30", label: t("overview.due.next30"), totals: new Map<string, number>(), orders: 0 },
    { key: "next60", label: t("overview.due.next60"), totals: new Map<string, number>(), orders: 0 },
    { key: "later", label: t("overview.due.later"), totals: new Map<string, number>(), orders: 0 }
  ]
  for (const order of list) {
    if (order.status !== "submitted") {
      continue
    }
    const due = paymentDue(order)
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

const tones = { critical: 0, warning: 1, info: 2 }

// What needs the buyer, most urgent first, each with where to fix it.
export function attentionItems(
  input: {
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
  },
  t: ServerText = serverTextInEnglish
): AttentionItem[] {
  const items: AttentionItem[] = []
  if (input.restock.stockouts) {
    items.push({
      key: "stockouts",
      tone: "critical",
      title: t("overview.attention.stockouts", { count: input.restock.stockouts }),
      detail: t("overview.attention.stockoutsDetail"),
      href: "/restock?status=order",
      action: t("overview.attention.planRestock")
    })
  }
  if (input.shipments.problems) {
    items.push({
      key: "shipment-problems",
      tone: "critical",
      title: t("overview.attention.shipmentProblems", { count: input.shipments.problems }),
      detail: t("overview.attention.shipmentProblemsDetail"),
      href: "/shipments",
      action: t("overview.attention.viewShipments")
    })
  }
  if (input.shipments.waiting) {
    items.push({
      key: "shipments-waiting",
      tone: "warning",
      title: t("overview.attention.shipmentsWaiting", { count: input.shipments.waiting }),
      detail: t("overview.attention.shipmentsWaitingDetail"),
      href: "/shipments",
      action: t("overview.attention.viewShipments")
    })
  }
  if (input.restock.reorders) {
    items.push({
      key: "reorders",
      tone: "warning",
      title: t("overview.attention.reorders", { count: input.restock.reorders }),
      detail: t("overview.attention.reordersDetail"),
      href: "/restock?status=order",
      action: t("overview.attention.planRestock")
    })
  }
  for (const source of input.restock.sources) {
    if (source.error) {
      items.push({
        key: `demand-${source.source}`,
        tone: "warning",
        title: t("overview.attention.demandFailed", { source: source.source }),
        detail: source.error,
        href: "/sales",
        action: t("overview.attention.viewOrders")
      })
    }
  }
  for (const sync of input.syncs) {
    const name = sync.source
    const busy = ["queued", "running"].includes(sync.status)
    if (sync.status === "failed") {
      items.push({
        key: `sync-${sync.source}`,
        tone: "warning",
        title: t("overview.attention.syncFailed", { source: name }),
        detail: t("overview.attention.syncFailedDetail"),
        href: "/sales",
        action: t("overview.attention.viewOrders")
      })
    } else if (!busy && sync.coveredTo && input.now.getTime() - sync.coveredTo.getTime() > staleAfter) {
      items.push({
        key: `sync-${sync.source}`,
        tone: "info",
        title: t("overview.attention.syncStale", {
          source: name,
          days: Math.floor((input.now.getTime() - sync.coveredTo.getTime()) / day)
        }),
        detail: t("overview.attention.syncStaleDetail"),
        href: "/sales",
        action: t("overview.attention.viewOrders")
      })
    }
    if (sync.feesErrorCode === "reconnect") {
      items.push({
        key: `fees-${sync.source}`,
        tone: "warning",
        title: t("overview.attention.feesReconnect", { source: name }),
        detail: t("overview.attention.feesReconnectDetail"),
        href: "/settings#integrations",
        action: t("overview.attention.openSettings")
      })
    } else if (sync.feesErrorCode) {
      items.push({
        key: `fees-${sync.source}`,
        tone: "warning",
        title: t(
          sync.source === "amazon" ? "overview.attention.amazonFeesFailed" : "overview.attention.shopifyChargesFailed"
        ),
        detail: t(
          sync.source === "amazon"
            ? "overview.attention.amazonFeesFailedDetail"
            : "overview.attention.shopifyChargesFailedDetail"
        ),
        href: "/sales",
        action: t("overview.attention.viewOrders")
      })
    }
    if (sync.unpriced && sync.outdated && !busy) {
      items.push({
        key: `prices-${sync.source}`,
        tone: "info",
        title: t("overview.attention.unpriced", { source: name }),
        detail: t("overview.attention.unpricedDetail", { count: sync.unpriced }),
        href: "/sales",
        action: t("overview.attention.viewOrders")
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
      title: t("overview.attention.stockFailed"),
      detail: t("overview.attention.stockFailedDetail"),
      href: "/products",
      action: t("overview.attention.viewProducts")
    })
  } else if (staleStock.length) {
    items.push({
      key: "stock-stale",
      tone: "info",
      title: t("overview.attention.stockStale"),
      detail: t("overview.attention.stockStaleDetail"),
      href: "/products",
      action: t("overview.attention.viewProducts")
    })
  }
  if (input.shopifyHistoryLimited) {
    items.push({
      key: "shopify-history",
      tone: "info",
      title: t("overview.attention.shopifyHistory"),
      detail: t("overview.attention.shopifyHistoryDetail"),
      href: "/settings#integrations",
      action: t("overview.attention.openSettings")
    })
  }
  if (input.drafts) {
    items.push({
      key: "drafts",
      tone: "info",
      title: t("overview.attention.drafts", { count: input.drafts }),
      detail: t("overview.attention.draftsDetail"),
      href: "/orders",
      action: t("overview.attention.viewPurchaseOrders")
    })
  }
  return items.toSorted((a, b) => tones[a.tone] - tones[b.tone])
}

// A step whose first sync is running says so, with how much of the order history is copied when that's known.
export type SetupStep = {
  key: string
  title: string
  detail: string
  href: string
  done: boolean
  syncing?: { progress: number | null }
}

// The steps that make the Overview complete, in the order a new buyer takes them.
export function setupSteps(
  input: {
    connected: SalesSource[]
    ordersCopied: SalesSource[]
    stockSynced: boolean
    // A first order sync's progress (null when it isn't known yet), and whether a first stock sync is running.
    ordersSyncing?: { progress: number | null } | null
    stockSyncing?: boolean
    inStock: number
    uncosted: number
  },
  t: ServerText = serverTextInEnglish
): SetupStep[] {
  const allCopied = input.connected.length > 0 && input.connected.every((source) => input.ordersCopied.includes(source))
  return [
    {
      key: "shopify",
      title: t("overview.setup.shopify"),
      detail: t("overview.setup.shopifyDetail"),
      href: "/settings#integrations",
      done: input.connected.includes("shopify")
    },
    {
      key: "amazon",
      title: t("overview.setup.amazon"),
      detail: t("overview.setup.amazonDetail"),
      href: "/settings#integrations",
      done: input.connected.includes("amazon")
    },
    {
      key: "orders",
      title: t("overview.setup.orders"),
      detail: t("overview.setup.ordersDetail"),
      href: "/sales",
      done: allCopied && !input.ordersSyncing,
      ...(input.ordersSyncing ? { syncing: input.ordersSyncing } : {})
    },
    {
      key: "stock",
      title: t("overview.setup.stock"),
      detail: t("overview.setup.stockDetail"),
      href: "/products",
      done: input.stockSynced,
      ...(input.stockSyncing && !input.stockSynced ? { syncing: { progress: null } } : {})
    },
    {
      key: "costs",
      title: t("overview.setup.costs"),
      detail: t("overview.setup.costsDetail"),
      href: "/products",
      done: input.inStock > 0 && input.uncosted === 0
    }
  ]
}

// The first order syncs still copying history, as one progress: the average of theirs. A source that has synced
// before is set up, even while a later sync copies older history.
function firstSyncProgress(
  syncs: {
    source: SalesSource
    status: string
    coveredFrom: Date | null
    coveredTo: Date | null
    finishedAt: Date | null
  }[],
  connected: { provider: string; scopes: string }[]
) {
  const running = syncs.flatMap((sync) => {
    if (sync.finishedAt) {
      return []
    }
    const account = connected.find((row) => row.provider === sync.source)
    const progress = account ? orderSyncProgress(sync, historyDaysFor(sync.source, account.scopes)) : null
    return progress === null ? [] : [progress]
  })
  return running.length ? { progress: running.reduce((sum, value) => sum + value, 0) / running.length } : null
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
      || coalesce(${suppliers.removedAt}::text, ''), ','
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

async function cachedRestock(orgId: string, now: number, settings: { days: number; leadTimeDays: number }) {
  // A change to the workspace's sales period or lead time recalculates.
  const fingerprint = `${await restockFingerprint(orgId)}:${settings.days}:${settings.leadTimeDays}`
  const cached = restockCache.get(orgId)
  if (cached && cached.fingerprint === fingerprint && now - cached.at < restockCacheMs) {
    return cached.value
  }
  const value = await restockAllChannels(orgId, settings.days, settings.leadTimeDays)
  restockCache.set(orgId, { fingerprint, at: now, value })
  return value
}

// Everything the Overview shows for a buyer, for every channel or one of them (a restock channel key: "amazon" or
// "shopify:<location>", an Amazon marketplace such as "amazon:ca", or "ebay").
export async function overview(
  // `timeZone` is the store's: the one set in Settings, or else the viewer's computer's (see storeTimeZone).
  // `restockSalesDays` and `restockLeadTimeDays` are the workspace's restock settings (null uses the defaults).
  org: { id: string; timeZone: string; restockSalesDays?: number | null; restockLeadTimeDays?: number | null },
  // `period` is the page's query: `period`, or `from` and `to`, and `compare` (see readPeriod).
  options: { channel?: string | null; period?: Record<string, string | string[] | undefined>; now?: Date } = {}
) {
  const now = options.now ?? new Date()
  const t = await serverText()
  const settings = restockSettings(org)
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
  const amazonLinked = accounts.find((account) => account.provider === "amazon")
  const [restock, currency, marketplaces] = await Promise.all([
    cachedRestock(orgId, now.getTime(), settings),
    reportingCurrency(orgId),
    amazonLinked
      ? storedMarketplaces(orgId, amazonLinked.externalId, zonedStart(addDays(today, -365), timeZone))
      : Promise.resolve([])
  ])
  // Amazon can also be narrowed to one marketplace ("amazon:ca"), when it sells in more than one. Its stock is shared,
  // so stock and POs stay Amazon's; sales, fees and charges are the marketplace's.
  // eBay is a channel of its own once connected. It sells from the stock at the Shopify location its orders count at,
  // so its stock and POs are that location's; its sales, fees and charges are eBay's.
  const channelOptions = [
    ...restock.channels.flatMap((channel) => [
      { key: channel.key, label: channel.label },
      ...(channel.key === "amazon" && marketplaces.length > 1
        ? marketplaces.map((marketplace) => ({
            key: `amazon:${marketplace.code}`,
            label: t("overview.marketplace", { code: marketplace.code })
          }))
        : [])
    ]),
    ...(accounts.some((account) => account.provider === "ebay") ? [{ key: "ebay", label: "eBay" }] : [])
  ]
  const selected = channelOptions.find((channel) => channel.key === options.channel) ?? null
  const ebaySelected = selected?.key === "ebay"
  const ebayStock = restock.ebayLocationId ? `shopify:${restock.ebayLocationId}` : null
  // The restock channel the choice belongs to: Amazon for any Amazon marketplace, and eBay's location for eBay.
  let restockKey: string | null = selected?.key ?? null
  if (selected?.key.startsWith("amazon")) {
    restockKey = "amazon"
  } else if (ebaySelected) {
    restockKey = ebayStock
  }
  const marketplaceId = selected?.key.startsWith("amazon:")
    ? (marketplaces.find((marketplace) => `amazon:${marketplace.code}` === selected.key)?.id ?? null)
    : null
  let channelSource: SalesSource | null = null
  if (ebaySelected) {
    channelSource = "ebay"
  } else if (restockKey) {
    channelSource = restockKey === "amazon" ? "amazon" : "shopify"
  }
  // A Shopify location shows the Shopify orders shipped from it.
  const locationId = selected?.key.startsWith("shopify:") ? selected.key.slice("shopify:".length) : null
  // Where the chosen channel's stock is received: the Shopify location, or eBay's.
  const stockLocationId = restockKey?.startsWith("shopify:") ? restockKey.slice("shopify:".length) : null
  // With Amazon connected, its orders come from Amazon, not from the copies Shopify's Amazon channel keeps.
  const amazonConnected = accounts.some((account) => account.provider === "amazon")
  const excludedTags = await excludedShopifyTags(orgId)
  const scopedAccounts = accounts
    .filter((account) => !channelSource || account.provider === channelSource)
    .map((account) => ({
      ...account,
      locationId: account.provider === "shopify" ? locationId : null,
      excludedTags: account.provider === "shopify" ? excludedTags : [],
      withoutAmazon: account.provider === "shopify" && amazonConnected,
      marketplaceId: account.provider === "amazon" ? marketplaceId : null
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
      .where(and(eq(orders.buyerOrgId, orgId), eq(events.messageKey, "submittedToSupplier")))
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
    label: t("overview.monthlyCost", { name: cost.name }),
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
    dayRows
      .filter((row) => row.currency)
      .toSorted((a, b) => b.revenueMinor - a.revenueMinor)
      .at(0)?.currency ?? null
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
  const profit = grossProfit(itemRows, index, fees, charges, freight, t)
  // Trends compare the period with the one it's compared with, for sources whose orders cover both.
  const previousStart = window.previous?.from
  const comparable = previousStart ? covered.filter((source) => coverage[source]!.from <= previousStart) : []
  const trending = movers(itemRows, index, comparable, t)
  const priceOf = sellingPrices(priceRows, index)

  // eBay without a location of its own to count at has no stock to show.
  const scopedChannels = restock.channels.filter(
    (channel) => (!restockKey && !ebaySelected) || channel.key === restockKey
  )
  // Stockouts over the page's period, so the sales they cost match the other figures.
  const periodOut = await periodStockouts(orgId, restock, window.current)
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
    landedCost,
    // Amazon's stock history is by seller SKU, Shopify's by variant.
    (line, channelKey) =>
      periodOut.get(channelKey)?.get(channelKey === "amazon" ? (line.sku ?? "") : line.variantId) ?? 0
  )
  // The setup checklist looks at every channel, whichever is chosen.
  const everyChannel = selected ? summarizeRestock(restock.channels, undefined, landedCost) : summary

  // POs (and their shipments) for the chosen channel: to Amazon, or received at the chosen Shopify location.
  const deliveryLocations = new Map(deliveries.map((row) => [row.id, row.locationId]))
  const scopedOrders = purchaseOrders.filter((order) => {
    if (!selected) {
      return true
    }
    if (restockKey === "amazon") {
      return order.data.destination === "amazon"
    }
    return stockLocationId !== null && receivingLocations(order.data, deliveryLocations).includes(stockLocationId)
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
  const buying = purchasing(poList)
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
    // The restock channel the chosen channel's stock and POs belong to ("amazon" or "shopify:<location>").
    restockChannel: restockKey,
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
    setup: setupSteps(
      {
        connected: accounts.map((account) => account.provider),
        ordersCopied: current.filter((sync) => sync.coveredTo).map((sync) => sync.source),
        stockSynced:
          stockSources.length > 0 &&
          stockSources.every((source) => stock.some((row) => row.source === source && row.snapshotId)),
        ordersSyncing: firstSyncProgress(current, connected),
        stockSyncing: stock.some((row) => row.status === "queued" || row.status === "running"),
        inStock: everyChannel.unitsOnHand,
        uncosted: everyChannel.uncosted
      },
      t
    ),
    sales: {
      sources,
      daily: series,
      totals,
      // The previous period's days, for the chart's comparison line.
      previousDaily: previousSeries,
      currency: salesCurrency,
      profit,
      // Orders whose fees are estimated because the platform hasn't posted them yet.
      estimatedFeeOrders: Object.values(fees).reduce((sum, platform) => sum + platform.estimatedOrders, 0),
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
      days: settings.days,
      leadTimeDays: settings.leadTimeDays,
      ...summary,
      // Products whose costs include freight and duty from a PO's landed costs.
      landedProducts: markups.size
    },
    purchasing: buying,
    upcoming: upcomingSpend(poList, summary.reorderCost, today, t),
    attention: attentionItems(
      {
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
      },
      t
    )
  }
}

export type Overview = Awaited<ReturnType<typeof overview>>
