import { randomUUID } from "node:crypto"
import { orderInputSchema } from "@repo/copacker-orders"
import { describe, expect, it } from "vitest"
import {
  amazonReference,
  chooseDeliveryWindow,
  choosePackingOption,
  choosePlacementOption,
  chooseTransportationOption,
  FbaInboundError,
  fbaPlanName,
  freightPerSku,
  freightShipment,
  matchBoxes,
  palletConfiguration,
  sellerCentralShipment
} from "../src/amazon-inbound"
import { fbaBoxes, packingSchema } from "../src/index"

const foilId = randomUUID(),
  gloveId = randomUUID()
const item = {
  variantId: "gid://shopify/ProductVariant/1",
  inventoryItemId: "gid://shopify/InventoryItem/1",
  name: "Foil body cord",
  variant: "Two pack",
  supplierSku: "B02",
  asin: "B000000001",
  fnsku: "X000000001",
  receiver: "fba"
}
const order = orderInputSchema.parse({
  supplierId: randomUUID(),
  reference: "PO-37",
  currency: "USD",
  dueDate: "2026-10-10",
  items: [
    { ...item, id: foilId, buyerSku: "foil-2", pieces: 320, piecesPerSet: 2, unitPrice: 210 },
    {
      ...item,
      id: gloveId,
      variantId: "gid://shopify/ProductVariant/2",
      buyerSku: "glove-6",
      pieces: 12,
      piecesPerSet: 1,
      unitPrice: 100
    }
  ]
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
const packing = packingSchema.parse({
  readyDate: "2026-10-05",
  origin: {
    name: "Supplier",
    addressLine1: "13 Changxing Road",
    city: "Zhangjiagang",
    stateOrRegion: "Jiangsu",
    postalCode: "215600",
    countryCode: "CN",
    phoneNumber: "+8618861613263"
  },
  cartons: [
    { cartonId: "A1", length: 50, width: 40, height: 30, weight: 15, items: [{ itemId: foilId, pieces: 160 }] },
    { cartonId: "A2", length: 50, width: 40, height: 30, weight: 15, items: [{ itemId: foilId, pieces: 160 }] },
    { cartonId: "B1", length: 30, width: 30, height: 30, weight: 5, items: [{ itemId: gloveId, pieces: 12 }] }
  ]
})
const prep = new Map([
  ["foil-2", { prepCategory: "NONE" }],
  ["glove-6", { prepCategory: "NONE" }]
])
const usd = (amount: number) => ({ type: "FEE", value: { amount, code: "USD" } })

describe("Amazon inbound names and links", () => {
  it("names AWD orders and FBA plans so they can be matched to a shipment revision", () => {
    const id = "0b9b2c1e-7a4f-4a52-9a9e-2f1f6f0f1a2b"
    expect(amazonReference(id, 3)).toBe(`copacker-${id}-3`)
    expect(fbaPlanName(id, 3)).toBe("cp-0b9b2c1e7a4f4a529a9e2f1f6f0f1a2b-3")
    expect(fbaPlanName(id, 3).length).toBeLessThanOrEqual(40)
  })
  it("links each network's shipment page in Seller Central", () => {
    expect(sellerCentralShipment.fba("FBA1")).toBe("https://sellercentral.amazon.com/fba/inbound-shipment/summary/FBA1")
    expect(sellerCentralShipment.awd_us("STAR-1")).toBe("https://sellercentral.amazon.com/awd/inbound-shipment/STAR-1")
  })
})

describe("FBA inbound plan choices", () => {
  it("packs with the option keeping each carton to one group, then the fewest groups, then the lowest fees", async () => {
    const option = (packingOptionId: string, packingGroups: string[], fee = 0) => ({
      packingOptionId,
      status: "OFFERED",
      packingGroups,
      fees: [usd(fee)],
      discounts: []
    })
    const items: Record<string, Array<{ msku: string; quantity: number }>> = {
      g1: [{ msku: "foil-2", quantity: 160 }],
      g2: [{ msku: "glove-6", quantity: 12 }],
      both: [
        { msku: "foil-2", quantity: 160 },
        { msku: "glove-6", quantity: 12 }
      ]
    }
    const api = { fbaPackingGroupItems: async (_planId: string, group: string) => items[group]! }
    const best = await choosePackingOption(
      api,
      "plan",
      [option("split", ["g1", "g2"], 5), option("cheap", ["both"], 9), option("pricey", ["both"], 10)],
      order,
      packing
    )
    expect(best.option.packingOptionId).toBe("cheap")
    expect(best.fits).toBe(true)
    expect(Object.fromEntries(best.groups)).toEqual({ "foil-2": "both", "glove-6": "both" })
    await expect(choosePackingOption(api, "plan", [], order, packing)).rejects.toMatchObject({
      code: "amazonPackSeparately"
    })
  })

  it("places with the lowest fees, then the fewest shipments", () => {
    const option = (placementOptionId: string, shipmentIds: string[], fee: number, status = "OFFERED") => ({
      placementOptionId,
      status,
      shipmentIds,
      fees: [usd(fee)],
      discounts: [usd(1)]
    })
    expect(
      choosePlacementOption([
        option("expired", ["s1"], 0, "EXPIRED"),
        option("two", ["s1", "s2"], 5),
        option("one", ["s1"], 5),
        option("dear", ["s1"], 9)
      ])?.placementOptionId
    ).toBe("one")
    expect(choosePlacementOption([])).toBeNull()
  })

  it("books the buyer's own carrier: small parcels for loose cartons, less than a truckload for pallets", () => {
    const option = (shippingMode: string, shippingSolution = "USE_YOUR_OWN_CARRIER") => ({
      transportationOptionId: `${shippingMode}-${shippingSolution}`,
      shipmentId: "sh1",
      shippingMode,
      shippingSolution,
      preconditions: [],
      carrier: {}
    })
    const options = [
      option("GROUND_SMALL_PARCEL", "AMAZON_PARTNERED_CARRIER"),
      option("FREIGHT_FTL_PALLET"),
      option("GROUND_SMALL_PARCEL"),
      option("FREIGHT_LTL")
    ]
    expect(chooseTransportationOption(options)?.transportationOptionId).toBe("GROUND_SMALL_PARCEL-USE_YOUR_OWN_CARRIER")
    expect(chooseTransportationOption(options, true)?.transportationOptionId).toBe("FREIGHT_LTL-USE_YOUR_OWN_CARRIER")
    expect(chooseTransportationOption(options.slice(0, 2), true)?.shippingMode).toBe("FREIGHT_FTL_PALLET")
    // Pallets go as freight or not at all.
    expect(chooseTransportationOption([option("GROUND_SMALL_PARCEL")], true)).toBeNull()
  })

  it("delivers in the first window starting once the cartons are ready, or the latest offered", () => {
    const window = (deliveryWindowOptionId: string, startDate: string, availabilityType = "AVAILABLE") => ({
      deliveryWindowOptionId,
      startDate,
      endDate: startDate,
      availabilityType,
      validUntil: startDate
    })
    const options = [
      window("late", "2026-10-20T00:00:00Z"),
      window("early", "2026-10-01T00:00:00Z"),
      window("ready", "2026-10-06T00:00:00Z"),
      window("gone", "2026-10-05T00:00:00Z", "BLOCKED")
    ]
    expect(chooseDeliveryWindow(options, "2026-10-05")?.deliveryWindowOptionId).toBe("ready")
    expect(chooseDeliveryWindow(options, "2026-11-01")?.deliveryWindowOptionId).toBe("late")
    expect(chooseDeliveryWindow([], "2026-10-05")).toBeNull()
  })

  it("sends each Amazon shipment its whole pallets and the declared value of its goods", () => {
    const palletized = { ...packing, palletized: true, pallets: [pallet("1", ["A1", "A2"]), pallet("2", ["B1"])] }
    const cartons = [
      { cartonId: "A1", shipmentId: "sh1" },
      { cartonId: "A2", shipmentId: "sh1" },
      { cartonId: "B1", shipmentId: "sh2" }
    ]
    expect(palletConfiguration(order, palletized, cartons, "sh1")).toEqual({
      pallets: [
        {
          quantity: 1,
          dimensions: { length: 120, width: 100, height: 90, unitOfMeasurement: "CM" },
          weight: { value: 62, unit: "KG" },
          stackability: "NON_STACKABLE"
        }
      ],
      // 160 two-packs at $2.10 a piece.
      freightInformation: { declaredValue: { amount: 672, code: "USD" }, freightClass: "NONE" }
    })
    expect(palletConfiguration(order, packing, cartons, "sh1")).toEqual({})
    const split = { ...palletized, pallets: [pallet("1", ["A1", "A2", "B1"])] }
    expect(() => palletConfiguration(order, split, cartons, "sh1")).toThrow(FbaInboundError)
    expect(() => palletConfiguration(order, split, cartons, "sh1")).toThrow(
      expect.objectContaining({ code: "amazonPalletSplit", values: { pallets: "1" } })
    )
  })

  it("matches each carton to one of Amazon's boxes by contents, then size and weight", () => {
    const amazonBoxes = fbaBoxes(order, packing, prep).map(({ cartonId, box }, index) => ({
      box: { ...box, packageId: `p${index}`, boxId: `FBA1U00000${index}` },
      shipmentId: cartonId === "B1" ? "sh2" : "sh1"
    }))
    // Amazon lists them in its own order.
    expect(matchBoxes(order, packing, prep, amazonBoxes.toReversed())).toEqual([
      { cartonId: "A1", boxId: "FBA1U000001", shipmentId: "sh1" },
      { cartonId: "A2", boxId: "FBA1U000000", shipmentId: "sh1" },
      { cartonId: "B1", boxId: "FBA1U000002", shipmentId: "sh2" }
    ])
    expect(() => matchBoxes(order, packing, prep, amazonBoxes.slice(0, 2))).toThrow(
      expect.objectContaining({ code: "amazonNoBox", values: { carton: "B1" } })
    )
  })
})

describe("freight by shipment", () => {
  it("reads the inbound shipment a freight charge names", () => {
    expect(freightShipment("FBA19B16R6HZ")).toEqual({ network: "fba", shipmentId: "FBA19B16R6HZ" })
    expect(freightShipment("STAR-RDBKBGHGZMXXU")).toEqual({ network: "awd", shipmentId: "STAR-RDBKBGHGZMXXU" })
    expect(freightShipment("IB_2026-04-06_STAR-RDBKBGHGZMXXU")).toEqual({
      network: "awd",
      shipmentId: "STAR-RDBKBGHGZMXXU"
    })
    // A transfer from AWD to FBA names no inbound shipment.
    expect(freightShipment("repl-f718288b-49c2-4061-91d7-566c74272448")).toBeNull()
    expect(freightShipment(null)).toBeNull()
  })

  it("shares each shipment's freight by its units and leaves the rest to spread", () => {
    const result = freightPerSku(
      [
        { reference: "FBA1ABCDEF", freightMinor: 3000 },
        { reference: "FBA1ABCDEF", freightMinor: 1000 },
        { reference: "STAR-2", freightMinor: 1000 },
        { reference: "repl-3", freightMinor: 500 },
        // Its contents aren't known.
        { reference: "FBA4ABCDEF", freightMinor: 200 }
      ],
      new Map<string, Record<string, number> | null>([
        // $40 over 40 units: $1 each.
        ["FBA1ABCDEF", { A: 30, B: 10 }],
        // $10 over 5 units: $2 each.
        ["STAR-2", { B: 5 }],
        ["FBA4ABCDEF", null]
      ])
    )
    expect(Object.fromEntries(result.perUnit)).toEqual({ A: 100, B: (1000 + 1000) / 15 })
    expect(result.unallocatedMinor).toBe(700)
  })
})
