import { z } from "zod"
import { reportDay, reportQuantity, reportRows } from "./report-tsv"

export const ledgerDetailReportType = "GET_LEDGER_DETAIL_VIEW_DATA"
const required = [
  "Date",
  "FNSKU",
  "ASIN",
  "MSKU",
  "Event Type",
  "Reference ID",
  "Quantity",
  "Fulfillment Center",
  "Disposition",
  "Reason",
  "Country",
  "Reconciled Quantity",
  "Unreconciled Quantity"
]
const item = z.object({
  eventDay: z.iso.date(),
  sku: z.string().nullable(),
  fnsku: z.string().nullable(),
  asin: z.string().nullable(),
  eventType: z.string().min(1),
  referenceId: z.string().nullable(),
  quantity: reportQuantity,
  fulfillmentCenterId: z.string().nullable(),
  disposition: z.string().nullable(),
  reason: z.string().nullable(),
  country: z.string().nullable(),
  reconciledQuantity: reportQuantity.nullable(),
  unreconciledQuantity: reportQuantity.nullable(),
  // Retain the source clock text; do not invent a timezone or midnight event timestamp from the calendar date.
  dateAndTime: z.string().nullable(),
  store: z.string().nullable()
})

// Includes all event types and dispositions. Preserve signed transfers/adjustments, unknown codes and unmatched
// product/reference values. A reference can span multiple rows; it is not a unique movement identifier.
export function parseLedgerDetail(text: string) {
  return reportRows(text, required).map((row) => {
    const optional = (name: string) => row[name] || null
    return item.parse({
      eventDay: reportDay(row.Date!),
      sku: optional("MSKU"),
      fnsku: optional("FNSKU"),
      asin: optional("ASIN"),
      eventType: row["Event Type"],
      referenceId: optional("Reference ID"),
      quantity: row.Quantity,
      fulfillmentCenterId: optional("Fulfillment Center"),
      disposition: optional("Disposition"),
      reason: optional("Reason"),
      country: optional("Country"),
      reconciledQuantity: optional("Reconciled Quantity"),
      unreconciledQuantity: optional("Unreconciled Quantity"),
      dateAndTime: optional("Date and Time"),
      store: optional("Store")
    })
  })
}
