import { z } from "zod"
import { reportDecimal, reportRows } from "./report-tsv"
export const fbmReturnsReportType = "GET_FLAT_FILE_RETURNS_DATA_BY_RETURN_DATE"
const required = [
  "Order ID",
  "Return request date",
  "Amazon RMA ID",
  "Merchant SKU",
  "Return quantity",
  "Return Reason",
  "Return request status"
]
const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
function returnDate(value: string) {
  // Named months are unambiguous. Never guess the locale of numeric day/month dates or a missing timezone.
  const named =
    /^(\d{1,2})[- ](Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[- ](\d{4})$/i.exec(
      value
    )
  if (named) {
    const month = String(months.indexOf(named[2]!.slice(0, 3).toLowerCase()) + 1).padStart(2, "0")
    return { occurredAt: `${named[3]}-${month}-${named[1]!.padStart(2, "0")}T00:00:00Z`, datePrecision: "day" }
  }
  if (/^\d{4}(-\d{2}-\d{2}|\/\d{2}\/\d{2})$/.test(value)) {
    return { occurredAt: `${value.replaceAll("/", "-")}T00:00:00Z`, datePrecision: "day" }
  }
  const timestamp = value.replace(/^(\d{4}-\d{2}-\d{2}) /, "$1T").replace(/([+-]\d{2})(\d{2})$/, "$1:$2")
  return { occurredAt: timestamp, datePrecision: "timestamp" }
}
const unavailableAmounts = new Set(["n/a", "not applicable", "not available", "--", "-"])
export class FbmReturnsError extends Error {
  constructor(
    public readonly validation: z.ZodError,
    public readonly dateFormat: string
  ) {
    super("Invalid seller-fulfilled return fields")
  }
}
// Keep amounts as provider decimal strings and exclude names, tracking IDs and customer text.
export function parseFbmReturns(text: string) {
  return reportRows(text, required).map((row) => {
    const date = row["Return request date"]!
    const amount = (key: string) => {
      const value = row[key]?.trim()
      return !value || unavailableAmounts.has(value.toLowerCase()) ? null : value
    }
    const result = z
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
        labelCost: reportDecimal.nullable(),
        refundedAmount: reportDecimal.nullable(),
        recoveryAmount: reportDecimal.nullable()
      })
      .safeParse({
        ...returnDate(date),
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
    if (!result.success) {
      // Format-only diagnostics: replace every letter/digit and retain only known date punctuation.
      const dateFormat =
        date.length <= 64
          ? date
              .replace(/[0-9]/g, "0")
              .replace(/[a-z]/gi, "a")
              .replace(/[^0a :/+.,-]/g, "?")
          : "other"
      throw new FbmReturnsError(result.error, dateFormat)
    }
    return result.data
  })
}
