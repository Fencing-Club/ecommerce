import { and, eq, gte, lt, desc, inArray, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { amazonProductMappings, amazonTransactions, connections, salesSyncs } from "@/db/schema"
import { allocateAmazonPosting } from "./amazon-cost-allocation"
import { amazonPostingDetail } from "./amazon-posting-detail"
import { postingEvidence } from "./amazon-reconciliation"
import { analyticsPagination } from "./analytics-contract"
import { analyticsSnapshot } from "./analytics-snapshot"
export const allocationInput = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
    ...analyticsPagination,
    postingType: z.string().min(1).max(128).optional(),
    transactionId: z.string().min(1).max(200).optional()
  })
  .refine(
    (value) =>
      Date.parse(value.to) > Date.parse(value.from) && Date.parse(value.to) - Date.parse(value.from) <= 31 * 86400000,
    "Choose an increasing window of at most 31 days"
  )
export async function amazonAllocations(orgId: string, input: z.infer<typeof allocationInput>) {
  return db().transaction(
    async (tx) => {
      const snapshot = await analyticsSnapshot(
        tx,
        orgId,
        input,
        JSON.stringify(["allocation", input.from, input.to, input.postingType, input.transactionId])
      )
      const [account] = await tx
        .select()
        .from(connections)
        .where(and(eq(connections.orgId, orgId), eq(connections.provider, "amazon")))
      if (!account) {
        return { snapshot, connected: false, postings: [], hasMore: false }
      }
      const mappings = await tx
        .select()
        .from(amazonProductMappings)
        .where(
          and(eq(amazonProductMappings.orgId, orgId), eq(amazonProductMappings.externalAccountId, account.externalId))
        )
      const rows = await tx
        .select()
        .from(amazonTransactions)
        .where(
          and(
            eq(amazonTransactions.orgId, orgId),
            eq(amazonTransactions.externalAccountId, account.externalId),
            input.postingType ? eq(amazonTransactions.type, input.postingType) : undefined,
            input.transactionId ? eq(amazonTransactions.transactionId, input.transactionId) : undefined,
            gte(amazonTransactions.postedAt, new Date(`${input.from}T00:00:00Z`)),
            lt(amazonTransactions.postedAt, new Date(`${input.to}T00:00:00Z`))
          )
        )
        .orderBy(desc(amazonTransactions.postedAt), amazonTransactions.transactionId)
        .limit(101)
        .offset(input.page * 100)
      const allLinkedIds = [
        ...new Set(
          rows.slice(0, 100).flatMap((row) =>
            postingEvidence(row)
              .references.filter((ref) => ["DEFERRED_TRANSACTION_ID", "RELEASE_TRANSACTION_ID"].includes(ref.name))
              .map((ref) => ref.value)
          )
        )
      ]
      const linkedIds = allLinkedIds.slice(0, 1000)
      const linked = linkedIds.length
        ? await tx
            .select()
            .from(amazonTransactions)
            .where(
              and(
                eq(amazonTransactions.orgId, orgId),
                eq(amazonTransactions.externalAccountId, account.externalId),
                inArray(amazonTransactions.transactionId, linkedIds)
              )
            )
        : []
      const reportTotals = await tx.execute(sql`
        select 'storage:' || kind as source, currency, count(*)::int as rows, count(amount)::int as "knownAmountRows", sum(amount::numeric)::text as amount
        from amazon_storage_fees where "orgId"=${orgId} and "externalAccountId"=${account.externalId}
          and "marketplaceId"='ATVPDKIKX0DER' and "periodDay">=${input.from}::date and "periodDay"<${input.to}::date
        group by kind,currency
        union all
        select 'removals:' || kind, currency, count(*)::int, count("removalFee")::int, sum("removalFee"::numeric)::text
        from amazon_removals where "orgId"=${orgId} and "externalAccountId"=${account.externalId}
          and "marketplaceId"='ATVPDKIKX0DER'
          and (case when kind='orders' then "requestedAt" else "shippedAt" end)>=${`${input.from}T00:00:00Z`}::timestamptz
          and (case when kind='orders' then "requestedAt" else "shippedAt" end)<${`${input.to}T00:00:00Z`}::timestamptz
        group by kind,currency
      `)
      const [coverage] = await tx
        .select({
          from: salesSyncs.feesCoveredFrom,
          to: salesSyncs.feesCoveredTo,
          errorCode: salesSyncs.feesErrorCode,
          status: salesSyncs.status
        })
        .from(salesSyncs)
        .where(
          and(
            eq(salesSyncs.orgId, orgId),
            eq(salesSyncs.source, "amazon"),
            eq(salesSyncs.externalAccountId, account.externalId)
          )
        )
      return {
        snapshot,
        connected: true,
        externalAccountId: account.externalId,
        page: input.page,
        hasMore: rows.length > 100,
        postings: rows
          .slice(0, 100)
          .map((row) => ({ ...allocateAmazonPosting(row, mappings), evidence: amazonPostingDetail(row) })),
        linkedPostings: linked.map(amazonPostingDetail),
        linkedPostingsTruncated: allLinkedIds.length > linkedIds.length,
        missingLinkedTransactionIds: linkedIds.filter((id) => !linked.some((row) => row.transactionId === id)),
        reportComparison: {
          marketplaceId: "ATVPDKIKX0DER",
          from: input.from,
          to: input.to,
          totals: reportTotals.rows,
          reconciled: false,
          basis: "source_period_not_posting_period",
          monthlyStorageBasis: "estimate",
          additionalRecognizedAmount: null
        },
        coverage: coverage ?? null,
        notes: [
          "Amounts are signed posting currency amounts, not profit or COGS.",
          "Recognized fees cover only named supported categories, not all costs.",
          "Report evidence is not added to these financial postings.",
          "Allocations use explicit mappings valid at the posting date; no proportional allocation or current-catalog fallback."
        ]
      }
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  )
}
