import { describe, expect, it } from "vitest"
import { parseRemovalReport } from "../src/removals"
const common = {
  "request-date": "2026-10-01T01:00:00+02:00",
  "order-id": "REM1",
  sku: "SKU1",
  fnsku: "FN1",
  disposition: "UNSELLABLE",
  "shipped-quantity": "2"
}
const orders = {
  ...common,
  "order-type": "Disposal",
  "order-status": "NEW_STATUS",
  "last-updated-date": "2026-10-15T10:00:00Z",
  "requested-quantity": "10",
  "cancelled-quantity": "1",
  "disposed-quantity": "3",
  "in-process-quantity": "4",
  "removal-fee": "-9007199254740993.123456789",
  currency: "USD"
}
const shipments = {
  ...common,
  "shipment-date": "2026-10-05T12:00:00Z",
  carrier: "UPS",
  "tracking-number": '"TRACK\tWITH\nLINES"',
  "removal-order-type": "Return"
}
function report(row: Record<string, string>) {
  return Object.keys(row).join("\t") + "\n" + Object.values(row).join("\t")
}
describe("removal order and shipment parsing", () => {
  it("preserves exact fees, independent quantities, unknown codes and offset-aware request/update dates", () => {
    expect(parseRemovalReport(report(orders), "orders")[0]).toMatchObject({
      requestedAt: new Date("2026-09-30T23:00:00Z"),
      updatedAt: new Date("2026-10-15T10:00:00Z"),
      orderId: "REM1",
      orderType: "Disposal",
      status: "NEW_STATUS",
      requestedQuantity: 10,
      cancelledQuantity: 1,
      disposedQuantity: 3,
      shippedQuantity: 2,
      inProcessQuantity: 4,
      removalFee: "-9007199254740993.123456789",
      currency: "USD",
      serviceSpeed: null,
      orderSource: null,
      shippedAt: null,
      trackingNumber: null
    })
  })
  it("retains split shipments and quoted tracking while leaving fee/disposal fields unknown", () => {
    const text = report(shipments)
    const rows = parseRemovalReport(text + "\n" + Object.values(shipments).join("\t"), "shipments")
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      trackingNumber: "TRACK\tWITH\nLINES",
      shippedAt: new Date("2026-10-05T12:00:00Z"),
      shippedQuantity: 2,
      removalFee: null,
      currency: null,
      disposedQuantity: null,
      requestedQuantity: null,
      updatedAt: null
    })
  })
  it("distinguishes missing quantities and fees from zero without guessing product links", () => {
    expect(
      parseRemovalReport(
        report({
          ...orders,
          sku: "",
          fnsku: "",
          "removal-fee": "",
          "disposed-quantity": "",
          "cancelled-quantity": "0"
        }),
        "orders"
      )[0]
    ).toMatchObject({ sku: null, fnsku: null, removalFee: null, disposedQuantity: null, cancelledQuantity: 0 })
  })
  it.each<Record<string, string>>([
    { "request-date": "2026-10-01" },
    { "request-date": "2026-02-30T00:00:00Z" },
    { "last-updated-date": "2026-10-01T10:00:00" },
    { "requested-quantity": "1.5" },
    { "shipped-quantity": "2147483648" },
    { "removal-fee": "1,000" },
    { currency: "usd" },
    { "order-id": "" }
  ])("rejects malformed order evidence %j", (overrides) => {
    expect(() => parseRemovalReport(report({ ...orders, ...overrides }), "orders")).toThrow(/./)
  })
  it("requires a valid shipment timestamp and the correct source headers", () => {
    expect(() => parseRemovalReport(report({ ...shipments, "shipment-date": "" }), "shipments")).toThrow(/./)
    expect(() => parseRemovalReport(report(orders), "shipments")).toThrow(/./)
    expect(() => parseRemovalReport(report(shipments), "orders")).toThrow(/./)
    expect(parseRemovalReport(Object.keys(orders).join("\t"), "orders")).toEqual([])
    expect(parseRemovalReport(Object.keys(shipments).join("\t"), "shipments")).toEqual([])
  })
})
