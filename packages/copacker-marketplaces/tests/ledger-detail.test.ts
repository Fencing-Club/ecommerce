import { describe, expect, it } from "vitest"
import { parseLedgerDetail } from "../src/ledger-detail"

const columns = [
  "Date",
  "FNSKU",
  "ASIN",
  "MSKU",
  "Title",
  "Event Type",
  "Reference ID",
  "Quantity",
  "Fulfillment Center",
  "Disposition",
  "Reason",
  "Country",
  "Reconciled Quantity",
  "Unreconciled Quantity",
  "Date and Time",
  "Store"
]
const header = columns.join("\t")
function report(overrides: Record<string, string> = {}) {
  const row: Record<string, string> = {
    Date: "10/02/2026",
    FNSKU: "FN1",
    ASIN: "A1",
    MSKU: "SKU1",
    Title: '"A product\twith tabs\nand ""quotes"""',
    "Event Type": "Adjustments",
    "Reference ID": "REF1",
    Quantity: "-3",
    "Fulfillment Center": "FC1",
    Disposition: "WAREHOUSE_DAMAGED",
    Reason: "E",
    Country: "US",
    "Reconciled Quantity": "1",
    "Unreconciled Quantity": "2",
    "Date and Time": "10/02/2026 12:30:00",
    Store: "US",
    ...overrides
  }
  return `\uFEFF${header}\r\n${columns.map((column) => row[column]).join("\t")}\r\n`
}

describe("detailed FBA inventory ledger", () => {
  it("retains signed movements, source references, reconciliation quantities and raw source clock text", () => {
    expect(parseLedgerDetail(report())).toEqual([
      {
        eventDay: "2026-10-02",
        fnsku: "FN1",
        asin: "A1",
        sku: "SKU1",
        eventType: "Adjustments",
        referenceId: "REF1",
        quantity: -3,
        fulfillmentCenterId: "FC1",
        disposition: "WAREHOUSE_DAMAGED",
        reason: "E",
        country: "US",
        reconciledQuantity: 1,
        unreconciledQuantity: 2,
        dateAndTime: "10/02/2026 12:30:00",
        store: "US"
      }
    ])
  })
  it("retains zero, missing fields and unknown event codes without classifying losses or guessing links", () => {
    expect(
      parseLedgerDetail(
        report({
          Date: "2026-10-02",
          Quantity: "0",
          "Event Type": "NEW_EVENT",
          MSKU: "",
          "Reference ID": "",
          "Reconciled Quantity": "",
          "Unreconciled Quantity": "0",
          "Date and Time": ""
        })
      )[0]
    ).toMatchObject({
      eventDay: "2026-10-02",
      quantity: 0,
      eventType: "NEW_EVENT",
      sku: null,
      referenceId: null,
      reconciledQuantity: null,
      unreconciledQuantity: 0,
      dateAndTime: null
    })
    expect(parseLedgerDetail(header)).toEqual([])
  })
  it("accepts reports without the optional clock/store columns without inferring their values", () => {
    const text =
      "Date\tFNSKU\tASIN\tMSKU\tEvent Type\tReference ID\tQuantity\tFulfillment Center\tDisposition\tReason\tCountry\tReconciled Quantity\tUnreconciled Quantity\n2026-10-02\tFN1\tA1\tSKU1\tReceipts\tREF1\t5\tFC1\tSELLABLE\t\tUS\t\t"
    expect(parseLedgerDetail(text)[0]).toMatchObject({ quantity: 5, dateAndTime: null, store: null })
  })
  it.each<Record<string, string>>([
    { Date: "02/30/2026" },
    { Date: "2026-13-01" },
    { Date: "2026-10-02T00:00:00Z" },
    { Date: "2 Oct 2026" },
    { Quantity: "" },
    { Quantity: "1.5" },
    { Quantity: "2147483648" },
    { Quantity: "NaN" },
    { "Event Type": "" },
    { "Reconciled Quantity": "invalid" },
    { "Unreconciled Quantity": "-2147483649" }
  ])("rejects invalid date/quantity evidence: %j", (values) => {
    expect(() => parseLedgerDetail(report(values))).toThrow(/invalid|too_big|too_small/i)
  })
  it("rejects missing/duplicate headers and truncated records", () => {
    expect(() => parseLedgerDetail("")).toThrow("Missing or duplicate report columns")
    expect(() => parseLedgerDetail(header.replace("Reason", "Quantity"))).toThrow("Missing or duplicate report columns")
    expect(() => parseLedgerDetail(`${header}\n2026-10-02\tshort`)).toThrow("Incomplete report row")
  })
})
