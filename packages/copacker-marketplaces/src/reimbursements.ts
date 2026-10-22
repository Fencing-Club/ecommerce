import { z } from "zod"
import { reportRows } from "./report-tsv"

export const fbaReimbursementsReportType = "GET_FBA_REIMBURSEMENTS_DATA"

const required = [
  "approval-date",
  "reimbursement-id",
  "case-id",
  "amazon-order-id",
  "reason",
  "sku",
  "fnsku",
  "asin",
  "condition",
  "currency-unit",
  "amount-per-unit",
  "amount-total",
  "quantity-reimbursed-cash",
  "quantity-reimbursed-inventory",
  "quantity-reimbursed-total",
  "original-reimbursement-id",
  "original-reimbursement-type"
]
// Keep source decimals exact. Conversion to money's minor units belongs in financial reconciliation, not ingestion.
const amount = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/)
  .nullable()
const quantity = z
  .string()
  .regex(/^-?\d+$/)
  .transform(Number)
  .pipe(z.number().int().min(-2147483648).max(2147483647))
  .nullable()
const item = z.object({
  approvedAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
  reimbursementId: z.string().min(1),
  caseId: z.string().nullable(),
  orderId: z.string().nullable(),
  reason: z.string().nullable(),
  sku: z.string().nullable(),
  fnsku: z.string().nullable(),
  asin: z.string().nullable(),
  condition: z.string().nullable(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
  amountPerUnit: amount,
  amountTotal: amount,
  quantityCash: quantity,
  quantityInventory: quantity,
  quantityTotal: quantity,
  originalReimbursementId: z.string().nullable(),
  originalReimbursementType: z.string().nullable()
})

// Signed values and unknown reason/type codes are evidence, not an inferred cash payment or eligibility decision.
// One reimbursement can contain multiple rows for a SKU: preserve all rows, including missing product/order links.
export function parseFbaReimbursements(text: string) {
  return reportRows(text, required).map((row) => {
    const optional = (name: string) => row[name] || null
    return item.parse({
      approvedAt: row["approval-date"],
      reimbursementId: row["reimbursement-id"],
      caseId: optional("case-id"),
      orderId: optional("amazon-order-id"),
      reason: optional("reason"),
      sku: optional("sku"),
      fnsku: optional("fnsku"),
      asin: optional("asin"),
      condition: optional("condition"),
      currency: optional("currency-unit"),
      amountPerUnit: optional("amount-per-unit"),
      amountTotal: optional("amount-total"),
      quantityCash: optional("quantity-reimbursed-cash"),
      quantityInventory: optional("quantity-reimbursed-inventory"),
      quantityTotal: optional("quantity-reimbursed-total"),
      originalReimbursementId: optional("original-reimbursement-id"),
      originalReimbursementType: optional("original-reimbursement-type")
    })
  })
}
