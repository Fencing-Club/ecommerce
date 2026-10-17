import { z } from "zod"
import { reportRows } from "./report-tsv"
const required = [
  "Order ID",
  "Return request date",
  "Amazon RMA ID",
  "Merchant SKU",
  "Return quantity",
  "Return Reason",
  "Return request status"
]
// Keep amounts as provider decimal strings and exclude names, tracking IDs and customer text.
export function parseFbmReturns(text: string) {
  return reportRows(text, required).map((row) => {
    const date = row["Return request date"]!
    const occurredAt = z.iso
      .datetime({ offset: true })
      .parse(/^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00Z` : date)
    const amount = (key: string) =>
      row[key]
        ? z
            .string()
            .regex(/^-?\d+(\.\d+)?$/)
            .parse(row[key])
        : null
    return {
      occurredAt,
      datePrecision: date.includes("T") ? "timestamp" : "day",
      orderId: z.string().min(1).parse(row["Order ID"]),
      rmaId: row["Amazon RMA ID"],
      sku: z.string().min(1).parse(row["Merchant SKU"]),
      quantity: z.coerce.number().int().positive().safe().parse(row["Return quantity"]),
      reason: row["Return Reason"],
      status: row["Return request status"],
      resolution: row.Resolution ?? null,
      orderItemId: row["Order Item ID"] ?? null,
      currency: row["Currency code"] || null,
      labelCost: amount("Label cost"),
      refundedAmount: amount("Refunded Amount"),
      claimId: row["SafeT claim id"] || null,
      claimState: row["SafeT claim state"] || null,
      recoveryAmount: amount("SafeT claim reimbursement amount")
    }
  })
}
