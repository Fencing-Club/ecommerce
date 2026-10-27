import { orderInputSchema } from "@repo/copacker-orders"
import { describe, expect, it } from "vitest"
import { packingSchema } from "../src/index"
import type { CartonLabel } from "../src/labels"
import { shipmentDocumentChecks } from "../src/shipping-rules"
import { IncompletePackingList, packingListSnapshot, shippingDocumentSnapshot } from "../src/shipping-snapshot"
import { transportSchema } from "../src/transport"

const origin = {
  name: "Mei Chen",
  phoneNumber: "+8657985551234",
  email: "mei@lotus.example.com",
  addressLine1: "1000 Siji Road",
  addressLine2: "Building 3",
  city: "Yiwu",
  stateOrRegion: "Zhejiang",
  postalCode: "322000",
  countryCode: "CN"
}
// A PO of one product in two-packs to AWD, packed into two cartons the supplier hands to AGL.
const order = orderInputSchema.parse({
  supplierId: "00000000-0000-4000-8000-000000000001",
  reference: "PO-1042",
  currency: "USD",
  items: [
    {
      id: "00000000-0000-4000-8000-000000000002",
      variantId: "gid://shopify/ProductVariant/2",
      inventoryItemId: "gid://shopify/InventoryItem/2",
      name: "Canvas tote bag",
      variant: "Natural",
      buyerSku: "BUYER-2",
      supplierSku: "SUP-2",
      asin: "B000000001",
      fnsku: "X000000001",
      pieces: 320,
      piecesPerSet: 2,
      unitPrice: 425,
      receiver: "awd_us",
      packingRequirements: { preparation: "sealedPolybag", labels: [], countryCode: "", instructions: "" }
    }
  ]
})
const product = order.items[0]!
const input = {
  order,
  packing: packingSchema.parse({
    origin,
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
  labels: ["A1", "A2"].map((cartonId, index): CartonLabel => ({
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
const pallet = { length: 120, width: 100, height: 90, weight: 62, stackable: true }
// The same PO to FBA, whose Amazon shipment names its pallets.
const fba = {
  ...input,
  order: { ...order, items: [{ ...product, receiver: "fba" as const }] },
  labels: input.labels.map((label) => ({ ...label, amazonShipmentId: "FBA18ABCD123" }))
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
    expect(data.origin.address).toEqual([
      "1000 Siji Road",
      "Building 3",
      "Yiwu, Zhejiang 322000",
      "CN",
      "Mei Chen, +8657985551234",
      "mei@lotus.example.com"
    ])
  })

  it("lists each pallet with its cartons, size and gross weight when the cartons are on pallets", () => {
    expect(shippingDocumentSnapshot(input).pallets).toBeUndefined()
    const data = shippingDocumentSnapshot({
      ...input,
      packing: { ...input.packing, palletized: true, pallets: [{ ...pallet, palletId: "1", cartonIds: ["A1", "A2"] }] }
    })
    expect(data.transport.palletized).toBe(true)
    // AWD takes its cartons as cases, so its pallets have no label.
    expect(data.pallets).toEqual([
      { id: "1", cartons: ["A1", "A2"], dimensions: [120, 100, 90], weight: 62, stackable: true }
    ])
    expect(() =>
      shippingDocumentSnapshot({
        ...input,
        packing: { ...input.packing, palletized: true, pallets: [{ ...pallet, palletId: "1", cartonIds: ["A1"] }] }
      })
    ).toThrow(/cartonsOffPallets/)
  })

  it("gives each FBA pallet its Amazon shipment and its number there, as Amazon's pallet labels show them", () => {
    const data = shippingDocumentSnapshot({
      ...fba,
      packing: {
        ...input.packing,
        palletized: true,
        pallets: [
          { ...pallet, palletId: "1", cartonIds: ["A1"] },
          { ...pallet, palletId: "2", cartonIds: ["A2"] }
        ]
      }
    })
    expect(data.network).toBe("fba")
    expect(data.pallets?.map((row) => row.label)).toEqual(["FBA18ABCD123 1/2", "FBA18ABCD123 2/2"])
  })

  it("exports a shipment on pallets that goes by freight from the supplier, with its pallet steps", () => {
    const data = shippingDocumentSnapshot({
      ...fba,
      packing: {
        ...input.packing,
        palletized: true,
        pallets: [{ ...pallet, stackable: false, palletId: "1", cartonIds: ["A1", "A2"] }]
      },
      transport: { ...input.transport, service: "freight" }
    })
    expect(data.transport).toMatchObject({ service: "freight", collection: "pickup", palletized: true })
    expect(data.pallets?.map((row) => row.label)).toEqual(["FBA18ABCD123 1/1"])
    const checks = shipmentDocumentChecks(data)
    expect(checks.pallets.map((check) => check.title)).toContain("palletLabel")
    expect(checks.handoff.map((check) => check.title)).toEqual(["bol", "ready"])
  })

  it("assigns each carton its carrier label when the carrier labels the cartons", () => {
    const transport = { ...input.transport, service: "parcel" as const, carrierLabels: "per_carton" as const }
    const carrierLabels = [
      { cartonId: "A2", labelNumber: "TRACK-2" },
      { cartonId: "A1", labelNumber: "TRACK-1" }
    ]
    const data = shippingDocumentSnapshot({ ...input, transport, carrierLabels })
    expect(data.transport.carrierLabels).toBe(true)
    expect(data.cartons.map((carton) => carton.carrierLabel)).toEqual(["TRACK-1", "TRACK-2"])
  })

  it("leaves out carrier labels the leg doesn't take, such as the onward leg's after a forwarder", () => {
    const carrierLabels = [
      { cartonId: "A1", labelNumber: "TRACK-1" },
      { cartonId: "A2", labelNumber: "TRACK-2" }
    ]
    const data = shippingDocumentSnapshot({ ...input, carrierLabels })
    expect(data.transport.carrierLabels).toBe(false)
    expect(data.cartons.map((carton) => carton.carrierLabel)).toEqual([undefined, undefined])
  })

  it("collects the PO's notes and each product's own instructions", () => {
    const data = shippingDocumentSnapshot({
      ...input,
      order: {
        ...order,
        notes: "Ship before the holiday.",
        items: [
          { ...product, packingRequirements: { ...product.packingRequirements!, instructions: "Fold in thirds." } }
        ]
      }
    })
    expect(data.instructions).toBe("Ship before the holiday.\n\nSUP-2:\nFold in thirds.")
  })

  it("makes a document for the buyer's own location without Amazon's labels", () => {
    const data = shippingDocumentSnapshot({
      ...input,
      order: {
        ...order,
        deliveryId: "00000000-0000-4000-8000-000000000003",
        items: [{ ...product, receiver: "warehouse" }]
      },
      labels: []
    })
    expect(data.network).toBe("warehouse")
    expect(data.cartons.map((carton) => carton.amazonLabel)).toEqual([undefined, undefined])
  })

  it("requires packing tasks to be confirmed instead of inferring tasks for already labelled products", () => {
    const changed = { ...order, items: [{ ...product, packingRequirements: undefined }] }
    expect(() => shippingDocumentSnapshot({ ...input, order: changed })).toThrow(/Confirm packing requirements/)
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
      shippingDocumentSnapshot({ ...input, order: { ...order, items: [{ ...product, supplierSku: "" }] } })
    ).toThrow(/missingProduct/)
    expect(() =>
      shippingDocumentSnapshot({ ...input, transport: { ...input.transport, handoff: "forwarder" } })
    ).toThrow(/handoff/)
    expect(() => shippingDocumentSnapshot({ ...input, destination: { name: "Example AWD", address: [] } })).toThrow(
      /Incomplete document: missingAddress/
    )
  })

  it("leaves a PO through a forwarder, or to more than one Amazon network, to be exported a leg or network at a time", () => {
    const via = {
      forwarderId: "00000000-0000-4000-8000-000000000004",
      addressId: "00000000-0000-4000-8000-000000000005"
    }
    expect(() => shippingDocumentSnapshot({ ...input, order: { ...order, via } })).toThrow(/onward destination/)
    const second = { ...product, id: "00000000-0000-4000-8000-000000000006", receiver: "fba" as const }
    const mixed = {
      ...input,
      order: { ...order, items: [product, second] },
      packing: {
        ...input.packing,
        cartons: [
          input.packing.cartons[0]!,
          { ...input.packing.cartons[1]!, items: [{ itemId: second.id, pieces: 160 }] }
        ]
      }
    }
    expect(() => shippingDocumentSnapshot(mixed)).toThrow(/one Amazon network at a time/)
  })
})

describe("supplier packet before it can be released", () => {
  const via = {
    forwarderId: "00000000-0000-4000-8000-000000000004",
    addressId: "00000000-0000-4000-8000-000000000005"
  }
  const forwarder = { name: "Example forwarder", address: ["1 Port Road", "Yiwu, Zhejiang 322000", "CN"] }
  const warehouse = { name: "Example warehouse", address: ["17 Example Way", "Seattle, WA 98101", "US"] }

  it("exports an Amazon shipment before Amazon has it, without its labels or warehouse address", () => {
    const data = shippingDocumentSnapshot({
      ...input,
      labels: [],
      destination: { name: "Amazon AWD US", address: [] },
      amazonPending: true
    })
    expect(data).toMatchObject({ network: "awd", amazonPending: true, destination: { address: [] } })
    expect(data.cartons.map((carton) => carton.amazonLabel)).toEqual([undefined, undefined])
    // The checklist still asks for the labels, which follow.
    expect(shipmentDocumentChecks(data).cartons.map((check) => check.title)).toContain("amazonLabel")
    expect(() => shippingDocumentSnapshot({ ...input, labels: [] })).toThrow(/every carton exactly once/)
  })

  it("only waits on Amazon for an Amazon shipment that has no labels yet", () => {
    expect(() => shippingDocumentSnapshot({ ...input, amazonPending: true })).toThrow(/without its labels/)
    const own = { ...order, deliveryId: "00000000-0000-4000-8000-000000000003" }
    expect(() =>
      shippingDocumentSnapshot({
        ...input,
        order: { ...own, items: [{ ...product, receiver: "warehouse" }] },
        labels: [],
        amazonPending: true
      })
    ).toThrow(/without its labels/)
  })

  it("exports the supplier's leg of a PO through a forwarder, to the forwarder and then onward", () => {
    const data = shippingDocumentSnapshot({
      ...input,
      order: {
        ...order,
        via,
        deliveryId: "00000000-0000-4000-8000-000000000003",
        items: [{ ...product, receiver: "warehouse" }]
      },
      labels: [],
      transport: { ...input.transport, service: "freight" },
      destination: forwarder,
      onward: { destination: warehouse, service: "forwarder" }
    })
    expect(data).toMatchObject({
      network: "forwarder",
      destination: forwarder,
      onward: { destination: warehouse, service: "forwarder" }
    })
    const checks = shipmentDocumentChecks(data)
    expect(checks.cartons.map((check) => check.title)).toEqual(["record", "cartonSealing", "identify"])
    expect(checks.handoff.map((check) => check.title)).toContain("handoff")
  })

  it("takes an onward leg only for a shipment through a forwarder", () => {
    expect(() =>
      shippingDocumentSnapshot({ ...input, onward: { destination: warehouse, service: "forwarder" } })
    ).toThrow(/Only a shipment through a forwarder/)
    // A shipment whose route leaves out the PO's forwarder goes without an onward leg.
    expect(() =>
      shippingDocumentSnapshot({ ...input, order: { ...order, via }, forwarder: true, onward: undefined })
    ).toThrow(/onward destination/)
    expect(shippingDocumentSnapshot({ ...input, order: { ...order, via }, forwarder: false }).network).toBe("awd")
  })
})

describe("packing list snapshot", () => {
  it("lists the pallets in the packing list download, before Amazon labels them", () => {
    const data = packingListSnapshot({
      ...input,
      packing: { ...input.packing, palletized: true, pallets: [{ ...pallet, palletId: "1", cartonIds: ["A1", "A2"] }] },
      destination: "Example AWD"
    })
    expect(data.transport.palletized).toBe(true)
    expect(data.destination).toEqual({ name: "Example AWD", address: [] })
    expect(data.pallets).toEqual([
      { id: "1", cartons: ["A1", "A2"], dimensions: [120, 100, 90], weight: 62, stackable: true }
    ])
  })

  it("lists a line by the buyer's SKU when it has no supplier SKU, before its transport or packing tasks are set", () => {
    const data = packingListSnapshot({
      ...input,
      order: { ...order, items: [{ ...product, supplierSku: "", packingRequirements: undefined }] },
      transport: null,
      destination: "Example AWD"
    })
    expect(data.products[0]).toMatchObject({ supplierSku: "BUYER-2", tasks: [] })
    expect(data.transport).toMatchObject({ service: "supplier", collection: "delivery", carrierLabels: false })
    expect(data.cartons.map((carton) => carton.amazonLabel)).toEqual([undefined, undefined])
  })

  it("refuses packing that can't make a packing list yet, naming what's missing", () => {
    const make = () => packingListSnapshot({ ...input, company: "", destination: "Example AWD" })
    expect(make).toThrow(IncompletePackingList)
    expect(make).toThrow(expect.objectContaining({ codes: ["missingIdentity: PO-1042"] }))
  })
})
