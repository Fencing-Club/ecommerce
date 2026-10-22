import { z } from "zod"
import { reportCount, reportRows, reportTimestamp } from "./report-tsv"

export const fbaReturnsReportType = "GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA"

const required = [
  "return-date",
  "order-id",
  "sku",
  "asin",
  "fnsku",
  "quantity",
  "fulfillment-center-id",
  "detailed-disposition",
  "reason",
  "status",
  "license-plate-number"
]
const item = z.object({
  returnedAt: reportTimestamp,
  orderId: z.string().min(1),
  sku: z.string().min(1),
  asin: z.string().nullable(),
  fnsku: z.string().nullable(),
  quantity: reportCount,
  fulfillmentCenterId: z.string().nullable(),
  disposition: z.string().nullable(),
  reason: z.string().nullable(),
  status: z.string().nullable(),
  licensePlateNumber: z.string().nullable()
})

// Preserve unknown reason/status codes. No free-text customer comments or inferred refund amounts are stored.
// Identical source rows remain separate: Amazon does not provide a reliable unique return identifier.
export function parseFbaReturns(text: string) {
  return reportRows(text, required).map((row) => {
    const value = (name: string) => row[name]!
    const optional = (name: string) => value(name) || null
    return item.parse({
      returnedAt: value("return-date"),
      orderId: value("order-id"),
      sku: value("sku"),
      asin: optional("asin"),
      fnsku: optional("fnsku"),
      quantity: value("quantity"),
      fulfillmentCenterId: optional("fulfillment-center-id"),
      disposition: optional("detailed-disposition"),
      reason: optional("reason"),
      status: optional("status"),
      licensePlateNumber: optional("license-plate-number")
    })
  })
}
