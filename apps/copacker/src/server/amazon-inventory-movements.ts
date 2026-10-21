import { ledgerDetailReportType, parseLedgerDetail } from "@repo/copacker-marketplaces/ledger-detail"
import { and, eq, gte, lt } from "drizzle-orm"
import { db } from "@/db"
import { amazonMovementReports, amazonInventoryMovements } from "@/db/schema"
import {
  type AmazonReportInput,
  fbaReportMarketplace,
  monthlyReportStatus,
  syncMonthlyAmazonReport
} from "./amazon-report-sync"

export async function syncAmazonInventoryMovements(
  input: AmazonReportInput,
  assertOwned: () => Promise<void>,
  now = new Date()
) {
  const { orgId, externalAccountId } = input
  const marketplaceId = fbaReportMarketplace
  const reports = await db()
    .select()
    .from(amazonMovementReports)
    .where(
      and(
        eq(amazonMovementReports.orgId, orgId),
        eq(amazonMovementReports.externalAccountId, externalAccountId),
        eq(amazonMovementReports.marketplaceId, marketplaceId)
      )
    )
  await syncMonthlyAmazonReport(input, assertOwned, now, {
    reportType: ledgerDetailReportType,
    reports,
    parse: parseLedgerDetail,
    // This UTC value is only a window-comparison key, not an asserted event timestamp.
    timestamp: (row) => new Date(`${row.eventDay}T00:00:00Z`),
    replace: async (tx, window, rows, importedAt) => {
      await tx
        .delete(amazonInventoryMovements)
        .where(
          and(
            eq(amazonInventoryMovements.orgId, orgId),
            eq(amazonInventoryMovements.externalAccountId, externalAccountId),
            eq(amazonInventoryMovements.marketplaceId, marketplaceId),
            gte(amazonInventoryMovements.eventDay, window.from.toISOString().slice(0, 10)),
            lt(amazonInventoryMovements.eventDay, window.to.toISOString().slice(0, 10))
          )
        )
      for (let index = 0; index < rows.length; index += 500) {
        await tx
          .insert(amazonInventoryMovements)
          .values(
            rows
              .slice(index, index + 500)
              .map((row) => ({ orgId, externalAccountId, marketplaceId, ...row, importedAt }))
          )
      }
    },
    save: async (tx, report) => {
      await tx
        .insert(amazonMovementReports)
        .values({ orgId, externalAccountId, marketplaceId, ...report })
        .onConflictDoUpdate({
          target: [
            amazonMovementReports.orgId,
            amazonMovementReports.externalAccountId,
            amazonMovementReports.marketplaceId,
            amazonMovementReports.from
          ],
          set: report
        })
    }
  })
}

export async function amazonInventoryMovementsStatus(orgId: string, externalAccountId: string, now = new Date()) {
  const reports = await db()
    .select()
    .from(amazonMovementReports)
    .where(
      and(
        eq(amazonMovementReports.orgId, orgId),
        eq(amazonMovementReports.externalAccountId, externalAccountId),
        eq(amazonMovementReports.marketplaceId, fbaReportMarketplace)
      )
    )
  return monthlyReportStatus(reports, now)
}
