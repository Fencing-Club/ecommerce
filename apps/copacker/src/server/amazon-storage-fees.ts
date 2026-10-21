import {
  storageFeeReportTypes,
  parseMonthlyStorageFees,
  parseAgedStorageFees
} from "@repo/copacker-marketplaces/storage-fees"
import { and, eq, gte, lt } from "drizzle-orm"
import { db } from "@/db"
import { amazonStorageFeeReports, amazonStorageFees } from "@/db/schema"
import {
  type AmazonReportInput,
  fbaReportMarketplace,
  monthlyReportStatus,
  syncMonthlyAmazonReport
} from "./amazon-report-sync"

export async function syncAmazonStorageFees(
  input: AmazonReportInput,
  kind: "monthly" | "aged",
  assertOwned: () => Promise<void>,
  now = new Date()
) {
  const { orgId, externalAccountId } = input
  const marketplaceId = fbaReportMarketplace
  const reports = await db()
    .select()
    .from(amazonStorageFeeReports)
    .where(
      and(
        eq(amazonStorageFeeReports.orgId, orgId),
        eq(amazonStorageFeeReports.kind, kind),
        eq(amazonStorageFeeReports.externalAccountId, externalAccountId),
        eq(amazonStorageFeeReports.marketplaceId, marketplaceId)
      )
    )
  await syncMonthlyAmazonReport(input, assertOwned, now, {
    reportType: storageFeeReportTypes[kind],
    wholeMonths: true,
    unavailableRefreshMs: kind === "aged" ? { recent: 7 * 86400000, older: 30 * 86400000 } : undefined,
    reports,
    parse: kind === "monthly" ? parseMonthlyStorageFees : parseAgedStorageFees,
    timestamp: (row) => new Date(`${row.periodDay}T00:00:00Z`),
    replace: async (tx, window, rows, importedAt) => {
      await tx
        .delete(amazonStorageFees)
        .where(
          and(
            eq(amazonStorageFees.orgId, orgId),
            eq(amazonStorageFees.kind, kind),
            eq(amazonStorageFees.externalAccountId, externalAccountId),
            eq(amazonStorageFees.marketplaceId, marketplaceId),
            gte(amazonStorageFees.periodDay, window.from.toISOString().slice(0, 10)),
            lt(amazonStorageFees.periodDay, window.to.toISOString().slice(0, 10))
          )
        )
      for (let index = 0; index < rows.length; index += 500) {
        await tx.insert(amazonStorageFees).values(
          rows.slice(index, index + 500).map((row) => ({
            orgId,
            externalAccountId,
            marketplaceId,
            kind,
            basis: kind === "monthly" ? ("estimate" as const) : ("reported_charge" as const),
            ...row,
            importedAt
          }))
        )
      }
    },
    save: async (tx, report) => {
      await tx
        .insert(amazonStorageFeeReports)
        .values({ orgId, externalAccountId, marketplaceId, kind, ...report })
        .onConflictDoUpdate({
          target: [
            amazonStorageFeeReports.orgId,
            amazonStorageFeeReports.externalAccountId,
            amazonStorageFeeReports.marketplaceId,
            amazonStorageFeeReports.from,
            amazonStorageFeeReports.kind
          ],
          set: report
        })
    }
  })
}

export async function amazonStorageFeesStatus(
  orgId: string,
  externalAccountId: string,
  kind: "monthly" | "aged",
  now = new Date()
) {
  const reports = await db()
    .select()
    .from(amazonStorageFeeReports)
    .where(
      and(
        eq(amazonStorageFeeReports.orgId, orgId),
        eq(amazonStorageFeeReports.kind, kind),
        eq(amazonStorageFeeReports.externalAccountId, externalAccountId),
        eq(amazonStorageFeeReports.marketplaceId, fbaReportMarketplace)
      )
    )
  return {
    basis: kind === "monthly" ? ("estimate" as const) : ("reported_charge" as const),
    ...monthlyReportStatus(reports, now, true)
  }
}
