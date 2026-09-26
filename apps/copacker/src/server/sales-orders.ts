import { type AmazonSale, collectAmazonSales, collectShopifySales, type ShopifySale } from "@repo/aisle/sales"
import { and, count, desc, eq, gte, lt, or, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { connections, jobs, salesOrders, salesSyncs } from "@/db/schema"
import type { Session } from "./auth"
import { amazonFor, connection, shopifyFor } from "./connections"
import { ReconnectRequiredError } from "./errors"
import { effectiveLocationClassifications } from "./inventory-location-settings"
import { attributeAmazonSales, attributeShopifySales } from "./sales-attribution"
import { summarizeDemandGaps, type DemandGap, type DemandRow } from "./sales-attribution"
import { describeError, stockErrorCode } from "./stock"

export const salesSources = ["shopify", "amazon"] as const
export type SalesSource = (typeof salesSources)[number]

// How far back orders are kept, how much recent history each sync reads again (shipments and cancellations arrive
// after the order), and the period each provider read covers.
export const salesHistoryDays = 365
const refreshDays = 30
const chunkDays = 14
const day = 86400000

export class SalesSyncError extends Error {}

// Starts a sync for one source. The worker copies orders in chunks; restock reads the stored copy.
export async function requestSalesSync(s: Session, source: SalesSource) {
  if (s.org.kind !== "buyer") {
    throw new SalesSyncError("A buyer workspace is required")
  }
  return db().transaction(async (tx) => {
    const [account] = await tx
      .select({ externalId: connections.externalId, scopes: connections.scopes })
      .from(connections)
      .where(and(eq(connections.orgId, s.org.id), eq(connections.provider, source)))
    if (!account) {
      throw new SalesSyncError(`Connect ${source === "shopify" ? "Shopify" : "Amazon"} in Settings first`)
    }
    if (source === "shopify") {
      const scopes = new Set(account.scopes.split(/[,\s]+/))
      if (!scopes.has("read_orders") && !scopes.has("write_orders")) {
        throw new SalesSyncError("Reconnect Shopify to grant order history access")
      }
    }
    const [current] = await tx
      .select()
      .from(salesSyncs)
      .where(and(eq(salesSyncs.orgId, s.org.id), eq(salesSyncs.source, source)))
      .for("update")
    if (current && ["queued", "running"].includes(current.status) && current.externalAccountId === account.externalId) {
      return { status: current.status }
    }
    // A different account starts over; its orders don't belong to the new one.
    const sameAccount = current?.externalAccountId === account.externalId
    const revision = (current?.revision ?? 0) + 1
    const values = {
      externalAccountId: account.externalId,
      status: "queued" as const,
      revision,
      requestedAt: new Date(),
      errorCode: null,
      ...(sameAccount ? {} : { coveredFrom: null, coveredTo: null })
    }
    await tx
      .insert(salesSyncs)
      .values({ orgId: s.org.id, source, ...values })
      .onConflictDoUpdate({ target: [salesSyncs.orgId, salesSyncs.source], set: values })
    await tx
      .insert(jobs)
      .values({
        key: `sales:${s.org.id}:${source}:${revision}`,
        kind: "sales",
        payload: { orgId: s.org.id, source, revision }
      })
      .onConflictDoNothing()
    return { status: "queued" }
  })
}

// The periods a sync reads, in order. Each touches the stored range, so the range stays unbroken and grows as the sync
// runs: first the recent orders (from the refresh period before the stored end), then older history backwards to the
// history start. With nothing usable stored, it reads from newest to oldest, so recent orders are usable soonest.
export function syncChunks(
  now: number,
  coverage: { coveredFrom: Date | null; coveredTo: Date | null },
  historyDays = salesHistoryDays
) {
  // Orders need a couple of minutes to settle.
  const end = Math.floor((now - 180000) / 60000) * 60000
  const historyStart = end - historyDays * day
  const size = chunkDays * day
  const chunks: { from: Date; to: Date }[] = []
  const usable = coverage.coveredFrom && coverage.coveredTo && coverage.coveredTo.getTime() >= historyStart
  if (!usable) {
    for (let to = end; to > historyStart; to -= size) {
      chunks.push({ from: new Date(Math.max(historyStart, to - size)), to: new Date(to) })
    }
    return { chunks, fresh: true }
  }
  const storedFrom = coverage.coveredFrom!.getTime()
  const storedTo = coverage.coveredTo!.getTime()
  for (let from = Math.max(historyStart, storedFrom, storedTo - refreshDays * day); from < end; from += size) {
    chunks.push({ from: new Date(from), to: new Date(Math.min(from + size, end)) })
  }
  for (let to = storedFrom; to > historyStart; to -= size) {
    chunks.push({ from: new Date(Math.max(historyStart, to - size)), to: new Date(to) })
  }
  return { chunks, fresh: false }
}

const payloadSchema = z.object({ orgId: z.uuid(), source: z.enum(salesSources), revision: z.number().int().positive() })

// Worker job: copies one source's orders into sales_orders, a chunk at a time. Each chunk replaces the stored orders
// in its period, so cancelled or test orders that disappear from the source disappear here too.
export async function salesJob(payload: Record<string, unknown>, assertOwned: () => Promise<void>) {
  const { orgId, source, revision } = payloadSchema.parse(payload)
  const scope = and(eq(salesSyncs.orgId, orgId), eq(salesSyncs.source, source), eq(salesSyncs.revision, revision))
  const [sync] = await db().select().from(salesSyncs).where(scope)
  if (!sync || !["queued", "running"].includes(sync.status)) {
    return
  }
  await db().update(salesSyncs).set({ status: "running" }).where(scope)
  const account = sync.externalAccountId
  try {
    const { scopes } = await connection(orgId, source)
    // Without read_all_orders Shopify shares only the last 60 days.
    const historyDays =
      source === "shopify" && !scopes.split(/[,\s]+/).includes("read_all_orders") ? 60 : salesHistoryDays
    const { chunks, fresh } = syncChunks(Date.now(), sync, historyDays)
    type Stored = { orderId: string; orderedAt: Date; data: ShopifySale | AmazonSale }
    let read: (window: { from: string; to: string }) => Promise<Stored[]>
    if (source === "shopify") {
      const shopify = await shopifyFor(orgId, account)
      read = async (window) =>
        (await collectShopifySales(shopify, account, window, assertOwned)).map((order) => ({
          orderId: order.id,
          orderedAt: new Date(order.createdAt),
          data: order
        }))
    } else {
      const amazon = await amazonFor(orgId, account)
      read = async (window) =>
        (await collectAmazonSales(amazon, window, assertOwned)).map((order) => ({
          orderId: order.orderId,
          orderedAt: new Date(order.createdTime),
          data: order
        }))
    }
    let covered = fresh || !sync.coveredFrom || !sync.coveredTo ? null : { from: sync.coveredFrom, to: sync.coveredTo }
    for (const chunk of chunks) {
      const orders = await read({ from: chunk.from.toISOString(), to: chunk.to.toISOString() })
      await assertOwned()
      covered = covered
        ? {
            from: chunk.from < covered.from ? chunk.from : covered.from,
            to: chunk.to > covered.to ? chunk.to : covered.to
          }
        : chunk
      const range = covered
      await db().transaction(async (tx) => {
        const [current] = await tx.select({ revision: salesSyncs.revision }).from(salesSyncs).where(scope).for("update")
        if (!current) {
          throw new Error("A newer sync replaced this one")
        }
        const stored = and(
          eq(salesOrders.orgId, orgId),
          eq(salesOrders.source, source),
          eq(salesOrders.externalAccountId, account),
          gte(salesOrders.orderedAt, chunk.from),
          lt(salesOrders.orderedAt, chunk.to)
        )
        await tx.delete(salesOrders).where(stored)
        for (let index = 0; index < orders.length; index += 200) {
          await tx
            .insert(salesOrders)
            .values(
              orders.slice(index, index + 200).map((order) => ({ orgId, source, externalAccountId: account, ...order }))
            )
            .onConflictDoUpdate({
              target: [salesOrders.orgId, salesOrders.source, salesOrders.externalAccountId, salesOrders.orderId],
              // An order whose time moved into another chunk; the newer copy wins.
              set: { orderedAt: sql`excluded."orderedAt"`, data: sql`excluded.data`, syncedAt: new Date() }
            })
        }
        await tx.update(salesSyncs).set({ coveredFrom: range.from, coveredTo: range.to }).where(scope)
      })
    }
    await db().update(salesSyncs).set({ status: "idle", finishedAt: new Date(), errorCode: null }).where(scope)
  } catch (error) {
    const errorCode = stockErrorCode(error)
    console.error(JSON.stringify({ event: "sales_sync_failed", source, orgId, errorCode, error: describeError(error) }))
    await db().update(salesSyncs).set({ status: "failed", finishedAt: new Date(), errorCode }).where(scope)
    throw new Error(`Sales sync failed (${errorCode})`, { cause: error })
  }
}

// Each connected source's sync state and the orders stored for it.
export async function salesSyncStatus(orgId: string) {
  const since = new Date(Date.now() - 30 * day)
  const [accounts, syncs, stored, recent] = await Promise.all([
    db()
      .select({ provider: connections.provider, externalId: connections.externalId })
      .from(connections)
      .where(eq(connections.orgId, orgId)),
    db().select().from(salesSyncs).where(eq(salesSyncs.orgId, orgId)),
    db()
      .select({
        source: salesOrders.source,
        externalAccountId: salesOrders.externalAccountId,
        orders: count()
      })
      .from(salesOrders)
      .where(eq(salesOrders.orgId, orgId))
      .groupBy(salesOrders.source, salesOrders.externalAccountId),
    db()
      .select({
        source: salesOrders.source,
        externalAccountId: salesOrders.externalAccountId,
        orderedAt: salesOrders.orderedAt,
        data: salesOrders.data
      })
      .from(salesOrders)
      .where(and(eq(salesOrders.orgId, orgId), gte(salesOrders.orderedAt, since)))
  ])
  return salesSources.flatMap((source) => {
    const account = accounts.find((row) => row.provider === source)
    if (!account) {
      return []
    }
    const sync = syncs.find((row) => row.source === source && row.externalAccountId === account.externalId)
    const orders = stored.find((row) => row.source === source && row.externalAccountId === account.externalId)
    const last30 = recent
      .filter((row) => row.source === source && row.externalAccountId === account.externalId)
      .map((row) => summarizeSalesOrder(row.source, row.orderedAt, row.data, row.externalAccountId))
    return [
      {
        source,
        externalAccountId: account.externalId,
        status: sync?.status ?? "idle",
        errorCode: sync?.errorCode ?? null,
        coveredFrom: sync?.coveredFrom?.toISOString() ?? null,
        coveredTo: sync?.coveredTo?.toISOString() ?? null,
        finishedAt: sync?.finishedAt?.toISOString() ?? null,
        orders: orders?.orders ?? 0,
        // Orders and units in the last 30 days.
        recent: { orders: last30.length, units: last30.reduce((sum, order) => sum + order.units, 0) }
      }
    ]
  })
}

// Demand from one source's stored orders over the last `days` days of the stored period. Throws a SalesSyncError
// that says what to do when the orders aren't copied yet or don't reach back far enough.
export async function storedDemand(orgId: string, source: SalesSource, days: number) {
  const title = source === "shopify" ? "Shopify" : "Amazon"
  const [account] = await db()
    .select({ externalId: connections.externalId })
    .from(connections)
    .where(and(eq(connections.orgId, orgId), eq(connections.provider, source)))
  if (!account) {
    throw new SalesSyncError(`Connect ${title} in Settings first`)
  }
  const [sync] = await db()
    .select()
    .from(salesSyncs)
    .where(
      and(
        eq(salesSyncs.orgId, orgId),
        eq(salesSyncs.source, source),
        eq(salesSyncs.externalAccountId, account.externalId)
      )
    )
  if (!sync?.coveredFrom || !sync.coveredTo) {
    throw new SalesSyncError(`Sync ${title} orders on the Orders page first`)
  }
  const to = sync.coveredTo
  const from = new Date(to.getTime() - days * day)
  if (sync.coveredFrom > from) {
    const stored = Math.floor((to.getTime() - sync.coveredFrom.getTime()) / day)
    throw new SalesSyncError(`${title} orders go back ${stored} days. Choose a sales period of ${stored} days or fewer`)
  }
  const rows = await db()
    .select({ data: salesOrders.data })
    .from(salesOrders)
    .where(
      and(
        eq(salesOrders.orgId, orgId),
        eq(salesOrders.source, source),
        eq(salesOrders.externalAccountId, account.externalId),
        gte(salesOrders.orderedAt, from),
        lt(salesOrders.orderedAt, to)
      )
    )
  const orders = rows.map((row) => row.data)
  const demand =
    source === "shopify"
      ? attributeShopifySales(
          orders.filter((order) => "lines" in order),
          await effectiveLocationClassifications(orgId, account.externalId)
        )
      : attributeAmazonSales(orders.filter((order) => "orderItems" in order))
  return { ...demand, window: { from: from.toISOString(), to: to.toISOString() } }
}

export type SalesOrderSummary = {
  source: SalesSource
  orderId: string
  number: string
  orderedAt: string
  units: number
  // What was bought: SKUs and quantities, a bundle once under its own SKU.
  items: { sku: string | null; quantity: number }[]
  channel: string
  status: string
  // The order in Shopify admin or Seller Central.
  url: string
}

const shopifyChannels: Record<string, string> = {
  web: "Online store",
  pos: "Point of sale",
  shopify_draft_order: "Draft order"
}

// Amazon reports statuses such as PARTIALLY_SHIPPED; shown as words.
function words(value: string) {
  const text = value.replaceAll("_", " ").toLocaleLowerCase()
  return text.charAt(0).toLocaleUpperCase() + text.slice(1)
}

// A stored order as the Orders page lists it. Bundle components count once, as the bundle bought.
export function summarizeSalesOrder(
  source: SalesSource,
  orderedAt: Date,
  data: ShopifySale | AmazonSale,
  account: string
): SalesOrderSummary {
  if (source === "shopify" && "lines" in data) {
    const items: SalesOrderSummary["items"] = []
    const groups = new Set<string>()
    for (const line of data.lines) {
      if (line.lineItemGroup) {
        if (!groups.has(line.lineItemGroup.id)) {
          groups.add(line.lineItemGroup.id)
          items.push({ sku: null, quantity: line.lineItemGroup.quantity })
        }
      } else if (line.currentQuantity > 0) {
        items.push({ sku: line.sku, quantity: line.currentQuantity })
      }
    }
    let status = "Unfulfilled"
    if (data.fulfillments.length) {
      const shipped = new Set(
        data.fulfillments.flatMap((fulfillment) => fulfillment.lines.map((line) => line.lineItem.id))
      )
      status = data.lines.every((line) => line.currentQuantity === 0 || shipped.has(line.id))
        ? "Fulfilled"
        : "Partially fulfilled"
    }
    let channel = "Other app"
    if (data.sourceName && shopifyChannels[data.sourceName]) {
      channel = shopifyChannels[data.sourceName]!
    }
    return {
      source,
      orderId: data.id,
      number: data.name,
      orderedAt: orderedAt.toISOString(),
      units: items.reduce((sum, item) => sum + item.quantity, 0),
      items,
      channel,
      status,
      url: `https://admin.shopify.com/store/${account.replace(/\.myshopify\.com$/, "")}/orders/${data.id.split("/").at(-1)}`
    }
  }
  if (source === "amazon" && "orderItems" in data) {
    const fulfilledBy = data.fulfillment?.fulfilledBy
    let channel = "Amazon"
    if (fulfilledBy === "AMAZON") {
      channel = "Amazon FBA"
    } else if (fulfilledBy === "MERCHANT") {
      channel = "Amazon FBM"
    }
    return {
      source,
      orderId: data.orderId,
      number: data.orderId,
      orderedAt: orderedAt.toISOString(),
      units: data.orderItems.reduce((sum, item) => sum + item.quantityOrdered, 0),
      items: data.orderItems.map((item) => ({ sku: item.product.sellerSku ?? null, quantity: item.quantityOrdered })),
      channel,
      status: words(data.fulfillment?.fulfillmentStatus ?? "Unknown"),
      url: `https://sellercentral.amazon.com/orders-v3/order/${encodeURIComponent(data.orderId)}`
    }
  }
  throw new Error("Stored order doesn't match its source")
}

export const salesOrdersPageSize = 50

// Stored orders, newest first, for the connected accounts. The search matches order numbers and SKUs.
export async function listSalesOrders(orgId: string, filter: { source?: SalesSource; page: number; q?: string }) {
  const accounts = await db()
    .select({ provider: connections.provider, externalId: connections.externalId })
    .from(connections)
    .where(eq(connections.orgId, orgId))
  const scopes = accounts.flatMap((account) =>
    !filter.source || filter.source === account.provider
      ? [and(eq(salesOrders.source, account.provider), eq(salesOrders.externalAccountId, account.externalId))]
      : []
  )
  if (scopes.length === 0) {
    return { orders: [], total: 0 }
  }
  const q = filter.q?.trim()
  // ILIKE treats %, _ and \ as special; escape them so they match literally.
  const pattern = q ? `%${q.replace(/[\\%_]/g, (match) => `\\${match}`)}%` : null
  const where = and(
    eq(salesOrders.orgId, orgId),
    or(...scopes),
    pattern ? sql`${salesOrders.data}::text ilike ${pattern}` : undefined
  )
  const [rows, [total]] = await Promise.all([
    db()
      .select({
        source: salesOrders.source,
        externalAccountId: salesOrders.externalAccountId,
        orderedAt: salesOrders.orderedAt,
        data: salesOrders.data
      })
      .from(salesOrders)
      .where(where)
      .orderBy(desc(salesOrders.orderedAt), desc(salesOrders.orderId))
      .limit(salesOrdersPageSize)
      .offset(filter.page * salesOrdersPageSize),
    db().select({ total: count() }).from(salesOrders).where(where)
  ])
  return {
    orders: rows.map((row) => summarizeSalesOrder(row.source, row.orderedAt, row.data, row.externalAccountId)),
    total: total?.total ?? 0
  }
}

type SourceSales = { rows: DemandRow[]; gaps: DemandGap[] }

// Demand from every connected source for restock, with what went wrong for any source that couldn't be read.
export async function restockDemand(orgId: string, providers: string[], days: number) {
  let shopifySales: SourceSales | null = null
  let amazonSales: SourceSales | null = null
  const sources = []
  for (const source of salesSources) {
    if (!providers.includes(source)) {
      continue
    }
    try {
      const result = await storedDemand(orgId, source, days)
      if (source === "shopify") {
        shopifySales = result
      } else {
        amazonSales = result
      }
      sources.push({
        source,
        error: null,
        window: result.window,
        // Units the source reported but couldn't place, such as unfulfilled orders or unmapped sales channels.
        gapUnits: result.gaps.reduce((total, gap) => total + (gap.units ?? 0), 0),
        gapReasons: summarizeDemandGaps(result.gaps)
      })
    } catch (error) {
      console.error(JSON.stringify({ event: "sales_read_failed", source, orgId, error: describeError(error) }))
      sources.push({
        source,
        // Setup problems say what to do; anything else is logged and summarized.
        error:
          error instanceof SalesSyncError || error instanceof ReconnectRequiredError
            ? error.message
            : "Sales couldn't be read. Try again.",
        window: null,
        gapUnits: 0,
        gapReasons: {}
      })
    }
  }
  return { shopifySales, amazonSales, sources }
}
