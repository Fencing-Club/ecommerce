import { z } from "zod"
import { reportRows } from "./report-tsv"

export const storageFeeReportTypes = {
  monthly: "GET_FBA_STORAGE_FEE_CHARGES_DATA",
  aged: "GET_FBA_FULFILLMENT_LONGTERM_STORAGE_FEE_CHARGES_DATA"
} as const
const decimal = z
  .string()
  .max(100)
  .regex(/^-?\d+(\.\d+)?([eE][+-]?\d{1,2})?$/)
  .transform((value) => {
    // Amazon emits small fees as e.g. 8.0E-4. Expand digits without floating-point rounding.
    const [mantissa, exponent] = value.toLowerCase().split("e")
    if (exponent === undefined) {
      return value
    }
    const sign = mantissa!.startsWith("-") ? "-" : ""
    const [whole, fraction = ""] = mantissa!.replace(/^-/, "").split(".")
    const digits = whole! + fraction
    const point = whole!.length + Number(exponent)
    if (point <= 0) {
      return `${sign}0.${"0".repeat(-point)}${digits}`
    }
    if (point >= digits.length) {
      return sign + digits + "0".repeat(point - digits.length)
    }
    return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`
  })
  .nullable()
const fee = z.object({
  periodDay: z.iso.date(),
  sku: z.string().nullable(),
  asin: z.string().nullable(),
  fnsku: z.string().nullable(),
  fulfillmentCenterId: z.string().nullable(),
  country: z.string().nullable(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
  amount: decimal,
  quantity: decimal,
  volume: decimal,
  volumeUnit: z.string().nullable(),
  rate: decimal,
  ageTier: z.string().nullable(),
  // Preserve optional dimensions, utilization components, incentives and future source fields without summing them.
  data: z.record(z.string(), z.string())
})
const monthlyColumns = [
  "asin",
  "fnsku",
  "fulfillment_center",
  "country_code",
  "month_of_charge",
  "currency",
  "estimated_monthly_storage_fee",
  "average_quantity_on_hand"
]
const agedColumns = ["snapshot-date", "sku", "fnsku", "asin", "currency", "country", "qty-charged", "amount-charged"]
function evidence(row: Record<string, string>) {
  return Object.fromEntries(Object.entries(row).filter(([key]) => key !== "product-name" && key !== "product_name"))
}

// A monthly estimate has no seller SKU in the documented source. Preserve ASIN/FNSKU instead of guessing a mapping.
export function parseMonthlyStorageFees(text: string) {
  return reportRows(text, monthlyColumns).map((row) => {
    const optional = (key: string) => row[key] || null
    const month = z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .parse(row.month_of_charge)
    return fee.parse({
      periodDay: `${month}-01`,
      sku: null,
      asin: optional("asin"),
      fnsku: optional("fnsku"),
      fulfillmentCenterId: optional("fulfillment_center"),
      country: optional("country_code"),
      currency: optional("currency"),
      amount: optional("estimated_monthly_storage_fee"),
      quantity: optional("average_quantity_on_hand"),
      volume: optional("item_volume"),
      volumeUnit: optional("volume_units"),
      rate: optional("storage_rate"),
      ageTier: null,
      data: evidence(row)
    })
  })
}

export function parseAgedStorageFees(text: string) {
  return reportRows(text, agedColumns).map((row) => {
    const optional = (key: string) => row[key] || null
    const date = row["snapshot-date"]!
    const us = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date)
    const quantity = z
      .string()
      .regex(/^-?\d+$/)
      .nullable()
      .parse(optional("qty-charged"))
    return fee.parse({
      periodDay: us ? `${us[3]}-${us[1]}-${us[2]}` : date,
      sku: optional("sku"),
      asin: optional("asin"),
      fnsku: optional("fnsku"),
      fulfillmentCenterId: null,
      country: optional("country"),
      currency: optional("currency"),
      amount: optional("amount-charged"),
      quantity,
      volume: optional("per-unit-volume"),
      volumeUnit: optional("volume-unit"),
      rate: optional("rate-surcharge"),
      ageTier: optional("surcharge-age-tier"),
      data: evidence(row)
    })
  })
}
