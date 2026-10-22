import { ledgerDetailReportType, parseLedgerDetail } from "@repo/copacker-marketplaces/ledger-detail"
import { fbaReimbursementsReportType, parseFbaReimbursements } from "@repo/copacker-marketplaces/reimbursements"
import { removalReportTypes, parseRemovalReport } from "@repo/copacker-marketplaces/removals"
import { fbaReturnsReportType, parseFbaReturns } from "@repo/copacker-marketplaces/returns"
import {
  storageFeeReportTypes,
  parseMonthlyStorageFees,
  parseAgedStorageFees
} from "@repo/copacker-marketplaces/storage-fees"
import {
  amazonInventoryMovements,
  amazonMovementReports,
  amazonReimbursementReports,
  amazonReimbursements,
  amazonRemovalReports,
  amazonRemovals,
  amazonReturnReports,
  amazonReturns,
  amazonStorageFeeReports,
  amazonStorageFees
} from "@/db/schema"
import { amazonFulfillmentShipmentsReport } from "./amazon-fulfillment-shipments"
import { defineMonthlyReport } from "./amazon-report-sync"

const hour = 3600000
const day = 24 * hour

// Monthly storage estimates and aged-inventory charges.
const storageFees = (kind: "monthly" | "aged") => {
  const basis = kind === "monthly" ? "estimate" : "reported_charge"
  return defineMonthlyReport({
    reportType: storageFeeReportTypes[kind],
    reports: amazonStorageFeeReports,
    rows: amazonStorageFees,
    kind,
    values: { basis },
    status: { basis },
    parse: kind === "monthly" ? parseMonthlyStorageFees : parseAgedStorageFees,
    timestamp: "periodDay",
    wholeMonths: true,
    unavailableRefreshMs: kind === "aged" ? { recent: 7 * day, older: 30 * day } : undefined
  })
}

// Removal orders by request date, and their shipments by shipment date.
const removals = (kind: "orders" | "shipments") =>
  defineMonthlyReport({
    reportType: removalReportTypes[kind],
    reports: amazonRemovalReports,
    rows: amazonRemovals,
    kind,
    status: { dateBasis: kind === "orders" ? "request" : "shipment" },
    parse: (text) => parseRemovalReport(text, kind),
    timestamp: kind === "orders" ? "requestedAt" : "shippedAt",
    combineMonths: true
  })

// Every monthly Amazon report, in the order a sales sync copies them after its orders.
export const amazonMonthlyReports = {
  fulfillmentShipments: amazonFulfillmentShipmentsReport,
  returns: defineMonthlyReport({
    reportType: fbaReturnsReportType,
    reports: amazonReturnReports,
    rows: amazonReturns,
    parse: parseFbaReturns,
    timestamp: "returnedAt"
  }),
  reimbursements: defineMonthlyReport({
    reportType: fbaReimbursementsReportType,
    reports: amazonReimbursementReports,
    rows: amazonReimbursements,
    parse: parseFbaReimbursements,
    timestamp: "approvedAt",
    // Amazon regenerates daily FBA report content no more than once every four hours.
    refreshReuseMs: 4 * hour
  }),
  inventoryMovements: defineMonthlyReport({
    reportType: ledgerDetailReportType,
    reports: amazonMovementReports,
    rows: amazonInventoryMovements,
    parse: parseLedgerDetail,
    timestamp: "eventDay"
  }),
  monthlyStorageFees: storageFees("monthly"),
  agedStorageFees: storageFees("aged"),
  removalOrders: removals("orders"),
  removalShipments: removals("shipments")
}

// Each report's months as the sales status shows them, read at once. Fulfillment shipments have their own analytics
// endpoint instead.
export async function amazonReportCoverage(orgId: string, externalAccountId: string, now: Date) {
  const reports = amazonMonthlyReports
  const [returns, reimbursements, inventoryMovements, monthly, aged, orders, shipments] = await Promise.all([
    reports.returns.status(orgId, externalAccountId, now),
    reports.reimbursements.status(orgId, externalAccountId, now),
    reports.inventoryMovements.status(orgId, externalAccountId, now),
    reports.monthlyStorageFees.status(orgId, externalAccountId, now),
    reports.agedStorageFees.status(orgId, externalAccountId, now),
    reports.removalOrders.status(orgId, externalAccountId, now),
    reports.removalShipments.status(orgId, externalAccountId, now)
  ])
  return {
    returns,
    reimbursements,
    inventoryMovements,
    storageFees: { monthly, aged },
    removals: { orders, shipments }
  }
}
