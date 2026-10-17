import { expect, it } from "vitest"
import { parseFbaShipments } from "../src/fulfillment-shipments"
const header =
  "amazon-order-id\tshipment-id\tshipment-item-id\tamazon-order-item-id\tshipment-date\tsku\tquantity-shipped\tfulfillment-center-id\tfulfillment-channel\tsales-channel\tbuyer-email"
const row = "order1\tship1\tsi1\titem1\t2026-10-02T12:00:00-07:00\tSKU\t2\tFC\tAFN\tAmazon.com\tprivate@example.com"
it("retains stable shipment identities and zoned dates without buyer data", () => {
  const [result] = parseFbaShipments(`${header}\n${row}`)
  expect(result).toMatchObject({
    shipmentId: "ship1",
    shipmentItemId: "si1",
    orderItemId: "item1",
    quantity: 2,
    shippedAt: new Date("2026-10-02T19:00:00Z")
  })
  expect(JSON.stringify(result)).not.toContain("private")
})
it("rejects duplicate identities, ambiguous dates and bad quantities", () => {
  expect(() => parseFbaShipments(`${header}\n${row}\n${row}`)).toThrow("Duplicate")
  expect(() => parseFbaShipments(`${header}\n${row.replace("T12:00:00-07:00", "T12:00:00")}`)).toThrow(/Invalid/)
  expect(() => parseFbaShipments(`${header}\n${row.replace("\t2\t", "\t-1\t")}`)).toThrow(/Invalid/)
  expect(parseFbaShipments(header)).toEqual([])
})
