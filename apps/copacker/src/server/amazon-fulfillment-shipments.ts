import { fbaShipmentsReportType, parseFbaShipments } from "@repo/copacker-marketplaces/fulfillment-shipments"
import { and, eq, gte, lt, inArray } from "drizzle-orm"
import { db } from "@/db"
import { chunked, excluded } from "@/db/helpers"
import { amazonShipmentReports, amazonFulfillmentShipments, amazonShipmentRequests } from "@/db/schema"
import { defineMonthlyReport } from "./amazon-report-sync"
import { connectedAccount } from "./provider-accounts"

const hour = 3600000

// Amazon allows 12 fulfilled-shipment report requests per seller in 8 hours, counting Seller Central's. Copacker
// reserves 10 of them, recorded before each request.
export const amazonFulfillmentShipmentsReport = defineMonthlyReport({
  reportType: fbaShipmentsReportType,
  reports: amazonShipmentReports,
  rows: amazonFulfillmentShipments,
  parse: parseFbaShipments,
  timestamp: "shippedAt",
  retryCreate: false,
  minimumRefreshMs: 8 * hour,
  beforeRequest: ({ orgId, externalAccountId }, requestedAt) =>
    db().transaction(async (tx) => {
      const account = await connectedAccount(orgId, "amazon", {
        executor: tx,
        externalId: externalAccountId,
        lock: "update"
      })
      if (!account) {
        return false
      }
      const recent = await tx
        .select({ id: amazonShipmentRequests.id })
        .from(amazonShipmentRequests)
        .where(
          and(
            eq(amazonShipmentRequests.orgId, orgId),
            eq(amazonShipmentRequests.externalAccountId, externalAccountId),
            gte(amazonShipmentRequests.requestedAt, new Date(requestedAt.getTime() - 8 * hour))
          )
        )
        .limit(10)
      if (recent.length >= 10) {
        return false
      }
      await tx.insert(amazonShipmentRequests).values({ orgId, externalAccountId, requestedAt })
      return true
    }),
  // Shipment items are keyed by Amazon's IDs, not by month. One that moved to another month marks that month's import
  // failed, since its stored rows no longer match the report.
  replace: async (tx, { orgId, externalAccountId, marketplaceId }, window, rows, importedAt) => {
    await tx
      .delete(amazonFulfillmentShipments)
      .where(
        and(
          eq(amazonFulfillmentShipments.orgId, orgId),
          eq(amazonFulfillmentShipments.externalAccountId, externalAccountId),
          eq(amazonFulfillmentShipments.marketplaceId, marketplaceId),
          gte(amazonFulfillmentShipments.shippedAt, window.from),
          lt(amazonFulfillmentShipments.shippedAt, window.to)
        )
      )
    for (const batch of chunked(rows, 500)) {
      const existing = await tx
        .select()
        .from(amazonFulfillmentShipments)
        .where(
          and(
            eq(amazonFulfillmentShipments.orgId, orgId),
            eq(amazonFulfillmentShipments.externalAccountId, externalAccountId),
            inArray(
              amazonFulfillmentShipments.shipmentId,
              batch.map((row) => row.shipmentId)
            )
          )
        )
      const identities = new Set(batch.map((row) => JSON.stringify([row.shipmentId, row.shipmentItemId])))
      for (const prior of existing) {
        if (
          !identities.has(JSON.stringify([prior.shipmentId, prior.shipmentItemId])) ||
          (prior.shippedAt >= window.from && prior.shippedAt < window.to)
        ) {
          continue
        }
        const from = new Date(Date.UTC(prior.shippedAt.getUTCFullYear(), prior.shippedAt.getUTCMonth(), 1))
        await tx
          .update(amazonShipmentReports)
          .set({ status: "failed", errorCode: "shipment_date_changed" })
          .where(
            and(
              eq(amazonShipmentReports.orgId, orgId),
              eq(amazonShipmentReports.externalAccountId, externalAccountId),
              eq(amazonShipmentReports.marketplaceId, marketplaceId),
              eq(amazonShipmentReports.from, from)
            )
          )
      }
      await tx
        .insert(amazonFulfillmentShipments)
        .values(batch.map((row) => ({ orgId, externalAccountId, marketplaceId, ...row, importedAt })))
        .onConflictDoUpdate({
          target: [
            amazonFulfillmentShipments.orgId,
            amazonFulfillmentShipments.externalAccountId,
            amazonFulfillmentShipments.shipmentId,
            amazonFulfillmentShipments.shipmentItemId
          ],
          set: {
            marketplaceId,
            ...excluded(
              amazonFulfillmentShipments,
              "orderId",
              "orderItemId",
              "shippedAt",
              "sku",
              "quantity",
              "fulfillmentCenterId",
              "fulfillmentChannel",
              "salesChannel"
            ),
            importedAt
          }
        })
    }
  }
})
