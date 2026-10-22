import type { Amazon } from "@repo/copacker-marketplaces/amazon"
import { ProviderError } from "@repo/copacker-marketplaces/amazon"
import type { AmazonSale } from "@repo/copacker-marketplaces/sales"
import type { EbaySale } from "@repo/copacker-marketplaces/sales"
import type { ShopifySale } from "@repo/copacker-marketplaces/sales"
import {
  collectAmazonSales,
  collectAmazonSalesReport,
  collectEbaySales,
  collectShopifySales,
  ebayLineSales,
  minorUnits,
  orderSales,
  shopifyOrderFees
} from "@repo/copacker-marketplaces/sales"
import { variantName } from "@repo/copacker-marketplaces/shopify"
import { grantedScopes, recentOrderDays } from "@repo/copacker-marketplaces/shopify-auth"
import { amazonNetworkNames } from "@repo/copacker-shipments"
import { and, count, desc, eq, gte, inArray, notInArray, lt, or, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { db } from "@/db"
import { amazonTransactions, connections, jobs, salesOrders, salesSyncs, stockSnapshots } from "@/db/schema"
import { LocalizedError } from "@/i18n/errors"
import type { ServerKey } from "@/i18n/server-text"
import type { ServerText } from "@/i18n/server-text"
import { serverTextInEnglish } from "@/i18n/server-text"
import { presetRange } from "@/lib/date-range"
import { addDays, zonedDay, zonedStart } from "@/lib/time-zone"
import { withJobWake } from "@/server/job-delivery"
import { syncAmazonExtraEvidence } from "./amazon-extra-evidence"
import { syncAmazonFees } from "./amazon-fees"
import { syncAmazonFulfillmentShipments } from "./amazon-fulfillment-shipments"
import { amazonInventoryMovementsStatus, syncAmazonInventoryMovements } from "./amazon-inventory-movements"
import { syncAmazonReceipts } from "./amazon-receipts"
import { amazonReimbursementsStatus, syncAmazonReimbursements } from "./amazon-reimbursements"
import { amazonRemovalsStatus, syncAmazonRemovals } from "./amazon-removals"
import { amazonReturnsStatus, syncAmazonReturns } from "./amazon-returns"
import { syncInboundShipments } from "./amazon-shipments"
import { amazonStorageFeesStatus, syncAmazonStorageFees } from "./amazon-storage-fees"
import { queueShopifyEconomics } from "./analytics-jobs"
import { amazonFor, connection, ebayFor, shopifyFor } from "./connections"
import { countedOrder } from "./counted-orders"
import { ReconnectRequiredError } from "./errors"
import { syncExchangeRates } from "./exchange-rates"
import { syncAutomaticDepletions } from "./inventory-auto-import"
import { effectiveLocationClassifications } from "./inventory-location-settings"
import { jobRow, type JobInput } from "./job-payloads"
import { PollAgain, type JobContext } from "./job-runtime"
import { describeError, logEvent } from "./log"
import { orderUnits } from "./overview-sales"
import type { DemandGap } from "./sales-attribution"
import type { DemandRow } from "./sales-attribution"
import { attributeAmazonSales, attributeEbaySales, attributeShopifySales } from "./sales-attribution"
import { summarizeDemandGaps } from "./sales-attribution"
import { syncShopifyBalance } from "./shopify-balance"
import { excludedShopifyTags, hasExcludedTag, taggedWith } from "./shopify-tags"
import { stockErrorCode } from "./stock"
import { syncLedger } from "./stock-days"
import { serverText } from "./text"
import type { Session } from "./workspace-session"

export const salesSources = ["shopify", "amazon", "ebay"] as const
export type SalesSource = (typeof salesSources)[number]

// How far back orders are kept, how much recent history each sync reads again (shipments and cancellations arrive
// after the order), and the period each provider read covers. Two years: Amazon refuses transaction reads that start
// earlier, and its order search and order reports return nothing older. One day short, so a long sync's later reads
// still start within the two years.
export const salesHistoryDays = 2 * 365 - 1
export const hasCustomerScope = (scopes: string) => grantedScopes(scopes).has("read_customers")

const refreshDays = 30
const chunkDays = 14
const day = 86400000

export class SalesSyncError extends LocalizedError {}

// The marketplaces each seller's orders are read from, kept for a few hours: they rarely change, and Amazon allows few
// requests for them.
const marketplaceCache = new Map<string, { ids: string[]; at: number }>()
export async function amazonSalesMarketplaces(
  sellerId: string,
  amazon: Pick<Amazon, "salesMarketplaces">,
  now = Date.now()
) {
  const cached = marketplaceCache.get(sellerId)
  if (cached && now - cached.at < 6 * 3600000) {
    return cached.ids
  }
  const ids = await amazon.salesMarketplaces()
  marketplaceCache.set(sellerId, { ids, at: now })
  return ids
}

// How far back a source's orders are copied. Without read_all_orders Shopify shares only its recent orders.
export function historyDaysFor(source: SalesSource, scopes: string) {
  return source === "shopify" && !grantedScopes(scopes).has("read_all_orders") ? recentOrderDays : salesHistoryDays
}

// How much of a running first sync's history is copied, from 0 to 1, or null when no sync is copying history. A
// first sync reads from the newest orders back, so its stored range grows toward the history start; a later sync
// already has the history, so it has no progress to show.
export function orderSyncProgress(
  sync: { status: string; coveredFrom: Date | null; coveredTo: Date | null },
  historyDays: number
) {
  if (sync.status !== "queued" && sync.status !== "running") {
    return null
  }
  const copied =
    sync.coveredFrom && sync.coveredTo
      ? (sync.coveredTo.getTime() - sync.coveredFrom.getTime()) / (historyDays * day)
      : 0
  return copied >= 0.99 ? null : Math.max(0, copied)
}

// Starts a sync for one source. The worker copies orders in chunks; restock reads the stored copy.
export async function requestSalesSync(org: Pick<Session["org"], "id" | "kind">, source: SalesSource) {
  if (org.kind !== "buyer") {
    throw new SalesSyncError("buyerWorkspaceRequired")
  }
  return withJobWake(
    db().transaction(async (tx) => {
      const [account] = await tx
        .select({ externalId: connections.externalId, scopes: connections.scopes })
        .from(connections)
        .where(and(eq(connections.orgId, org.id), eq(connections.provider, source)))
      if (!account) {
        throw new SalesSyncError("connectInSettings", { provider: source })
      }
      if (source === "shopify") {
        const scopes = grantedScopes(account.scopes)
        if (!scopes.has("read_orders") && !scopes.has("write_orders")) {
          throw new SalesSyncError("reconnectShopifyOrders")
        }
      }
      const [current] = await tx
        .select()
        .from(salesSyncs)
        .where(and(eq(salesSyncs.orgId, org.id), eq(salesSyncs.source, source)))
        .for("update")
      if (
        current &&
        ["queued", "running"].includes(current.status) &&
        current.externalAccountId === account.externalId
      ) {
        // A sync whose job failed or went missing (such as one a worker couldn't run) would wait forever; it starts again.
        const [job] = await tx
          .select({ status: jobs.status })
          .from(jobs)
          .where(eq(jobs.key, `sales:${org.id}:${source}:${current.revision}`))
        if (job && ["pending", "running"].includes(job.status)) {
          return { status: current.status }
        }
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
        ...(sameAccount ? {} : { coveredFrom: null, coveredTo: null, customersIncluded: false })
      }
      await tx
        .insert(salesSyncs)
        .values({ orgId: org.id, source, ...values })
        .onConflictDoUpdate({ target: [salesSyncs.orgId, salesSyncs.source], set: values })
      await tx
        .insert(jobs)
        .values(jobRow("sales", `sales:${org.id}:${source}:${revision}`, { orgId: org.id, source, revision }))
        .onConflictDoNothing()
      return { status: "queued" }
    })
  )
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
  // A stored range that stopped more than the refresh period ago would leave restock waiting while the sync crawls
  // forward from it, so it starts over from the newest orders; the copied orders stay until re-read.
  const usable = coverage.coveredFrom && coverage.coveredTo && coverage.coveredTo.getTime() >= end - refreshDays * day
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

// Amazon's order search allows few requests, and a year is many periods. A throttled period waits and tries again,
// up to 5 times, instead of failing the whole sync.
export async function throttled<T>(read: () => Promise<T>, assertOwned: () => Promise<void>, sleep = wait): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await read()
    } catch (error) {
      if (!(error instanceof ProviderError) || ![429, 503].includes(error.status) || attempt >= 4) {
        throw error
      }
      await sleep(Math.max(error.retryAfterMs ?? 0, 60000 * (attempt + 1)))
      await assertOwned()
    }
  }
}
function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// How long Amazon's order report can take to include a new order.
const reportLagMs = 2 * day
// Amazon's order search allows about one request every three minutes once its burst of 20 is spent.
const amazonSearchInterval = 180000

// Worker job: copies one source's orders into sales_orders, a chunk at a time. Each chunk replaces the stored orders
// in its period, so cancelled or test orders that disappear from the source disappear here too.
export async function salesJob(
  { orgId, source, revision, resume: savedResume }: JobInput<"sales">,
  { assertOwned }: Pick<JobContext, "assertOwned">
) {
  const scope = and(eq(salesSyncs.orgId, orgId), eq(salesSyncs.source, source), eq(salesSyncs.revision, revision))
  const [sync] = await db().select().from(salesSyncs).where(scope)
  if (!sync || !["queued", "running"].includes(sync.status)) {
    return
  }
  await db().update(salesSyncs).set({ status: "running" }).where(scope)
  const account = sync.externalAccountId
  let searches = 0
  try {
    const { scopes } = await connection(orgId, source)
    const historyDays = historyDaysFor(source, scopes)
    const customersIncluded = source === "shopify" && hasCustomerScope(scopes)
    // A checkpoint can finish only under the permission used to plan it. Existing checkpoints without this
    // metadata must also replan, so a scope change cannot mark an incomplete customer history as complete.
    const resume =
      source === "shopify" && savedResume?.customersIncluded !== customersIncluded ? undefined : savedResume
    // Newly granted customer access needs a complete read, not just the recent refresh window.
    const coverage = customersIncluded && !sync.customersIncluded ? { coveredFrom: null, coveredTo: null } : sync
    const planned = resume ? null : syncChunks(Date.now(), coverage, historyDays)
    const chunks =
      resume?.remaining.map((chunk) => ({ from: new Date(chunk.from), to: new Date(chunk.to) })) ?? planned!.chunks
    type Stored = { orderId: string; orderedAt: Date; data: ShopifySale | AmazonSale | EbaySale }
    let read: (window: { from: string; to: string }) => Promise<Stored[]>
    // Amazon also copies daily FBA stock, so restock can leave out days an item was out of stock, and its fees.
    let afterOrders: (() => Promise<unknown>)[] = []
    if (source === "shopify") {
      // Shopify Payments' labels, bills and dispute fees are copied after the orders.
      afterOrders = [
        () => syncShopifyBalance({ orgId, externalAccountId: account, revision, scopes }, assertOwned),
        () => queueShopifyEconomics({ orgId, externalAccountId: account, revision })
      ]
      // Read one period per attempt instead of buffering a whole historical bulk export in Worker memory.
      const customers = hasCustomerScope(scopes)
      read = async (window) =>
        (await collectShopifySales(await shopifyFor(orgId, account), account, window, assertOwned, { customers })).map(
          (order) => ({ orderId: order.id, orderedAt: new Date(order.createdAt), data: order })
        )
    } else if (source === "ebay") {
      const client = await ebayFor(orgId, account)
      // Orders in another currency are converted at each day's rate.
      afterOrders = [
        () =>
          syncExchangeRates(orgId).then(
            () => undefined,
            (error: unknown) =>
              console.error(JSON.stringify({ event: "exchange_rates_failed", orgId, error: describeError(error) }))
          )
      ]
      read = async (window) =>
        (await collectEbaySales(client, window, assertOwned)).map((order) => ({
          orderId: order.orderId,
          orderedAt: new Date(order.creationDate),
          data: order
        }))
    } else {
      const client = await amazonFor(orgId, account)
      // Order searches are counted, so a throttled period waits long enough to read all its pages when it resumes.
      const amazon = {
        request: ((...args) => {
          searches++
          return client.request(...args)
        }) as typeof client.request
      }
      const input = { orgId, externalAccountId: account, revision, amazon: client }
      afterOrders = [
        () => syncAmazonFulfillmentShipments(input, assertOwned),
        () => syncAmazonReturns(input, assertOwned),
        () => syncAmazonReimbursements(input, assertOwned),
        () => syncAmazonInventoryMovements(input, assertOwned),
        () => syncAmazonStorageFees(input, "monthly", assertOwned),
        () => syncAmazonStorageFees(input, "aged", assertOwned),
        () => syncAmazonRemovals(input, "orders", assertOwned),
        () => syncAmazonRemovals(input, "shipments", assertOwned),
        () => syncLedger(input, assertOwned),
        () => syncAmazonFees(input, assertOwned),
        () =>
          syncInboundShipments(input, assertOwned).catch((error) =>
            console.error(JSON.stringify({ event: "inbound_shipments_failed", orgId, error: describeError(error) }))
          ),
        () => syncAmazonReceipts(input, assertOwned),
        () => syncAmazonExtraEvidence(input, assertOwned),
        () =>
          syncExchangeRates(orgId).catch((error) =>
            console.error(JSON.stringify({ event: "exchange_rates_failed", orgId, error: describeError(error) }))
          )
      ]
      const marketplaces = await amazonSalesMarketplaces(account, client)
      // Older periods come from Amazon's order report, one report per period, which is much faster than the order
      // search's pace. Recent ones use the order search, since the report can lag behind new orders; so does a period
      // whose report Amazon couldn't build.
      const fromReport = async (window: { from: string; to: string }) => {
        if (Date.parse(window.to) >= Date.now() - reportLagMs) {
          return null
        }
        try {
          return await collectAmazonSalesReport(client, window, marketplaces, assertOwned)
        } catch (error) {
          // Throttled: pause like the order search does. Anything else: read the period with the order search.
          if (error instanceof ProviderError && [429, 503].includes(error.status)) {
            throw error
          }
          console.error(JSON.stringify({ event: "amazon_order_report_failed", orgId, error: describeError(error) }))
          return null
        }
      }
      read = async (window) =>
        ((await fromReport(window)) ?? (await collectAmazonSales(amazon, window, assertOwned, marketplaces))).map(
          (order) => ({
            orderId: order.orderId,
            orderedAt: new Date(order.createdTime),
            data: order
          })
        )
    }
    let covered: { from: Date; to: Date } | null = null
    if (resume) {
      covered = resume.covered && { from: new Date(resume.covered.from), to: new Date(resume.covered.to) }
    } else if (!planned!.fresh && sync.coveredFrom && sync.coveredTo) {
      covered = { from: sync.coveredFrom, to: sync.coveredTo }
    }
    const checkpoint = (remaining: typeof chunks, after = 0) =>
      new PollAgain("Sales import checkpoint saved", {
        delayMs: 1000,
        progressed: true,
        payload: {
          orgId,
          source,
          revision,
          resume: {
            remaining: remaining.map((chunk) => ({ from: chunk.from.toISOString(), to: chunk.to.toISOString() })),
            covered: covered && { from: covered.from.toISOString(), to: covered.to.toISOString() },
            customersIncluded,
            after
          }
        }
      })
    for (const [index, chunk] of chunks.entries()) {
      const window = { from: chunk.from.toISOString(), to: chunk.to.toISOString() }
      let orders: Stored[]
      if (source === "amazon") {
        // A throttled Amazon read hands the worker back instead of sleeping, so other jobs run meanwhile, and resumes
        // at this period once Amazon allows enough searches to read all of it.
        searches = 0
        try {
          orders = await read(window)
        } catch (error) {
          if (!(error instanceof ProviderError) || ![429, 503].includes(error.status)) {
            throw error
          }
          const iso = (range: { from: Date; to: Date }) => ({
            from: range.from.toISOString(),
            to: range.to.toISOString()
          })
          throw new PollAgain("Amazon is limiting order searches; the sync resumes shortly", {
            delayMs: Math.max(error.retryAfterMs ?? 0, amazonSearchInterval * Math.max(1, searches)),
            payload: {
              orgId,
              source,
              revision,
              resume: { remaining: chunks.slice(index).map(iso), covered: covered && iso(covered) }
            },
            progressed: index > 0
          })
        }
      } else {
        orders = await throttled(() => read(window), assertOwned)
      }
      await assertOwned()
      logEvent("info", "sales_orders_copied", {
        source,
        orders: orders.length,
        from: window.from,
        to: window.to,
        period: index + 1,
        periods: chunks.length
      })
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
        await tx.delete(salesOrders).where(
          and(
            stored,
            orders.length
              ? notInArray(
                  salesOrders.orderId,
                  orders.map((order) => order.orderId)
                )
              : undefined
          )
        )
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
        // Extend coverage only after the complete period has been stored.
        await tx.update(salesSyncs).set({ coveredFrom: range.from, coveredTo: range.to }).where(scope)
      })
      throw checkpoint(chunks.slice(index + 1))
    }
    const after = resume?.after ?? 0
    const next = afterOrders[after]
    if (next) {
      await next()
      throw checkpoint([], after + 1)
    }
    if (source === "shopify" || source === "amazon") {
      await syncAutomaticDepletions(orgId, source, account, assertOwned)
    }
    await db()
      .update(salesSyncs)
      .set({ status: "idle", finishedAt: new Date(), errorCode: null, customersIncluded })
      .where(scope)
  } catch (error) {
    // A paused sync stays running; the queue runs it again.
    if (error instanceof PollAgain) {
      throw error
    }
    const errorCode = stockErrorCode(error)
    console.error(JSON.stringify({ event: "sales_sync_failed", source, orgId, errorCode, error: describeError(error) }))
    await db().update(salesSyncs).set({ status: "failed", finishedAt: new Date(), errorCode }).where(scope)
    throw new Error(`Sales sync failed (${errorCode})`, { cause: error })
  }
}

// Each connected source's sync state and the orders stored for it, without Shopify orders that have an excluded tag.
export async function salesSyncStatus(orgId: string, timeZone = "UTC", now = new Date()) {
  // The Overview's "Last 30 days": the 30 days before today in the store's time zone.
  const recentRange = presetRange("last30", zonedDay(now, timeZone))
  const since = zonedStart(recentRange.from, timeZone)
  const until = zonedStart(addDays(recentRange.to, 1), timeZone)
  // The orders the Overview counts: see counted-orders.
  const tags = await excludedShopifyTags(orgId)
  const included = sql`not ${taggedWith(sql`${salesOrders.data}`, tags)} and ${countedOrder(sql`${salesOrders.data}`)}`
  const recentOrders = alias(salesOrders, "o")
  const [accounts, syncs, stored, recent] = await Promise.all([
    db()
      .select({ provider: connections.provider, externalId: connections.externalId, scopes: connections.scopes })
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
      .where(and(eq(salesOrders.orgId, orgId), included))
      .groupBy(salesOrders.source, salesOrders.externalAccountId),
    db()
      .select({
        source: recentOrders.source,
        externalAccountId: recentOrders.externalAccountId,
        orders: count(),
        units: sql<number>`coalesce(sum(${orderUnits}), 0)`.mapWith(Number)
      })
      .from(recentOrders)
      .where(
        and(
          eq(recentOrders.orgId, orgId),
          gte(recentOrders.orderedAt, since),
          lt(recentOrders.orderedAt, until),
          sql`not ${taggedWith(sql`${recentOrders.data}`, tags)} and ${countedOrder(sql`${recentOrders.data}`)}`
        )
      )
      .groupBy(recentOrders.source, recentOrders.externalAccountId)
  ])
  const amazonAccount = accounts.find((account) => account.provider === "amazon")
  const removals = amazonAccount
    ? {
        orders: await amazonRemovalsStatus(orgId, amazonAccount.externalId, "orders", now),
        shipments: await amazonRemovalsStatus(orgId, amazonAccount.externalId, "shipments", now)
      }
    : null
  const storageFees = amazonAccount
    ? {
        monthly: await amazonStorageFeesStatus(orgId, amazonAccount.externalId, "monthly", now),
        aged: await amazonStorageFeesStatus(orgId, amazonAccount.externalId, "aged", now)
      }
    : null
  const returns = amazonAccount ? await amazonReturnsStatus(orgId, amazonAccount.externalId, now) : null
  const reimbursements = amazonAccount ? await amazonReimbursementsStatus(orgId, amazonAccount.externalId, now) : null
  const inventoryMovements = amazonAccount
    ? await amazonInventoryMovementsStatus(orgId, amazonAccount.externalId, now)
    : null
  return salesSources.flatMap((source) => {
    const account = accounts.find((row) => row.provider === source)
    if (!account) {
      return []
    }
    const sync = syncs.find((row) => row.source === source && row.externalAccountId === account.externalId)
    const orders = stored.find((row) => row.source === source && row.externalAccountId === account.externalId)
    const last30 = recent.find((row) => row.source === source && row.externalAccountId === account.externalId)
    return [
      {
        source,
        externalAccountId: account.externalId,
        ...(source === "amazon"
          ? {
              returns,
              reimbursements,
              inventoryMovements,
              storageFees,
              removals,
              fees: {
                coveredFrom: sync?.feesCoveredFrom?.toISOString() ?? null,
                coveredTo: sync?.feesCoveredTo?.toISOString() ?? null,
                errorCode: sync?.feesErrorCode ?? null
              }
            }
          : {}),
        status: sync?.status ?? "idle",
        errorCode: sync?.errorCode ?? null,
        coveredFrom: sync?.coveredFrom?.toISOString() ?? null,
        coveredTo: sync?.coveredTo?.toISOString() ?? null,
        finishedAt: sync?.finishedAt?.toISOString() ?? null,
        progress: sync ? orderSyncProgress(sync, historyDaysFor(source, account.scopes)) : null,
        orders: orders?.orders ?? 0,
        // Orders and units in the last 30 days.
        recent: { orders: last30?.orders ?? 0, units: last30?.units ?? 0 }
      }
    ]
  })
}

// Demand from one source's stored orders over the last `days` days of the stored period. Throws a SalesSyncError
// that says what to do when the orders aren't copied yet or don't reach back far enough.
export async function storedDemand(orgId: string, source: SalesSource, days: number) {
  const [account] = await db()
    .select({ externalId: connections.externalId })
    .from(connections)
    .where(and(eq(connections.orgId, orgId), eq(connections.provider, source)))
  if (!account) {
    throw new SalesSyncError("connectInSettings", { provider: source })
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
    throw new SalesSyncError("syncOrdersFirst", { provider: source })
  }
  const to = sync.coveredTo
  const from = new Date(to.getTime() - days * day)
  if (sync.coveredFrom > from) {
    const stored = Math.floor((to.getTime() - sync.coveredFrom.getTime()) / day)
    throw new SalesSyncError("ordersGoBack", { provider: source, days: stored })
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
  // Orders with an excluded tag, such as Shopify's copies of Amazon orders, aren't Shopify demand.
  const excluded = await excludedShopifyTags(orgId)
  const orders = rows.map((row) => row.data).filter((order) => !hasExcludedTag(order, excluded))
  let demand
  if (source === "shopify") {
    demand = attributeShopifySales(
      orders.filter((order) => "lines" in order),
      await effectiveLocationClassifications(orgId, account.externalId)
    )
  } else if (source === "ebay") {
    demand = attributeEbaySales(orders.filter((order) => "lineItems" in order))
  } else {
    demand = attributeAmazonSales(orders.filter((order) => "orderItems" in order))
  }
  // The days each item sold (by variant on Shopify, by seller SKU on Amazon and eBay): it was in stock somewhere on
  // those days.
  const saleDays = new Map<string, Set<string>>()
  const sold = (key: string | null | undefined, at: string) => {
    if (key) {
      const days = saleDays.get(key) ?? new Set<string>()
      days.add(at.slice(0, 10))
      saleDays.set(key, days)
    }
  }
  for (const order of orders) {
    if ("lines" in order) {
      for (const line of order.lines) {
        sold(line.variant?.id, new Date(order.createdAt).toISOString())
      }
    } else if ("lineItems" in order) {
      for (const line of order.lineItems) {
        sold(line.sku, new Date(order.creationDate).toISOString())
      }
    } else {
      for (const item of order.orderItems) {
        sold(item.product.sellerSku, new Date(order.createdTime).toISOString())
      }
    }
  }
  return { ...demand, saleDays, window: { from: from.toISOString(), to: to.toISOString() } }
}

export type SalesOrderSummary = {
  source: SalesSource
  orderId: string
  number: string
  orderedAt: string
  units: number
  // What was bought: SKUs and quantities, a bundle once under its own SKU. `name` is the product (and variation) from
  // the synced Shopify catalog, when it has it.
  items: { sku: string | null; variantId?: string | null; name?: string | null; quantity: number }[]
  channel: string
  status: string
  // The Amazon order this one replaces, when it's a replacement sent free.
  replacementOf?: string | null
  // The order in Shopify admin, Seller Central or eBay's Seller Hub.
  url: string
  // Net product sales (after discounts, before tax and shipping); null while a provider has not priced the order.
  sales: { minor: number; currency: string } | null
  // Fees the platform charged on the order: Amazon's posted fees, or Shopify Payments' processing fees. Null when none
  // are known yet.
  fees: { minor: number; currency: string } | null
}

const shopifyChannels: Record<string, ServerKey> = {
  web: "salesChannels.web",
  pos: "salesChannels.pos",
  shopify_draft_order: "salesChannels.draftOrder"
}

// eBay's fulfillment statuses, named as Shopify's are.
const ebayStatuses: Record<string, string> = {
  NOT_STARTED: "Unfulfilled",
  IN_PROGRESS: "Partially fulfilled",
  FULFILLED: "Fulfilled"
}

// Amazon reports statuses such as PARTIALLY_SHIPPED; shown as words.
function words(value: string) {
  const text = value.replaceAll("_", " ").toLocaleLowerCase()
  return text.charAt(0).toLocaleUpperCase() + text.slice(1)
}

// A stored order as the Orders page lists it, its channel in t's language. Bundle components count once, as the bundle
// bought.
export function summarizeSalesOrder(
  source: SalesSource,
  orderedAt: Date,
  data: ShopifySale | AmazonSale | EbaySale,
  account: string,
  t: ServerText = serverTextInEnglish
): SalesOrderSummary {
  if (source === "shopify" && "lines" in data) {
    const items: SalesOrderSummary["items"] = []
    const groups = new Set<string>()
    for (const line of data.lines) {
      if (line.lineItemGroup) {
        if (!groups.has(line.lineItemGroup.id)) {
          groups.add(line.lineItemGroup.id)
          items.push({ sku: null, variantId: line.lineItemGroup.variantId, quantity: line.lineItemGroup.quantity })
        }
      } else if (line.currentQuantity > 0) {
        items.push({ sku: line.sku, variantId: line.variant?.id ?? null, quantity: line.currentQuantity })
      }
    }
    // An order Shopify cancelled is Cancelled whatever shipped; otherwise its shipments decide.
    let status = "Unfulfilled"
    if (data.cancelledAt) {
      status = "Cancelled"
    } else if (data.fulfillments.length) {
      const shipped = new Set(
        data.fulfillments.flatMap((fulfillment) => fulfillment.lines.map((line) => line.lineItem.id))
      )
      status = data.lines.every((line) => line.currentQuantity === 0 || shipped.has(line.id))
        ? "Fulfilled"
        : "Partially fulfilled"
    }
    let channel = t("salesChannels.otherApp")
    if (data.sourceName && shopifyChannels[data.sourceName]) {
      channel = t(shopifyChannels[data.sourceName]!)
    } else if (data.sourceName?.startsWith("amazon")) {
      // Shopify's Amazon sales channel copies Amazon orders into Shopify, such as "amazon-us".
      const marketplace = data.sourceName.slice("amazon-".length).toUpperCase()
      channel = marketplace
        ? t("salesChannels.amazonMarketplaceViaShopify", { marketplace })
        : t("salesChannels.amazonViaShopify")
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
      sales: orderSales(data),
      fees: shopifyOrderFees(data),
      url: `https://admin.shopify.com/store/${account.replace(/\.myshopify\.com$/, "")}/orders/${data.id.split("/").at(-1)}`
    }
  }
  if (source === "amazon" && "orderItems" in data) {
    const replacementOf =
      data.associatedOrders?.find((order) => order.associationType === "REPLACEMENT_ORIGINAL_ID")?.orderId ?? null
    const fulfilledBy = data.fulfillment?.fulfilledBy
    let channel = "Amazon"
    if (fulfilledBy === "AMAZON") {
      channel = `Amazon ${amazonNetworkNames.fba}`
    } else if (fulfilledBy === "MERCHANT") {
      channel = "Amazon FBM"
    }
    return {
      source,
      orderId: data.orderId,
      number: data.orderId,
      orderedAt: orderedAt.toISOString(),
      units: data.orderItems.reduce((sum, item) => sum + item.quantityOrdered, 0),
      replacementOf,
      items: data.orderItems.map((item) => ({ sku: item.product.sellerSku ?? null, quantity: item.quantityOrdered })),
      channel,
      status: words(data.fulfillment?.fulfillmentStatus ?? "Unknown"),
      // A replacement is sent free, as the Overview counts it.
      sales: replacementOf ? { minor: 0, currency: "USD" } : orderSales(data),
      // Posted with Amazon's transactions; the Orders page adds them.
      fees: null,
      url: `https://sellercentral.amazon.com/orders-v3/order/${encodeURIComponent(data.orderId)}`
    }
  }
  if (source === "ebay" && "lineItems" in data) {
    const fee = data.totalMarketplaceFee
    return {
      source,
      orderId: data.orderId,
      number: data.salesRecordReference ?? data.orderId,
      orderedAt: orderedAt.toISOString(),
      units: data.lineItems.reduce((sum, line) => sum + ebayLineSales(data, line).units, 0),
      // Lines refunded in full are gone, as Shopify's removed lines are.
      items: data.lineItems.flatMap((line) => {
        const { units } = ebayLineSales(data, line)
        return units > 0 ? [{ sku: line.sku?.trim() || null, name: line.title ?? null, quantity: units }] : []
      }),
      channel: "eBay",
      status: ebayStatuses[data.orderFulfillmentStatus] ?? words(data.orderFulfillmentStatus),
      sales: orderSales(data),
      fees: fee ? { minor: minorUnits(fee.value), currency: fee.currency } : null,
      url: `https://www.ebay.com/sh/ord/details?orderid=${encodeURIComponent(data.orderId)}`
    }
  }
  throw new Error("Stored order doesn't match its source")
}

export const salesOrdersPageSize = 50

// Stored orders, newest first, for the connected accounts, without Shopify orders that have an excluded tag. The
// search matches order numbers, SKUs and product titles.
// Drizzle writes an array as a parenthesized list of values; an empty one would be invalid SQL.
const listed = (values: string[]) => (values.length ? values : [""])

// The listed items' product names from the synced Shopify catalog, by variant and by SKU (Amazon items only have a
// SKU). Read from the snapshot in the database, so only the listed items' rows are returned.
async function productNames(orgId: string, domain: string, orders: SalesOrderSummary[]) {
  const variantIds = [...new Set(orders.flatMap((order) => order.items.flatMap((item) => item.variantId ?? [])))]
  const skus = [...new Set(orders.flatMap((order) => order.items.flatMap((item) => item.sku ?? [])))]
  const byVariant = new Map<string, string>()
  const bySku = new Map<string, string>()
  if (variantIds.length === 0 && skus.length === 0) {
    return { byVariant, bySku }
  }
  const result = await db().execute(sql`
    select r->>'variantId' as "variantId", r->>'buyerSku' as sku, r->>'productTitle' as product,
      r->>'variantTitle' as variant
    from ${stockSnapshots} s, jsonb_array_elements(s.data->'rows') r
    where s."orgId" = ${orgId} and s.source = 'shopify' and s."externalAccountId" = ${domain} and s."scopeKey" = 'store'
      and (r->>'variantId' in ${listed(variantIds)} or r->>'buyerSku' in ${listed(skus)})`)
  for (const row of (result as unknown as { rows: Record<string, unknown>[] }).rows) {
    if (typeof row.product !== "string") {
      continue
    }
    const variant = typeof row.variant === "string" ? variantName(row.variant) : null
    const name = variant ? `${row.product}, ${variant}` : row.product
    if (typeof row.variantId === "string") {
      byVariant.set(row.variantId, name)
    }
    // A SKU several variations share can't name one.
    if (typeof row.sku === "string") {
      bySku.set(row.sku, bySku.has(row.sku) && bySku.get(row.sku) !== name ? "" : name)
    }
  }
  for (const [sku, name] of bySku) {
    if (!name) {
      bySku.delete(sku)
    }
  }
  return { byVariant, bySku }
}

// A pattern that finds the text anywhere. ILIKE treats %, _ and \ as special; escape them so they match literally.
const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, (match) => `\\${match}`)}%`

// The variants and SKUs whose product and variation title contain every word of the search, from the synced Shopify
// catalog, so orders can be found by product name.
async function matchingProducts(orgId: string, domain: string, q: string) {
  const words = q.split(/ +/).map(likePattern)
  const result = await db().execute(sql`
    select distinct r->>'variantId' as "variantId", r->>'buyerSku' as sku
    from ${stockSnapshots} s, jsonb_array_elements(s.data->'rows') r
    where s."orgId" = ${orgId} and s.source = 'shopify' and s."externalAccountId" = ${domain} and s."scopeKey" = 'store'
      and ${sql.join(
        words.map((word) => sql`concat_ws(' ', r->>'productTitle', r->>'variantTitle') ilike ${word}`),
        sql` and `
      )}
    limit 1000`)
  const rows = (result as unknown as { rows: Record<string, unknown>[] }).rows
  return {
    variantIds: rows.flatMap((row) => (typeof row.variantId === "string" ? [row.variantId] : [])),
    skus: rows.flatMap((row) => (typeof row.sku === "string" && row.sku ? [row.sku] : []))
  }
}

// Someone who doesn't see prices searches only order numbers, SKUs and product titles, so no search finds orders by
// their amounts.
export async function listSalesOrders(
  orgId: string,
  filter: { source?: SalesSource; page: number; q?: string },
  { prices = true }: { prices?: boolean } = {}
) {
  const t = await serverText()
  const included = sql`not ${taggedWith(sql`${salesOrders.data}`, await excludedShopifyTags(orgId))}`
  const accounts = await db()
    .select({ provider: connections.provider, externalId: connections.externalId })
    .from(connections)
    .where(eq(connections.orgId, orgId))
  const scopes = accounts.flatMap((account) =>
    !filter.source || filter.source === account.provider
      ? [
          and(
            eq(salesOrders.source, account.provider),
            eq(salesOrders.externalAccountId, account.externalId),
            account.provider === "shopify" ? included : undefined
          )
        ]
      : []
  )
  if (scopes.length === 0) {
    return { orders: [], total: 0 }
  }
  const q = filter.q?.trim()
  const pattern = q ? likePattern(q) : null
  const shopifyAccount = accounts.find((account) => account.provider === "shopify")
  const titled = q && shopifyAccount ? await matchingProducts(orgId, shopifyAccount.externalId, q) : null
  const where = and(
    eq(salesOrders.orgId, orgId),
    or(...scopes),
    pattern
      ? or(
          prices
            ? sql`${salesOrders.data}::text ilike ${pattern}`
            : sql`(concat_ws(' ', ${salesOrders.orderId}, ${salesOrders.data}->>'name') ilike ${pattern}
                or exists (select 1 from jsonb_array_elements(coalesce(${salesOrders.data}->'lines', ${salesOrders.data}->'orderItems', ${salesOrders.data}->'lineItems')) l
                  where concat_ws(' ', l->>'sku', l->'product'->>'sellerSku', l->>'title') ilike ${pattern}))`,
          titled && (titled.variantIds.length || titled.skus.length)
            ? sql`exists (select 1 from jsonb_array_elements(coalesce(${salesOrders.data}->'lines', ${salesOrders.data}->'orderItems', ${salesOrders.data}->'lineItems')) l
                where l->'variant'->>'id' in ${listed(titled.variantIds)}
                  or l->'lineItemGroup'->>'variantId' in ${listed(titled.variantIds)}
                  or l->>'sku' in ${listed(titled.skus)}
                  or l->'product'->>'sellerSku' in ${listed(titled.skus)})`
            : undefined
        )
      : undefined
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
  // Amazon's fees on the listed orders, from the transactions copied so far.
  const amazonIds = rows.flatMap((row) =>
    row.source === "amazon" && "orderItems" in row.data ? [row.data.orderId] : []
  )
  const posted = amazonIds.length
    ? await db()
        .select({
          orderId: amazonTransactions.orderId,
          externalAccountId: amazonTransactions.externalAccountId,
          currency: amazonTransactions.currency,
          fees: sql<number>`sum(${amazonTransactions.feesMinor})`.mapWith(Number)
        })
        .from(amazonTransactions)
        .where(
          and(
            eq(amazonTransactions.orgId, orgId),
            inArray(amazonTransactions.orderId, amazonIds),
            // A release of a deferred payment repeats that payment's fees.
            sql`not coalesce(${amazonTransactions.data}->'relatedIdentifiers', '[]'::jsonb) @> '[{"relatedIdentifierName": "DEFERRED_TRANSACTION_ID"}]'`
          )
        )
        .groupBy(amazonTransactions.orderId, amazonTransactions.externalAccountId, amazonTransactions.currency)
    : []
  const orders = rows.map((row) => {
    const order = summarizeSalesOrder(row.source, row.orderedAt, row.data, row.externalAccountId, t)
    if (row.source !== "amazon") {
      return order
    }
    const fee = posted.find(
      (entry) => entry.orderId === order.orderId && entry.externalAccountId === row.externalAccountId
    )
    return fee ? { ...order, fees: { minor: fee.fees, currency: fee.currency } } : order
  })
  const names = shopifyAccount ? await productNames(orgId, shopifyAccount.externalId, orders) : null
  return {
    orders: names
      ? orders.map((order) => ({
          ...order,
          items: order.items.map((item) => ({
            ...item,
            // The catalog's name, or the one the order came with (eBay lines carry their listing's title).
            name:
              (item.variantId && names.byVariant.get(item.variantId)) ||
              (item.sku && names.bySku.get(item.sku)) ||
              item.name ||
              null
          }))
        }))
      : orders,
    total: total?.total ?? 0
  }
}

type SourceSales = { rows: DemandRow[]; gaps: DemandGap[] }

// Demand from every connected source for restock, with what went wrong for any source that couldn't be read.
export async function restockDemand(orgId: string, providers: string[], days: number) {
  let shopifySales: SourceSales | null = null
  let amazonSales: SourceSales | null = null
  let ebaySales: SourceSales | null = null
  const sources = []
  for (const source of salesSources) {
    if (!providers.includes(source)) {
      continue
    }
    try {
      const result = await storedDemand(orgId, source, days)
      if (source === "shopify") {
        shopifySales = result
      } else if (source === "ebay") {
        ebaySales = result
      } else {
        amazonSales = result
      }
      sources.push({
        source,
        error: null,
        window: result.window,
        saleDays: result.saleDays,
        // Units the source reported but couldn't place, such as unfulfilled orders or unmapped sales channels.
        gapUnits: result.gaps.reduce((total, gap) => total + (gap.units ?? 0), 0),
        gapReasons: summarizeDemandGaps(result.gaps)
      })
    } catch (error) {
      const needsSetup = error instanceof SalesSyncError || error instanceof ReconnectRequiredError
      // Missing history and account setup are expected availability states, already surfaced to the buyer.
      if (!needsSetup) {
        console.error(JSON.stringify({ event: "sales_read_failed", source, orgId, error: describeError(error) }))
      }
      sources.push({
        source,
        // Setup problems say what to do; anything else is logged and summarized.
        error: needsSetup ? error.message : "Sales couldn't be read. Try again.",
        window: null,
        saleDays: new Map<string, Set<string>>(),
        gapUnits: 0,
        gapReasons: {}
      })
    }
  }
  return { shopifySales, amazonSales, ebaySales, sources }
}
