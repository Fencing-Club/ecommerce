import { and, eq, isNull, inArray, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { inventoryBasisRecords, inventoryLandedCharges } from "@/db/schema"
import { calculateInventoryFifo } from "@/lib/inventory-fifo"
import { analyticsPagination, AnalyticsProblem } from "./analytics-contract"
import { analyticsSnapshot } from "./analytics-snapshot"
import { resolveSaleEvidence } from "./inventory-sale-evidence"
export const fifoQuery = z
  .object({
    ...analyticsPagination,
    shopifyDomain: z.string().min(1).max(200),
    variantId: z.string().min(1).max(200),
    location: z.string().min(1).max(200),
    from: z.iso.date(),
    to: z.iso.date()
  })
  .refine(
    (value) =>
      Date.parse(value.to) > Date.parse(value.from) && Date.parse(value.to) - Date.parse(value.from) <= 31 * 86400000,
    "Choose an increasing window of at most 31 days"
  )
export async function inventoryFifo(orgId: string, input: z.infer<typeof fifoQuery>) {
  return db().transaction(
    async (tx) => {
      const snapshot = await analyticsSnapshot(
        tx,
        orgId,
        input,
        JSON.stringify(["fifo", input.shopifyDomain, input.variantId, input.location, input.from, input.to])
      )
      const records = await tx
        .select()
        .from(inventoryBasisRecords)
        .where(
          and(
            eq(inventoryBasisRecords.orgId, orgId),
            eq(inventoryBasisRecords.shopifyDomain, input.shopifyDomain),
            eq(inventoryBasisRecords.variantId, input.variantId),
            isNull(inventoryBasisRecords.retiredAt)
          )
        )
        .limit(10001)
      if (records.length > 10000) {
        throw new AnalyticsProblem(
          422,
          "calculation_limit",
          "This product exceeds the current 10,000-record calculation limit. No partial result was calculated."
        )
      }
      const opening = records.find((row) => row.kind === "opening" && row.location === input.location)
      if (!opening) {
        throw new AnalyticsProblem(
          422,
          "opening_required",
          "Record an opening balance, including an explicit zero balance when appropriate."
        )
      }
      if (opening.occurredAt > new Date(input.from)) {
        throw new AnalyticsProblem(
          422,
          "opening_after_period_start",
          "The reporting period must start at or after the opening balance."
        )
      }
      const ids = records.filter((row) => row.kind === "purchase").map((row) => row.id)
      const charges = ids.length
        ? await tx
            .select()
            .from(inventoryLandedCharges)
            .where(
              and(
                eq(inventoryLandedCharges.orgId, orgId),
                isNull(inventoryLandedCharges.retiredAt),
                sql`exists(select 1 from jsonb_array_elements(${inventoryLandedCharges.allocations}) a where ${inArray(sql<string>`a->>'purchaseId'`, ids)})`
              )
            )
            .limit(10001)
        : []
      if (charges.length > 10000) {
        throw new AnalyticsProblem(
          422,
          "calculation_limit",
          "This product exceeds the current landed-charge calculation limit. No partial result was calculated."
        )
      }
      const staleDepletions: string[] = []
      for (const record of records) {
        if (
          record.data.input.kind !== "depletion" ||
          !record.data.input.sale ||
          record.location !== input.location ||
          record.occurredAt < opening.occurredAt ||
          record.occurredAt >= new Date(input.to)
        ) {
          continue
        }
        try {
          const resolved = await resolveSaleEvidence(tx, orgId, record.data.input)
          if (!resolved || resolved.evidence.fingerprint !== record.data.saleEvidence?.fingerprint) {
            staleDepletions.push(record.id)
          }
        } catch (error) {
          if (!(error instanceof AnalyticsProblem)) {
            throw error
          }
          staleDepletions.push(record.id)
        }
      }
      if (staleDepletions.length) {
        throw new AnalyticsProblem(
          409,
          "sale_evidence_changed",
          `Correct or retire stale sales depletion records before calculating FIFO: ${staleDepletions.slice(0, 20).join(", ")}`
        )
      }
      const result = calculateInventoryFifo(records, charges, opening, new Date(input.from), new Date(input.to))
      return {
        ...result,
        rows: result.rows.slice(input.page * 100, (input.page + 1) * 100),
        page: input.page,
        hasMore: result.rows.length > (input.page + 1) * 100,
        snapshot
      }
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  )
}
