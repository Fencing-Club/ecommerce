import { packingSchema } from "@repo/aisle"
import { describe, expect, it } from "vitest"
import { chooseTransportationOption, palletConfiguration } from "../src/server/fba-shipments"
import { bagOrder, bagPacking } from "../src/stories/fixtures/packing"

const option = (shippingMode: string, shippingSolution = "USE_YOUR_OWN_CARRIER") => ({
  transportationOptionId: `${shippingMode}-${shippingSolution}`,
  shipmentId: "sh1",
  shippingMode,
  shippingSolution,
  preconditions: [],
  carrier: {}
})
const pallet = (palletId: string, cartonIds: string[]) => ({
  palletId,
  length: 120,
  width: 100,
  height: 90,
  weight: 62,
  stackable: false,
  cartonIds
})

describe("FBA shipments on pallets", () => {
  it("books the buyer's own carrier: small parcels for loose cartons, less than a truckload for pallets", () => {
    const options = [
      option("GROUND_SMALL_PARCEL", "AMAZON_PARTNERED_CARRIER"),
      option("FREIGHT_FTL_PALLET"),
      option("GROUND_SMALL_PARCEL"),
      option("FREIGHT_LTL")
    ]
    expect(chooseTransportationOption(options)?.transportationOptionId).toBe("GROUND_SMALL_PARCEL-USE_YOUR_OWN_CARRIER")
    expect(chooseTransportationOption(options, true)?.transportationOptionId).toBe("FREIGHT_LTL-USE_YOUR_OWN_CARRIER")
    expect(chooseTransportationOption(options.slice(0, 2), true)?.shippingMode).toBe("FREIGHT_FTL_PALLET")
  })

  it("sends each Amazon shipment its whole pallets and the declared value of its goods", () => {
    const packing = packingSchema.parse({
      ...bagPacking(),
      palletized: true,
      pallets: [pallet("1", ["A1", "B1"]), pallet("2", ["C1"])]
    })
    const shipments = [
      { cartonId: "A1", shipmentId: "sh1" },
      { cartonId: "B1", shipmentId: "sh1" },
      { cartonId: "C1", shipmentId: "sh2" }
    ]
    expect(palletConfiguration(bagOrder, packing, shipments, "sh1")).toEqual({
      pallets: [
        {
          quantity: 1,
          dimensions: { length: 120, width: 100, height: 90, unitOfMeasurement: "CM" },
          weight: { value: 62, unit: "KG" },
          stackability: "NON_STACKABLE"
        }
      ],
      // A1 and B1 hold 90 bags at $1.80 and 50 tea towels at $1.55.
      freightInformation: { declaredValue: { amount: 239.5, code: "USD" }, freightClass: "NONE" }
    })
    expect(palletConfiguration(bagOrder, { ...packing, palletized: false }, shipments, "sh1")).toEqual({})
  })

  it("refuses a pallet whose cartons Amazon sends to two warehouses", () => {
    const packing = packingSchema.parse({
      ...bagPacking(),
      palletized: true,
      pallets: [pallet("1", ["A1", "B1", "C1"])]
    })
    expect(() =>
      palletConfiguration(
        bagOrder,
        packing,
        [
          { cartonId: "A1", shipmentId: "sh1" },
          { cartonId: "B1", shipmentId: "sh1" },
          { cartonId: "C1", shipmentId: "sh2" }
        ],
        "sh1"
      )
    ).toThrow("Amazon is sending the cartons on pallet 1 to different warehouses.")
  })
})
