import { packingSchema } from "@repo/aisle"
import { packingRequirementsSchema } from "@repo/aisle/packing-requirements"
import { transportSchema } from "@repo/aisle/transport"
import { describe, expect, it } from "vitest"
import { shippingDocumentSnapshot } from "../src/documents/shipping-snapshot"
import { pickupAddress } from "../src/stories/fixtures/logistics"
import { orderData, orderItem } from "../src/stories/fixtures/orders"

const product = orderItem({
  supplierSku: "SUP-2",
  buyerSku: "BUYER-2",
  pieces: 320,
  piecesPerSet: 2,
  fnsku: "X000000001",
  asin: "B000000001",
  amazonNetwork: "awd_us",
  packingRequirements: { preparation: "sealedPolybag", labels: [], countryCode: "", instructions: "" }
})
const input = {
  order: orderData({ destination: "amazon", deliveryId: undefined, items: [product] }),
  packing: packingSchema.parse({
    origin: pickupAddress,
    readyDate: "2026-10-20",
    cartons: ["A1", "A2"].map((cartonId) => ({
      cartonId,
      length: 40,
      width: 30,
      height: 20,
      weight: 12,
      items: [{ itemId: product.id, pieces: 160 }]
    }))
  }),
  labels: ["A1", "A2"].map((cartonId, index) => ({
    cartonId,
    labelNumber: `SSCC-${index}`,
    destinationCode: "AWD",
    amazonShipmentId: "STAR-EXAMPLE"
  })),
  transport: transportSchema.parse({
    handoff: "supplier",
    service: "agl",
    collection: "pickup",
    carrierLabels: "none"
  }),
  company: "Example buyer",
  supplier: "Example supplier",
  revision: 2,
  destination: { name: "Example AWD", address: ["100 Example Road", "Portland, OR 97201", "US"] },
  shipmentId: "STAR-EXAMPLE",
  generatedDate: "2026-10-17"
}

describe("accepted shipment document snapshot", () => {
  it("preserves brand, supplier SKUs, physical cartons and explicit tasks without assigning extra labels", () => {
    const data = shippingDocumentSnapshot(input)
    expect(data.company).toBe(input.company)
    expect(data.network).toBe("awd")
    expect(data.products[0]).toMatchObject({ supplierSku: "SUP-2", piecesPerPack: 2, tasks: ["sealedPolybag"] })
    expect(data.products[0]).not.toHaveProperty("buyerSku")
    expect(data.cartons[0]).toMatchObject({
      id: "A1",
      amazonLabel: "SSCC-0",
      contents: [{ productId: product.id, packs: 80 }]
    })
    expect(data.transport.carrierLabels).toBe(false)
    expect(data.origin.address).toContain(pickupAddress.email)
  })

  it("lists each pallet with its cartons, size and gross weight when the cartons are on pallets", () => {
    const pallet = { palletId: "1", length: 120, width: 100, height: 90, weight: 62, stackable: true }
    expect(shippingDocumentSnapshot(input).pallets).toBeUndefined()
    const data = shippingDocumentSnapshot({
      ...input,
      packing: { ...input.packing, palletized: true, pallets: [{ ...pallet, cartonIds: ["A1", "A2"] }] }
    })
    expect(data.transport.palletized).toBe(true)
    expect(data.pallets).toEqual([{ id: "1", cartons: ["A1", "A2"], dimensions: [120, 100, 90], weight: 62 }])
    expect(() =>
      shippingDocumentSnapshot({
        ...input,
        packing: { ...input.packing, palletized: true, pallets: [{ ...pallet, cartonIds: ["A1"] }] }
      })
    ).toThrow(/cartonsOffPallets/)
  })

  it("requires packing tasks to be confirmed instead of inferring tasks for already labelled products", () => {
    const order = { ...input.order, items: [{ ...product, packingRequirements: undefined }] }
    expect(() => shippingDocumentSnapshot({ ...input, order })).toThrow(/Confirm packing requirements/)
  })

  it("refuses incomplete or duplicated carton-to-label assignments", () => {
    for (const labels of [
      input.labels.slice(0, 1),
      [input.labels[0]!, input.labels[0]!],
      [input.labels[0]!, { ...input.labels[1]!, cartonId: "other" }]
    ]) {
      expect(() => shippingDocumentSnapshot({ ...input, labels })).toThrow(/every carton exactly once/)
    }
    const transport = { ...input.transport, service: "parcel" as const, carrierLabels: "per_carton" as const }
    expect(() => shippingDocumentSnapshot({ ...input, transport })).toThrow(/Carrier labels/)
  })

  it("refuses invalid packing, missing supplier identity and unsupported handoff details", () => {
    const packing = structuredClone(input.packing)
    packing.cartons[0]!.weight = 30
    expect(() => shippingDocumentSnapshot({ ...input, packing })).toThrow(/Invalid packing/)
    expect(() =>
      shippingDocumentSnapshot({ ...input, order: { ...input.order, items: [{ ...product, supplierSku: "" }] } })
    ).toThrow(/missingProduct/)
    expect(() =>
      shippingDocumentSnapshot({ ...input, transport: { ...input.transport, handoff: "forwarder" } })
    ).toThrow(/handoff/)
  })

  it("validates independent label tasks and origin information", () => {
    const config = { preparation: "none", labels: ["sku", "fnsku"], countryCode: "", instructions: "" }
    expect(packingRequirementsSchema.safeParse(config).success).toBe(true)
    expect(packingRequirementsSchema.safeParse({ ...config, labels: ["sku", "sku"] }).success).toBe(false)
    expect(packingRequirementsSchema.safeParse({ ...config, labels: ["countryOfOrigin"] }).success).toBe(false)
    expect(
      packingRequirementsSchema.safeParse({ ...config, labels: ["countryOfOrigin"], countryCode: "CN" }).success
    ).toBe(true)
  })
})
