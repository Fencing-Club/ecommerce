import { parseFbmReturns } from "@repo/aisle/fbm-returns"
import { and, eq, sql } from "drizzle-orm"
import { db } from "@/db"
import { analyticsFeeds, amazonTransactions } from "@/db/schema"
import { amazonFailureDetails } from "./amazon-diagnostics"
import {
  amazonReportFailure,
  monthlyReportWindows,
  type AmazonReportInput,
  fbaReportMarketplace
} from "./amazon-report-sync"
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
  let failure: string | null = null
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
    let errorCode: string | null = null
    let stage: "request" | "parse" | "period" = "request"
    try {
      await assertOwned()
      const text = await input.amazon.report(
        {
          reportType: "GET_FLAT_FILE_RETURNS_DATA_BY_RETURN_DATE",
          marketplaceIds: [fbaReportMarketplace],
          dataStartTime: window.from.toISOString(),
          dataEndTime: new Date(window.to.getTime() - 1000).toISOString()
        },
        {
          deadline: Date.now() + 20 * 60000,
          assertActive: assertOwned,
          reuseCreatedSince:
            !prior?.state.coveredTo || Date.parse(prior.state.coveredTo) < window.to.getTime()
              ? new Date(now.getTime() - 86400000).toISOString()
              : undefined
        }
      )
      if (text === null) {
        errorCode = "report_cancelled"
        throw new Error("FBM report unavailable")
      }
      stage = "parse"
      const rows = parseFbmReturns(text)
      stage = "period"
      if (rows.some((r) => new Date(r.occurredAt) < window.from || new Date(r.occurredAt) >= window.to)) {
        throw new Error("FBM report outside window")
      }
      stage = "request"
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
    } catch (error) {
      errorCode ??= amazonReportFailure(error, stage)
      console.warn("Amazon seller-fulfilled returns failed", {
        from: window.from.toISOString(),
        stage,
        errorCode,
        ...amazonFailureDetails(error)
      })
      failure = errorCode
      await publishAnalyticsFeed(
        input,
        periodDataset,
        [],
        {
          ...prior?.state,
          error: errorCode
        },
        assertOwned
      )
      if (errorCode === "report_throttled" || errorCode === "report_access_denied") {
        break
      }
    }
  }
  await publishAnalyticsFeed(input, "fbm_returns", [], { error: failure }, assertOwned)
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
