import { and, eq, gte, lt, desc } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { amazonProductMappings, amazonTransactions, connections, salesSyncs } from "@/db/schema"
import { allocateAmazonPosting } from "./amazon-cost-allocation"
import { analyticsPagination } from "./analytics-contract"
import { analyticsSnapshot } from "./analytics-snapshot"
export const allocationInput = z
  .object({ from: z.iso.date(), to: z.iso.date(), ...analyticsPagination })
  .refine(
    (value) =>
      Date.parse(value.to) > Date.parse(value.from) && Date.parse(value.to) - Date.parse(value.from) <= 31 * 86400000,
    "Choose an increasing window of at most 31 days"
  )
export async function amazonAllocations(orgId: string, input: z.infer<typeof allocationInput>) {
  return db().transaction(
    async (tx) => {
      const snapshot = await analyticsSnapshot(tx, orgId, input, JSON.stringify(["allocation", input.from, input.to]))
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
            gte(amazonTransactions.postedAt, new Date(`${input.from}T00:00:00Z`)),
            lt(amazonTransactions.postedAt, new Date(`${input.to}T00:00:00Z`))
          )
        )
        .orderBy(desc(amazonTransactions.postedAt), amazonTransactions.transactionId)
        .limit(101)
        .offset(input.page * 100)
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
        postings: rows.slice(0, 100).map((row) => allocateAmazonPosting(row, mappings)),
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
