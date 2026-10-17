import { fbaShipmentsReportType, parseFbaShipments } from "@repo/aisle/fulfillment-shipments"
import { and, eq, gte, lt, inArray, sql } from "drizzle-orm"
import { db } from "@/db"
import { amazonShipmentReports, amazonFulfillmentShipments, amazonShipmentRequests, connections } from "@/db/schema"
import {
  type AmazonReportInput,
  fbaReportMarketplace,
  monthlyReportStatus,
  syncMonthlyAmazonReport
} from "./amazon-report-sync"

export async function syncAmazonFulfillmentShipments(
  input: AmazonReportInput,
  assertOwned: () => Promise<void>,
  now = new Date()
) {
  const { orgId, externalAccountId } = input
  const startedAt = Date.now()
  const marketplaceId = fbaReportMarketplace
  const reports = await db()
    .select()
    .from(amazonShipmentReports)
    .where(
      and(
        eq(amazonShipmentReports.orgId, orgId),
        eq(amazonShipmentReports.externalAccountId, externalAccountId),
        eq(amazonShipmentReports.marketplaceId, marketplaceId)
      )
    )
  await syncMonthlyAmazonReport(input, assertOwned, now, {
    reportType: fbaShipmentsReportType,
    retryCreate: false,
    minimumRefreshMs: 8 * 3600000,
    beforeRequest: () =>
      db().transaction(async (tx) => {
        const requestedAt = new Date(now.getTime() + Date.now() - startedAt)
        const [account] = await tx
          .select()
          .from(connections)
          .where(
            and(
              eq(connections.orgId, orgId),
              eq(connections.provider, "amazon"),
              eq(connections.externalId, externalAccountId)
            )
          )
          .for("update")
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
              gte(amazonShipmentRequests.requestedAt, new Date(requestedAt.getTime() - 8 * 3600000))
            )
          )
          .limit(10)
        if (recent.length >= 10) {
          return false
        }
        await tx.insert(amazonShipmentRequests).values({ orgId, externalAccountId, requestedAt })
        return true
      }),
    reports,
    parse: parseFbaShipments,
    timestamp: (row) => row.shippedAt,
    replace: async (tx, window, rows, importedAt) => {
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
      for (let index = 0; index < rows.length; index += 500) {
        const batch = rows.slice(index, index + 500)
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
          .values(
            rows
              .slice(index, index + 500)
              .map((row) => ({ orgId, externalAccountId, marketplaceId, ...row, importedAt }))
          )
          .onConflictDoUpdate({
            target: [
              amazonFulfillmentShipments.orgId,
              amazonFulfillmentShipments.externalAccountId,
              amazonFulfillmentShipments.shipmentId,
              amazonFulfillmentShipments.shipmentItemId
            ],
            set: {
              marketplaceId,
              orderId: sql`excluded."orderId"`,
              orderItemId: sql`excluded."orderItemId"`,
              shippedAt: sql`excluded."shippedAt"`,
              sku: sql`excluded.sku`,
              quantity: sql`excluded.quantity`,
              fulfillmentCenterId: sql`excluded."fulfillmentCenterId"`,
              fulfillmentChannel: sql`excluded."fulfillmentChannel"`,
              salesChannel: sql`excluded."salesChannel"`,
              importedAt
            }
          })
      }
    },
    save: async (tx, report) => {
      await tx
        .insert(amazonShipmentReports)
        .values({ orgId, externalAccountId, marketplaceId, ...report })
        .onConflictDoUpdate({
          target: [
            amazonShipmentReports.orgId,
            amazonShipmentReports.externalAccountId,
            amazonShipmentReports.marketplaceId,
            amazonShipmentReports.from
          ],
          set: report
        })
    }
  })
}

export async function amazonFulfillmentShipmentsStatus(
  orgId: string,
  externalAccountId: string,
  now = new Date(),
  reader: Pick<ReturnType<typeof db>, "select"> = db()
) {
  const reports = await reader
    .select()
    .from(amazonShipmentReports)
    .where(
      and(
        eq(amazonShipmentReports.orgId, orgId),
        eq(amazonShipmentReports.externalAccountId, externalAccountId),
        eq(amazonShipmentReports.marketplaceId, fbaReportMarketplace)
      )
    )
  return monthlyReportStatus(reports, now)
}
