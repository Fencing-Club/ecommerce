import { parseFbmReturns } from "@repo/aisle/fbm-returns"
import { and, eq, sql } from "drizzle-orm"
import { db } from "@/db"
import { analyticsFeeds, amazonTransactions } from "@/db/schema"
import { monthlyReportWindows, type AmazonReportInput, fbaReportMarketplace } from "./amazon-report-sync"
import { publishAnalyticsFeed } from "./analytics-feed-store"
export async function syncAmazonExtraEvidence(
  input: AmazonReportInput,
  assertOwned: () => Promise<void>,
  now = new Date()
) {
  const feeds = await db()
    .select()
    .from(analyticsFeeds)
    .where(
      and(
        eq(analyticsFeeds.orgId, input.orgId),
        eq(analyticsFeeds.source, "amazon"),
        eq(analyticsFeeds.externalAccountId, input.externalAccountId)
      )
    )
  const windows = monthlyReportWindows(now)
  let failed = false
  for (const [index, window] of windows.entries()) {
    const periodDataset = `fbm_returns:${window.from.toISOString().slice(0, 7)}`
    const prior = feeds.find((feed) => feed.dataset === periodDataset)
    const refreshMs = (index < 2 || prior?.state.error ? 1 : 30) * 86400000
    if (
      prior &&
      !prior.state.error &&
      prior.state.coveredTo &&
      Date.parse(prior.state.coveredTo) >= window.to.getTime() &&
      prior.checkedAt.getTime() > now.getTime() - refreshMs
    ) {
      continue
    }
    try {
      await assertOwned()
      const text = await input.amazon.report(
        {
          reportType: "GET_FLAT_FILE_RETURNS_DATA_BY_RETURN_DATE",
          marketplaceIds: [fbaReportMarketplace],
          dataStartTime: window.from.toISOString(),
          dataEndTime: new Date(window.to.getTime() - 1000).toISOString()
        },
        { deadline: Date.now() + 20 * 60000, assertActive: assertOwned, retryCreate: false }
      )
      if (text === null) {
        throw new Error("FBM report unavailable")
      }
      const rows = parseFbmReturns(text)
      if (rows.some((r) => new Date(r.occurredAt) < window.from || new Date(r.occurredAt) >= window.to)) {
        throw new Error("FBM report outside window")
      }
      await publishAnalyticsFeed(
        input,
        "fbm_returns",
        [
          {
            id: window.from.toISOString(),
            data: { from: window.from.toISOString(), to: window.to.toISOString(), rows, status: "imported" }
          }
        ],
        { error: null },
        assertOwned
      )
      await publishAnalyticsFeed(
        input,
        periodDataset,
        [],
        {
          coveredFrom: window.from.toISOString(),
          coveredTo: window.to.toISOString(),
          error: null
        },
        assertOwned
      )
    } catch {
      failed = true
      await publishAnalyticsFeed(
        input,
        periodDataset,
        [],
        {
          ...prior?.state,
          error: "report_failed"
        },
        assertOwned
      )
    }
  }
  await publishAnalyticsFeed(input, "fbm_returns", [], { error: failed ? "report_failed" : null }, assertOwned)
  // Reuse signed finance records. These are evidence references, not additional expense postings.
  const rows = await db()
    .select()
    .from(amazonTransactions)
    .where(
      and(
        eq(amazonTransactions.orgId, input.orgId),
        eq(amazonTransactions.externalAccountId, input.externalAccountId),
        sql`${amazonTransactions.data}->>'description' like 'AWD%'`
      )
    )
    .orderBy(amazonTransactions.postedAt)
    .limit(10001)
  await publishAnalyticsFeed(
    input,
    "awd_costs",
    rows.slice(0, 10000).map((r) => ({
      id: r.transactionId,
      data: {
        transactionId: r.transactionId,
        postedAt: r.postedAt.toISOString(),
        currency: r.currency,
        totalMinor: r.totalMinor,
        orderId: r.orderId,
        data: r.data,
        allocation: "unallocated",
        accountingBasis: "existing_financial_posting"
      }
    })),
    { error: rows.length > 10000 ? "row_limit" : null },
    assertOwned
  )
}
