import { z } from "zod"
import { reportRows } from "./report-tsv"
export const fbaShipmentsReportType = "GET_AMAZON_FULFILLED_SHIPMENTS_DATA_GENERAL"
const required = [
  "amazon-order-id",
  "shipment-id",
  "shipment-item-id",
  "amazon-order-item-id",
  "shipment-date",
  "sku",
  "quantity-shipped",
  "fulfillment-center-id",
  "fulfillment-channel",
  "sales-channel"
]
const item = z.object({
  orderId: z.string().min(1),
  shipmentId: z.string().min(1),
  shipmentItemId: z.string().min(1),
  orderItemId: z.string().nullable(),
  shippedAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
  sku: z.string().min(1),
  quantity: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().max(2147483647)),
  fulfillmentCenterId: z.string().nullable(),
  fulfillmentChannel: z.string().nullable(),
  salesChannel: z.string().nullable()
})
// Allowlist accounting fields; never retain buyer details, addresses, tracking or the raw source document.
export function parseFbaShipments(text: string) {
  const seen = new Set<string>()
  return reportRows(text, required).map((row) => {
    const result = item.parse({
      orderId: row["amazon-order-id"],
      shipmentId: row["shipment-id"],
      shipmentItemId: row["shipment-item-id"],
      orderItemId: row["amazon-order-item-id"] || null,
      shippedAt: row["shipment-date"],
      sku: row.sku,
      quantity: row["quantity-shipped"],
      fulfillmentCenterId: row["fulfillment-center-id"] || null,
      fulfillmentChannel: row["fulfillment-channel"] || null,
      salesChannel: row["sales-channel"] || null
    })
    const key = JSON.stringify([result.shipmentId, result.shipmentItemId])
    if (seen.has(key)) {
      throw new Error("Duplicate shipment item identity")
    }
    seen.add(key)
    return result
  })
}
