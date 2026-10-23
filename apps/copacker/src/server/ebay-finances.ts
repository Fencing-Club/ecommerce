import { ProviderError } from "@repo/copacker-marketplaces/amazon"
import {
  collectEbayFinances,
  collectEbayPayoutTransactions,
  ebayFinanceScope,
  ebayPayout,
  readEbayPayout,
  ebayTransactionKey
} from "@repo/copacker-marketplaces/ebay-finances"
import { and, asc, eq, sql } from "drizzle-orm"
import { db } from "@/db"
import { analyticsEvidence, analyticsFeeds } from "@/db/schema"
import { publishAnalyticsFeed } from "./analytics-feed-store"
import { ebayFor } from "./connections"
import { reconcileEbayPayout } from "./ebay-payout-reconciliation"
import { SyncSupersededError } from "./sales-sync-coverage"

// Independent date windows, never a lookup triggered by an individual order. Finances can lag orders.
export async function syncEbayFinances(
  input: { orgId: string; externalAccountId: string; revision: number; scopes: string },
  assertOwned: () => Promise<void>,
  now = new Date()
) {
  const feed = { ...input, source: "ebay" as const }
  const scope = (dataset: string) =>
    and(
      eq(analyticsFeeds.orgId, input.orgId),
      eq(analyticsFeeds.source, "ebay"),
      eq(analyticsFeeds.externalAccountId, input.externalAccountId),
      eq(analyticsFeeds.dataset, dataset)
    )
  const [prior] = await db().select().from(analyticsFeeds).where(scope("financial_transactions"))
  const [priorPayout] = await db().select().from(analyticsFeeds).where(scope("payouts"))
  const [completed] = await db()
    .select()
    .from(analyticsFeeds)
    .where(
      and(
        eq(analyticsFeeds.orgId, input.orgId),
        eq(analyticsFeeds.source, "ebay"),
        eq(analyticsFeeds.externalAccountId, input.externalAccountId),
        eq(analyticsFeeds.dataset, "financial_sync")
      )
    )
  if (!input.scopes.split(/\s+/).includes(ebayFinanceScope)) {
    await publishAnalyticsFeed(
      feed,
      "financial_transactions",
      [],
      { ...prior?.state, error: "finance_permission_required" },
      assertOwned,
      now
    )
    return
  }
  if (completed && now.getTime() - completed.checkedAt.getTime() < 86400000) {
    return
  }
  if (prior?.state.retryAt && Date.parse(prior.state.retryAt) > now.getTime()) {
    return
  }
  // A full rolling refresh catches delayed fees/payout assignment without repeatedly reading years of orders.
  const from = new Date(now.getTime() - 30 * 86400000).toISOString(),
    to = now.toISOString()
  const client = await ebayFor(input.orgId, input.externalAccountId)
  const coveredFrom = prior?.state.coveredTo && prior.state.coveredTo >= from ? (prior.state.coveredFrom ?? from) : from
  const state = { coveredFrom, coveredTo: to, error: null }
  const payoutState = {
    coveredFrom:
      priorPayout?.state.coveredTo && priorPayout.state.coveredTo >= from
        ? (priorPayout.state.coveredFrom ?? from)
        : from,
    coveredTo: to,
    error: null
  }
  let result: Awaited<ReturnType<typeof collectEbayFinances>>
  try {
    result = await collectEbayFinances(client, { from, to }, assertOwned)
  } catch (error) {
    if (error instanceof SyncSupersededError) {
      throw error
    }
    await publishAnalyticsFeed(
      feed,
      "financial_transactions",
      [],
      {
        ...prior?.state,
        retryAt: new Date(
          now.getTime() + Math.max(900000, error instanceof ProviderError ? (error.retryAfterMs ?? 0) : 0)
        ).toISOString(),
        error:
          error instanceof ProviderError && error.status === 403
            ? "finance_access_denied"
            : "financial_collection_failed"
      },
      assertOwned,
      now
    )
    return
  }
  await publishAnalyticsFeed(
    feed,
    "financial_transactions",
    result.transactions.map((data) => ({ id: ebayTransactionKey(data), data })),
    state,
    assertOwned,
    now
  )
  await publishAnalyticsFeed(
    feed,
    "payouts",
    result.payouts.map((data) => ({ id: data.payoutId, data })),
    payoutState,
    assertOwned,
    now
  )
  // Rotate through saved payouts. Exact payout IDs justify fetching related transactions older than the rolling window.
  // The oldest checked payouts move to the end, so a busy account does not starve older gaps.
  const payouts = await db()
    .select({ data: analyticsEvidence.data })
    .from(analyticsEvidence)
    .leftJoin(
      analyticsFeeds,
      and(
        eq(analyticsFeeds.orgId, analyticsEvidence.orgId),
        eq(analyticsFeeds.source, analyticsEvidence.source),
        eq(analyticsFeeds.externalAccountId, analyticsEvidence.externalAccountId),
        eq(analyticsFeeds.dataset, sql`'payout_reconciliation:' || ${analyticsEvidence.sourceId}`)
      )
    )
    .where(
      and(
        eq(analyticsEvidence.orgId, input.orgId),
        eq(analyticsEvidence.source, "ebay"),
        eq(analyticsEvidence.externalAccountId, input.externalAccountId),
        eq(analyticsEvidence.dataset, "payouts")
      )
    )
    .orderBy(sql`${analyticsFeeds.checkedAt} asc nulls first`, asc(analyticsEvidence.sourceId))
    .limit(5)
  for (const saved of payouts) {
    const payoutId = ebayPayout.parse(saved.data).payoutId
    const dataset = `payout_reconciliation:${payoutId}`
    let payout: Awaited<ReturnType<typeof readEbayPayout>>
    let rows: Awaited<ReturnType<typeof collectEbayPayoutTransactions>>
    try {
      payout = await readEbayPayout(client, payoutId, assertOwned)
      rows = await collectEbayPayoutTransactions(client, payoutId, assertOwned)
    } catch (error) {
      if (error instanceof SyncSupersededError) {
        throw error
      }
      await publishAnalyticsFeed(feed, dataset, [], { error: "payout_collection_failed" }, assertOwned, now)
      if (error instanceof ProviderError && [401, 403, 429].includes(error.status)) {
        const retryAt = new Date(now.getTime() + Math.max(900000, error.retryAfterMs ?? 0)).toISOString()
        await publishAnalyticsFeed(
          feed,
          "financial_transactions",
          [],
          { ...state, retryAt, error: "payout_collection_failed" },
          assertOwned,
          now
        )
        return
      }
      continue
    }
    await publishAnalyticsFeed(
      feed,
      "financial_transactions",
      rows.map((data) => ({ id: ebayTransactionKey(data), data })),
      state,
      assertOwned,
      now
    )
    await publishAnalyticsFeed(
      feed,
      "payout_reconciliation",
      [{ id: payout.payoutId, data: reconcileEbayPayout(payout, rows) }],
      { error: null },
      assertOwned,
      now
    )
    await publishAnalyticsFeed(feed, dataset, [], { error: null }, assertOwned, now)
    await publishAnalyticsFeed(feed, "payouts", [{ id: payout.payoutId, data: payout }], payoutState, assertOwned, now)
  }
  await publishAnalyticsFeed(feed, "financial_sync", [], { error: null }, assertOwned, now)
}
