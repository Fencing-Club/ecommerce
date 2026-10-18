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
    const occurredAt = /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00Z` : date
    const amount = (key: string) => row[key] || null
    return z
      .object({
        occurredAt: z.iso.datetime({ offset: true }),
        datePrecision: z.enum(["timestamp", "day"]),
        rmaId: z.string().optional(),
        reason: z.string().optional(),
        status: z.string().optional(),
        resolution: z.string().nullable(),
        orderItemId: z.string().nullable(),
        currency: z.string().nullable(),
        claimId: z.string().nullable(),
        claimState: z.string().nullable(),
        orderId: z.string().min(1),
        sku: z.string().min(1),
        quantity: z.coerce.number().int().positive().safe(),
        labelCost: z
          .string()
          .regex(/^-?\d+(\.\d+)?$/)
          .nullable(),
        refundedAmount: z
          .string()
          .regex(/^-?\d+(\.\d+)?$/)
          .nullable(),
        recoveryAmount: z
          .string()
          .regex(/^-?\d+(\.\d+)?$/)
          .nullable()
      })
      .parse({
        occurredAt,
        datePrecision: date.includes("T") ? "timestamp" : "day",
        orderId: row["Order ID"],
        rmaId: row["Amazon RMA ID"],
        sku: row["Merchant SKU"],
        quantity: row["Return quantity"],
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
      })
  })
}
