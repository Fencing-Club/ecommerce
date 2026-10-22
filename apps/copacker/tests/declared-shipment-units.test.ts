import { expect, it } from "vitest"
import { declaredShipmentUnits } from "../src/server/declared-shipment-units"

it("retains declared saleable units without converting cases or confirming receipts", () => {
  expect(declaredShipmentUnits({ units: { B: 0, A: 151 }, fetchedAt: new Date("2026-10-01") })).toEqual({
    status: "saved_declared_contents",
    source: "amazon_inbound_shipments",
    fetchedAt: "2026-10-01T00:00:00.000Z",
    unit: "saleable_units",
    rows: [
      { sku: "A", quantity: 151 },
      { sku: "B", quantity: 0 }
    ],
    missingSkuMeaning: "unknown",
    receivedUnitsConfirmed: false,
    caseConversion: null,
    physicalPieces: null
  })
})
it.each([null, {}, { A: -1 }, { A: 1.5 }, { A: "80" }, { A: Number.MAX_SAFE_INTEGER + 1 }])(
  "keeps missing or invalid totals unknown: %j",
  (units) => {
    expect(declaredShipmentUnits({ units, fetchedAt: new Date() })).toMatchObject({ status: "unknown", rows: [] })
  }
)
it("keeps an absent saved shipment unknown", () => {
  expect(declaredShipmentUnits(undefined)).toMatchObject({ status: "unknown", fetchedAt: null, rows: [] })
})
