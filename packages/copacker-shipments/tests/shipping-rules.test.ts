import { cartonPolicies } from "@repo/copacker-packing-rules/carton-policies"
import { describe, expect, it } from "vitest"
import type { ShippingDocumentData } from "../src/shipping-model"
import { palletPolicyChecks, policyChecks, productChecks, shipmentDocumentChecks } from "../src/shipping-rules"
import { forwarder, palletFreight, parcelShipment } from "./shipping-fixtures"

const titles = (checks: { title: string }[]) => checks.map((check) => check.title)

describe("cartons", () => {
  it("checks each of the network's carton rules, then the labels and where they go", () => {
    expect(titles(shipmentDocumentChecks(parcelShipment).cartons)).toEqual([
      "record",
      "dimensions",
      "weightLimit",
      "amazonLabel",
      "carrierLabel",
      "placement"
    ])
    const awd = shipmentDocumentChecks({ ...parcelShipment, network: "awd" }).cartons
    expect(titles(awd)).toEqual(expect.arrayContaining(["singleSku", "unitLimit", "sameQuantity"]))
    expect(awd.find((check) => check.title === "unitLimit")!.values).toEqual({ units: 150 })
    // Without labels to place, a warehouse's cartons only need the packing list.
    const warehouse: ShippingDocumentData = {
      ...parcelShipment,
      network: "warehouse",
      transport: { ...parcelShipment.transport, carrierLabels: false }
    }
    expect(titles(shipmentDocumentChecks(warehouse).cartons)).toEqual(["record"])
  })

  it("lets one oversize or overweight unit go in a carton of its own only where the network allows it", () => {
    const fba = policyChecks(cartonPolicies.fba)
    // Without cartons to weigh, the policy's every check is listed, lift labels too.
    expect(fba.map((check) => check.detail)).toEqual(["oneUnitDimensionsText", "oneUnitWeightText", "heavyCartonsText"])
    const awd = policyChecks(cartonPolicies.awd_us)
    expect(awd.find((check) => check.title === "dimensions")!.detail).toBe("dimensionsText")
    expect(awd.find((check) => check.title === "weightLimit")!).toMatchObject({
      detail: "weightLimitText",
      values: { kg: 22.67, lb: 50 }
    })
  })

  it("asks for lift labels only when an FBA carton is over 50 lb", () => {
    const heavy = { ...parcelShipment.cartons[0]!, id: "C1", weight: 26 }
    const checks = shipmentDocumentChecks({ ...parcelShipment, cartons: [...parcelShipment.cartons, heavy] }).cartons
    expect(titles(checks)).toEqual([
      "record",
      "dimensions",
      "weightLimit",
      "heavyCartons",
      "amazonLabel",
      "carrierLabel",
      "placement"
    ])
    expect(checks.find((check) => check.title === "heavyCartons")!.values).toEqual({
      kg: 22.67,
      lb: 50,
      heavyKg: 45.35,
      heavyLb: 100
    })
    // AWD takes no carton over 50 lb, so it has no lift labels.
    expect(
      titles(shipmentDocumentChecks({ ...parcelShipment, network: "awd", cartons: [heavy] }).cartons)
    ).not.toContain("heavyCartons")
  })
})

describe("products", () => {
  const product = parcelShipment.products[0]!

  it("states the pack size of a multi-pack, then each task the buyer asked for", () => {
    expect(productChecks({ ...product, piecesPerPack: 3 }, "en")).toEqual([
      { title: "packQuantity", detail: "packQuantityText", values: { count: 3 } },
      { title: "sealedPolybag", detail: "sealedPolybagText" },
      { title: "fnsku", detail: "fnskuText" }
    ])
    expect(productChecks({ ...product, tasks: [] }, "en")).toEqual([])
  })

  it("names the country of origin in the document's language", () => {
    const labelled = { ...product, tasks: ["countryOfOrigin" as const], countryCode: "CN" }
    expect(productChecks(labelled, "en")[0]!.values).toEqual({ country: "China" })
    expect(productChecks(labelled, "de")[0]!.values).toEqual({ country: "China" })
    expect(productChecks({ ...labelled, countryCode: "DE" }, "de")[0]!.values).toEqual({ country: "Deutschland" })
    // A code that names no country is shown as it is.
    expect(productChecks({ ...labelled, countryCode: "C1" }, "en")[0]!.values).toEqual({ country: "C1" })
    expect(productChecks({ ...labelled, countryCode: undefined }, "en")[0]).toEqual({
      title: "countryOfOrigin",
      detail: "countryOfOriginText"
    })
  })
})

describe("pallets", () => {
  const fba = palletFreight("fba")
  const awd = palletFreight("awd")

  it("gives FBA and AWD pallets Amazon's type, height, weight, wrap and four labels", () => {
    // AWD's shipping requirements send sellers to the same LTL and FTL pallet rules.
    for (const shipment of [fba, awd]) {
      const checks = shipmentDocumentChecks(shipment).pallets
      expect(titles(checks)).toEqual(expect.arrayContaining(["palletType", "palletHeight", "weightLimit", "secure"]))
      expect(checks.find((check) => check.title === "palletType")!.values).toMatchObject({
        lengthCm: 121.9,
        widthCm: 101.6
      })
      expect(checks.find((check) => check.title === "palletHeight")!.values).toMatchObject({ heightCm: 182.9 })
      expect(checks.find((check) => check.title === "weightLimit")!.values).toMatchObject({ kg: 680, lb: 1500 })
    }
    expect(titles(shipmentDocumentChecks(fba).pallets)).toContain("palletLabel")
    expect(titles(shipmentDocumentChecks(awd).pallets)).toContain("palletLabel")
  })

  it("gives pallets to the buyer's own location the general steps", () => {
    expect(titles(shipmentDocumentChecks({ ...awd, network: "warehouse" }).pallets)).toEqual(["pallet", "secure"])
  })

  it("states a pallet rule without a grade or a stacked height as it is", () => {
    const checks = palletPolicyChecks({
      receiver: "Warehouse",
      rules: [
        {
          type: "footprint",
          sides: [120, 100],
          unit: "cm",
          description: "Use 120 × 100 cm pallets.",
          summary: "120 × 100 cm pallets"
        },
        {
          type: "maxHeight",
          height: 150,
          unit: "cm",
          description: "Pallets may be up to 150 cm tall.",
          summary: "Up to 150 cm tall"
        }
      ]
    })
    expect(checks).toEqual([
      expect.objectContaining({ detail: "palletSizeText", values: expect.objectContaining({ grade: "" }) }),
      { title: "palletHeight", detail: "palletHeightText", values: { heightCm: 150, heightIn: 59.1 } }
    ])
  })

  it("has the bill of lading ready at the handoff once the pallets are loaded", () => {
    for (const shipment of [fba, awd]) {
      expect(titles(shipmentDocumentChecks(shipment).handoff)).toEqual(["bol", "ready"])
    }
    // Freight loaded loose goes with a bill of lading too, without pallet steps.
    const loose = shipmentDocumentChecks({ ...fba, transport: { ...fba.transport, palletized: false } })
    expect(loose.pallets).toEqual([])
    expect(titles(loose.handoff)).toEqual(["bol", "ready"])
  })
})

describe("handoff", () => {
  it("ends with the pickup, the drop-off or the delivery", () => {
    const handoff = (collection: ShippingDocumentData["transport"]["collection"]) =>
      titles(
        shipmentDocumentChecks({ ...parcelShipment, transport: { ...parcelShipment.transport, collection } }).handoff
      )
    expect(handoff("pickup")).toEqual(["ready"])
    expect(handoff("dropoff")).toEqual(["dropoffTask"])
    expect(handoff("delivery")).toEqual(["deliveryTask"])
  })

  it("has the supplier seal and mark the cartons for a forwarder, and the forwarder confirm receipt", () => {
    const checks = shipmentDocumentChecks({
      ...parcelShipment,
      network: "forwarder",
      destination: forwarder,
      transport: { service: "supplier", collection: "delivery", carrierLabels: false, palletized: false }
    })
    expect(titles(checks.cartons)).toEqual(["record", "cartonSealing", "identify"])
    expect(checks.handoff.map((check) => check.detail)).toEqual([
      "includePackingText",
      "deliveryTaskText",
      "confirmReceiptText"
    ])
  })

  it("has a forwarder label the cartons it receives at the handoff, and check and relabel the ones it repacks", () => {
    const receiving = { shipment: "DEMO-XFER-01", cartons: ["T1", "T2"], repack: false }
    const received = shipmentDocumentChecks({ ...palletFreight("awd"), origin: forwarder, receiving })
    expect(received.cartons).toEqual([])
    expect(titles(received.handoff)).toEqual(["amazonLabel", "placement", "record", "bol", "ready"])
    expect(received.handoff.find((check) => check.title === "record")!.detail).toBe("outboundPackingText")

    const repacked = shipmentDocumentChecks({
      ...parcelShipment,
      origin: forwarder,
      receiving: { ...receiving, repack: true }
    })
    expect(titles(repacked.cartons)).toEqual(["record", "quantityCheck", "dimensions", "weightLimit"])
    expect(titles(repacked.handoff)).toEqual([
      "oldLabels",
      "newCartonLabels",
      "carrierLabel",
      "placement",
      "record",
      "ready"
    ])
    expect(repacked.handoff.find((check) => check.title === "record")!.detail).toBe("updatedPackingText")
  })
})
