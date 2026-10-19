import { removalReportTypes, parseRemovalReport } from "@repo/aisle/removals"
import { and, eq, gte, lt } from "drizzle-orm"
import { db } from "@/db"
import { amazonRemovalReports, amazonRemovals } from "@/db/schema"
import {
  type AmazonReportInput,
  fbaReportMarketplace,
  monthlyReportStatus,
  syncMonthlyAmazonReport
} from "./amazon-report-sync"

export async function syncAmazonRemovals(
  input: AmazonReportInput,
  kind: "orders" | "shipments",
  assertOwned: () => Promise<void>,
  now = new Date()
) {
  const { orgId, externalAccountId } = input
  const marketplaceId = fbaReportMarketplace
  const reports = await db()
    .select()
    .from(amazonRemovalReports)
    .where(
      and(
        eq(amazonRemovalReports.orgId, orgId),
        eq(amazonRemovalReports.kind, kind),
        eq(amazonRemovalReports.externalAccountId, externalAccountId),
        eq(amazonRemovalReports.marketplaceId, marketplaceId)
      )
    )
  await syncMonthlyAmazonReport(input, assertOwned, now, {
    reportType: removalReportTypes[kind],
    combineMonths: true,
    reports,
    parse: (text) => parseRemovalReport(text, kind),
    timestamp: (row) => (kind === "orders" ? row.requestedAt : row.shippedAt!),
    replace: async (tx, window, rows, importedAt) => {
      await tx
        .delete(amazonRemovals)
        .where(
          and(
            eq(amazonRemovals.orgId, orgId),
            eq(amazonRemovals.kind, kind),
            eq(amazonRemovals.externalAccountId, externalAccountId),
            eq(amazonRemovals.marketplaceId, marketplaceId),
            gte(kind === "orders" ? amazonRemovals.requestedAt : amazonRemovals.shippedAt, window.from),
            lt(kind === "orders" ? amazonRemovals.requestedAt : amazonRemovals.shippedAt, window.to)
          )
        )
      for (let index = 0; index < rows.length; index += 500) {
        await tx.insert(amazonRemovals).values(
          rows.slice(index, index + 500).map((row) => ({
            orgId,
            externalAccountId,
            marketplaceId,
            kind,
            ...row,
            importedAt
          }))
        )
      }
    },
    save: async (tx, report) => {
      await tx
        .insert(amazonRemovalReports)
        .values({ orgId, externalAccountId, marketplaceId, kind, ...report })
        .onConflictDoUpdate({
          target: [
            amazonRemovalReports.orgId,
            amazonRemovalReports.externalAccountId,
            amazonRemovalReports.marketplaceId,
            amazonRemovalReports.from,
            amazonRemovalReports.kind
          ],
          set: report
        })
    }
  })
}

export async function amazonRemovalsStatus(
  orgId: string,
  externalAccountId: string,
  kind: "orders" | "shipments",
  now = new Date()
) {
  const reports = await db()
    .select()
    .from(amazonRemovalReports)
    .where(
      and(
        eq(amazonRemovalReports.orgId, orgId),
        eq(amazonRemovalReports.kind, kind),
        eq(amazonRemovalReports.externalAccountId, externalAccountId),
        eq(amazonRemovalReports.marketplaceId, fbaReportMarketplace)
      )
    )
  return {
    dateBasis: kind === "orders" ? ("request" as const) : ("shipment" as const),
    ...monthlyReportStatus(reports, now)
  }
}
