import { describe, expect, it } from "vitest"
import { parseFbaReimbursements } from "../src/reimbursements"

const columns = [
  "approval-date",
  "reimbursement-id",
  "case-id",
  "amazon-order-id",
  "reason",
  "sku",
  "fnsku",
  "asin",
  "product-name",
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
const header = columns.join("\t")
function report(values: Record<string, string> = {}) {
  const row: Record<string, string> = {
    "approval-date": "2026-10-02T03:04:05+00:00",
    "reimbursement-id": "R1",
    "case-id": "C1",
    "amazon-order-id": "ORDER1",
    reason: "Lost_Warehouse",
    sku: "SKU1",
    fnsku: "F1",
    asin: "A1",
    "product-name": '"Product\twith a tab\nand ""quotes"""',
    condition: "New",
    "currency-unit": "USD",
    "amount-per-unit": "2.123456",
    "amount-total": "4.246912",
    "quantity-reimbursed-cash": "2",
    "quantity-reimbursed-inventory": "1",
    "quantity-reimbursed-total": "3",
    ...values
  }
  return `\uFEFF${header}\r\n${columns.map((column) => row[column] ?? "").join("\t")}\r\n`
}

describe("FBA reimbursements report", () => {
  it("preserves exact source amounts and separate cash/inventory quantities", () => {
    expect(parseFbaReimbursements(report())).toEqual([
      {
        approvedAt: new Date("2026-10-02T03:04:05Z"),
        reimbursementId: "R1",
        caseId: "C1",
        orderId: "ORDER1",
        reason: "Lost_Warehouse",
        sku: "SKU1",
        fnsku: "F1",
        asin: "A1",
        condition: "New",
        currency: "USD",
        amountPerUnit: "2.123456",
        amountTotal: "4.246912",
        quantityCash: 2,
        quantityInventory: 1,
        quantityTotal: 3,
        originalReimbursementId: null,
        originalReimbursementType: null
      }
    ])
  })
  it("retains reversals, original references, unknown codes and amounts beyond floating-point precision", () => {
    expect(
      parseFbaReimbursements(
        report({
          reason: "NEW_REASON",
          "amount-total": "-9007199254740993.123456",
          "quantity-reimbursed-cash": "-1",
          "original-reimbursement-id": "R0",
          "original-reimbursement-type": "NEW_TYPE"
        })
      )[0]
    ).toMatchObject({
      reason: "NEW_REASON",
      amountTotal: "-9007199254740993.123456",
      quantityCash: -1,
      originalReimbursementId: "R0",
      originalReimbursementType: "NEW_TYPE"
    })
  })
  it("keeps missing values distinct from reported zero and does not invent links", () => {
    expect(
      parseFbaReimbursements(
        report({
          "amount-total": "",
          "quantity-reimbursed-cash": "0",
          "quantity-reimbursed-total": "",
          "amazon-order-id": "",
          sku: "",
          "currency-unit": ""
        })
      )[0]
    ).toMatchObject({
      amountTotal: null,
      quantityCash: 0,
      quantityTotal: null,
      orderId: null,
      sku: null,
      currency: null
    })
    expect(parseFbaReimbursements(header)).toEqual([])
  })
  it.each<Record<string, string>>([
    { "amount-total": "NaN" },
    { "amount-per-unit": "1,234.56" },
    { "quantity-reimbursed-cash": "1.5" },
    { "quantity-reimbursed-inventory": "2147483648" },
    { "reimbursement-id": "" },
    { "approval-date": "2026-02-30T00:00:00Z" },
    { "approval-date": "2026-10-02T00:00:00" },
    { "currency-unit": "US" }
  ])("rejects invalid evidence rather than silently coercing it: %j", (values) => {
    expect(() => parseFbaReimbursements(report(values))).toThrow(/invalid|too_big|too_small/i)
  })
  it("rejects missing/duplicate headers and truncated rows", () => {
    expect(() => parseFbaReimbursements("")).toThrow("Missing or duplicate report columns")
    expect(() => parseFbaReimbursements(header.replace("case-id", "reimbursement-id"))).toThrow(
      "Missing or duplicate report columns"
    )
    expect(() => parseFbaReimbursements(`${header}\nshort`)).toThrow("Incomplete report row")
  })
})
