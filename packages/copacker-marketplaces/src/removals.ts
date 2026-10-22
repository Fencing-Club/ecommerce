import { z } from "zod"
import { reportCurrency, reportDecimal, reportQuantity, reportRows, reportTimestamp } from "./report-tsv"

export const removalReportTypes = {
  orders: "GET_FBA_FULFILLMENT_REMOVAL_ORDER_DETAIL_DATA",
  shipments: "GET_FBA_FULFILLMENT_REMOVAL_SHIPMENT_DETAIL_DATA"
} as const
const quantity = reportQuantity.nullable()
const item = z.object({
  requestedAt: reportTimestamp,
  orderId: z.string().min(1),
  orderType: z.string().nullable(),
  orderSource: z.string().nullable(),
  serviceSpeed: z.string().nullable(),
  status: z.string().nullable(),
  updatedAt: reportTimestamp.nullable(),
  shippedAt: reportTimestamp.nullable(),
  sku: z.string().nullable(),
  fnsku: z.string().nullable(),
  disposition: z.string().nullable(),
  requestedQuantity: quantity,
  cancelledQuantity: quantity,
  disposedQuantity: quantity,
  shippedQuantity: quantity,
  inProcessQuantity: quantity,
  removalFee: reportDecimal.nullable(),
  currency: reportCurrency.nullable(),
  carrier: z.string().nullable(),
  trackingNumber: z.string().nullable()
})
const common = ["request-date", "order-id", "sku", "fnsku", "disposition", "shipped-quantity"]
const orderColumns = [
  ...common,
  "order-type",
  "order-status",
  "last-updated-date",
  "requested-quantity",
  "cancelled-quantity",
  "disposed-quantity",
  "in-process-quantity",
  "removal-fee",
  "currency"
]
const shipmentColumns = [...common, "shipment-date", "carrier", "tracking-number", "removal-order-type"]

// Order totals and shipment evidence overlap. Preserve each source independently; do not add their quantities or fees.
export function parseRemovalReport(text: string, kind: "orders" | "shipments") {
  return reportRows(text, kind === "orders" ? orderColumns : shipmentColumns).map((row) => {
    const optional = (name: string) => row[name] || null
    const order = (name: string) => (kind === "orders" ? optional(name) : null)
    const shipment = (name: string) => (kind === "shipments" ? optional(name) : null)
    return item.parse({
      requestedAt: row["request-date"],
      orderId: row["order-id"],
      orderType: optional(kind === "orders" ? "order-type" : "removal-order-type"),
      orderSource: order("order-source"),
      serviceSpeed: order("service-speed"),
      status: kind === "orders" ? order("order-status") : shipment("shipment-status"),
      updatedAt: order("last-updated-date"),
      shippedAt: kind === "shipments" ? reportTimestamp.parse(row["shipment-date"]).toISOString() : null,
      sku: optional("sku"),
      fnsku: optional("fnsku"),
      disposition: optional("disposition"),
      requestedQuantity: order("requested-quantity"),
      cancelledQuantity: order("cancelled-quantity"),
      disposedQuantity: order("disposed-quantity"),
      shippedQuantity: optional("shipped-quantity"),
      inProcessQuantity: order("in-process-quantity"),
      removalFee: order("removal-fee"),
      currency: order("currency"),
      carrier: shipment("carrier"),
      trackingNumber: shipment("tracking-number")
    })
  })
}
