import { describe, expect, it } from "vitest"
import { parseFbaReturns } from "../src/returns"

const header =
  "return-date\torder-id\tsku\tasin\tfnsku\tquantity\tfulfillment-center-id\tdetailed-disposition\treason\tstatus\tlicense-plate-number\tcustomer-comments"
const row =
  '2026-10-01T10:30:00+00:00\tORDER1\tSKU1\tASIN1\tFN1\t2\tFC1\tSELLABLE\tUNWANTED_ITEM\tUnit returned to inventory\t\t"Comment\twith a tab\nand ""quotes"""'

describe("FBA returns report", () => {
  it("reads quoted fields, BOM and CRLF without retaining customer comments", () => {
    const rows = parseFbaReturns(`\uFEFF${header}\r\n${row}\r\n`)
    expect(rows).toEqual([
      {
        returnedAt: new Date("2026-10-01T10:30:00Z"),
        orderId: "ORDER1",
        sku: "SKU1",
        asin: "ASIN1",
        fnsku: "FN1",
        quantity: 2,
        fulfillmentCenterId: "FC1",
        disposition: "SELLABLE",
        reason: "UNWANTED_ITEM",
        status: "Unit returned to inventory",
        licensePlateNumber: null
      }
    ])
  })
  it("preserves identical rows because distinct physical returns can share all identifiers", () => {
    expect(parseFbaReturns(`${header}\n${row}\n${row}`)).toHaveLength(2)
    expect(parseFbaReturns(header)).toEqual([])
  })
  it.each([
    "",
    "error",
    header.replace("order-id", "sku"),
    `${header}\nshort`,
    `${header}\n${row.slice(0, -1)}`,
    `${header}\n${row.replace("\t2\t", "\t-1\t")}`,
    `${header}\n${row.replace("+00:00", "")}`,
    `${header}\n${row.replace('quotes"""', 'quotes"""bad')}`
  ])("rejects incomplete or invalid reports", (text) => {
    expect(() => parseFbaReturns(text)).toThrow(/missing|incomplete|unclosed|invalid/i)
  })
})
