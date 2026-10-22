import { usMarketplaceId } from "@repo/copacker-marketplaces/amazon-marketplaces"
import { fbaReturnsReportType, parseFbaReturns } from "@repo/copacker-marketplaces/returns"
import { and, eq, gte, lt } from "drizzle-orm"
import { db } from "@/db"
import { amazonReturnReports, amazonReturns } from "@/db/schema"
import { type AmazonReportInput, monthlyReportStatus, syncMonthlyAmazonReport } from "./amazon-report-sync"

export async function syncAmazonReturns(input: AmazonReportInput, assertOwned: () => Promise<void>, now = new Date()) {
  const { orgId, externalAccountId } = input
  const marketplaceId = usMarketplaceId
  const reports = await db()
    .select()
    .from(amazonReturnReports)
    .where(
      and(
        eq(amazonReturnReports.orgId, orgId),
        eq(amazonReturnReports.externalAccountId, externalAccountId),
        eq(amazonReturnReports.marketplaceId, marketplaceId)
      )
    )
  await syncMonthlyAmazonReport(input, assertOwned, now, {
    reportType: fbaReturnsReportType,
    reports,
    parse: parseFbaReturns,
    timestamp: (row) => row.returnedAt,
    replace: async (tx, window, rows, importedAt) => {
      await tx
        .delete(amazonReturns)
        .where(
          and(
            eq(amazonReturns.orgId, orgId),
            eq(amazonReturns.externalAccountId, externalAccountId),
            eq(amazonReturns.marketplaceId, marketplaceId),
            gte(amazonReturns.returnedAt, window.from),
            lt(amazonReturns.returnedAt, window.to)
          )
        )
      for (let index = 0; index < rows.length; index += 500) {
        await tx
          .insert(amazonReturns)
          .values(
            rows
              .slice(index, index + 500)
              .map((row) => ({ orgId, externalAccountId, marketplaceId, ...row, importedAt }))
          )
      }
    },
    save: async (tx, report) => {
      await tx
        .insert(amazonReturnReports)
        .values({ orgId, externalAccountId, marketplaceId, ...report })
        .onConflictDoUpdate({
          target: [
            amazonReturnReports.orgId,
            amazonReturnReports.externalAccountId,
            amazonReturnReports.marketplaceId,
            amazonReturnReports.from
          ],
          set: report
        })
    }
  })
}

export async function amazonReturnsStatus(orgId: string, externalAccountId: string, now = new Date()) {
  const reports = await db()
    .select()
    .from(amazonReturnReports)
    .where(
      and(
        eq(amazonReturnReports.orgId, orgId),
        eq(amazonReturnReports.externalAccountId, externalAccountId),
        eq(amazonReturnReports.marketplaceId, usMarketplaceId)
      )
    )
  return monthlyReportStatus(reports, now)
}
