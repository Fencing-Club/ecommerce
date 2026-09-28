import { describe, expect, it } from "vitest"
import { amazonShipmentLinks, listAmazonShipments } from "../src/server/amazon-shipments"

describe("Amazon shipments in Seller Central", () => {
  it("links each Amazon shipment a shipment's cartons travel in", () => {
    expect(amazonShipmentLinks({ amazonNetwork: "fba", amazonShipmentId: "FBA19R9S05PM, FBA19R9S06QN" })).toEqual([
      { id: "FBA19R9S05PM", url: "https://sellercentral.amazon.com/fba/inbound-shipment/summary/FBA19R9S05PM" },
      { id: "FBA19R9S06QN", url: "https://sellercentral.amazon.com/fba/inbound-shipment/summary/FBA19R9S06QN" }
    ])
    expect(amazonShipmentLinks({ amazonNetwork: "awd_us", amazonShipmentId: "STAR-TXBA6PPAPYKPM" })).toEqual([
      { id: "STAR-TXBA6PPAPYKPM", url: "https://sellercentral.amazon.com/awd/inbound-shipment/STAR-TXBA6PPAPYKPM" }
    ])
    // A shipment to the buyer's own warehouse, or one Amazon hasn't created yet, has none.
    expect(amazonShipmentLinks({ amazonNetwork: null, amazonShipmentId: null })).toEqual([])
    expect(amazonShipmentLinks({ amazonNetwork: "fba", amazonShipmentId: null })).toEqual([])
  })

  it("lists the account's shipments open first, then FBA before AWD, newest first", async () => {
    const rows = await listAmazonShipments({
      fbaShipments: async () => [
        { shipmentId: "FBA15OLD", name: "FBA (1/5/23 3:45 PM) - 1", status: "CLOSED" },
        { shipmentId: "FBA19NEW", name: "FBA STA (09/27/2026 23:41)-HEA2", status: "WORKING" },
        { shipmentId: "FBA18MID", name: null, status: "CANCELLED" }
      ],
      awdShipments: async () => [
        { shipmentId: "STAR-A", orderId: "STAR-OA", status: "CLOSED", createdAt: "2026-01-28T09:30:57.928Z" },
        { shipmentId: "STAR-B", orderId: "STAR-OB", status: "CREATED", createdAt: "2026-09-12T22:24:18.192Z" },
        { shipmentId: "STAR-C", orderId: "STAR-OC", status: "CLOSED", createdAt: "2026-03-30T06:31:12.504Z" }
      ]
    })
    expect(rows.map((row) => row.shipmentId)).toEqual([
      "FBA19NEW",
      "STAR-B",
      "FBA18MID",
      "FBA15OLD",
      "STAR-C",
      "STAR-A"
    ])
    expect(rows[1]).toEqual({
      network: "awd_us",
      shipmentId: "STAR-B",
      name: null,
      status: "CREATED",
      createdAt: "2026-09-12T22:24:18.192Z",
      url: "https://sellercentral.amazon.com/awd/inbound-shipment/STAR-B"
    })
  })
})
