import { fbaReimbursementsReportType, parseFbaReimbursements } from "@repo/aisle/reimbursements"
import { and, eq, gte, lt } from "drizzle-orm"
import { db } from "@/db"
import { amazonReimbursementReports, amazonReimbursements } from "@/db/schema"
import {
  type AmazonReportInput,
  fbaReportMarketplace,
  monthlyReportStatus,
  syncMonthlyAmazonReport
} from "./amazon-report-sync"

export async function syncAmazonReimbursements(
  input: AmazonReportInput,
  assertOwned: () => Promise<void>,
  now = new Date()
) {
  const { orgId, externalAccountId } = input
  const marketplaceId = fbaReportMarketplace
  const reports = await db()
    .select()
    .from(amazonReimbursementReports)
    .where(
      and(
        eq(amazonReimbursementReports.orgId, orgId),
        eq(amazonReimbursementReports.externalAccountId, externalAccountId),
        eq(amazonReimbursementReports.marketplaceId, marketplaceId)
      )
    )
  await syncMonthlyAmazonReport(input, assertOwned, now, {
    reportType: fbaReimbursementsReportType,
    reports,
    parse: parseFbaReimbursements,
    timestamp: (row) => row.approvedAt,
    replace: async (tx, window, rows, importedAt) => {
      await tx
        .delete(amazonReimbursements)
        .where(
          and(
            eq(amazonReimbursements.orgId, orgId),
            eq(amazonReimbursements.externalAccountId, externalAccountId),
            eq(amazonReimbursements.marketplaceId, marketplaceId),
            gte(amazonReimbursements.approvedAt, window.from),
            lt(amazonReimbursements.approvedAt, window.to)
          )
        )
      for (let index = 0; index < rows.length; index += 500) {
        await tx
          .insert(amazonReimbursements)
          .values(
            rows
              .slice(index, index + 500)
              .map((row) => ({ orgId, externalAccountId, marketplaceId, ...row, importedAt }))
          )
      }
    },
    save: async (tx, report) => {
      await tx
        .insert(amazonReimbursementReports)
        .values({ orgId, externalAccountId, marketplaceId, ...report })
        .onConflictDoUpdate({
          target: [
            amazonReimbursementReports.orgId,
            amazonReimbursementReports.externalAccountId,
            amazonReimbursementReports.marketplaceId,
            amazonReimbursementReports.from
          ],
          set: report
        })
    }
  })
}

export async function amazonReimbursementsStatus(orgId: string, externalAccountId: string, now = new Date()) {
  const reports = await db()
    .select()
    .from(amazonReimbursementReports)
    .where(
      and(
        eq(amazonReimbursementReports.orgId, orgId),
        eq(amazonReimbursementReports.externalAccountId, externalAccountId),
        eq(amazonReimbursementReports.marketplaceId, fbaReportMarketplace)
      )
    )
  return monthlyReportStatus(reports, now)
}
