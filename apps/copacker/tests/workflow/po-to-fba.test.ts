import { type Packing, packingSchema } from "@repo/copacker-shipments"
import { purchaseOrderPdf } from "@repo/copacker-shipments/documents"
import { and, eq } from "drizzle-orm"
import { PDFDocument } from "pdf-lib"
import { beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../../src/db/schema"
import { generatePo } from "../../src/server/documents"
import { createForwarder, forwarderAddresses, saveForwarderAddress } from "../../src/server/forwarders"
import { POST as action } from "../../src/server/http/api/action"
import { GET as downloadDocument } from "../../src/server/http/api/documents/$id"
import { GET as downloadPacket } from "../../src/server/http/api/shipments/$id/packet"
import {
  checkPacking,
  correctShipment,
  newShipment,
  prepareAmazonShipment,
  submitOrder,
  submitPacking
} from "../../src/server/orders"
import { runNextJob } from "../../src/server/queue"
import { orderWorkflow } from "../../src/server/workflow"
import { provider, storage } from "../mocks/providers"
import { database } from "../test-db"
import { signedIn } from "../test-session"
import {
  actor,
  buyer,
  buyerId,
  fbaOrder,
  gloveId,
  itemId,
  joinForwarder,
  orderId,
  post,
  printed,
  readyDate,
  retryDue,
  setUpWorkflowTests,
  shipmentState,
  supplier,
  supplierId,
  uploadCarrierLabels,
  uploadPdf
} from "./fixtures"

vi.mock("../../src/server/connections", async () => (await import("../mocks/providers")).connectionsModule())
vi.mock("../../src/server/product-fields", async (original) =>
  (await import("../mocks/providers")).productFieldsModule(original)
)
vi.mock("../../src/server/storage", async (original) => (await import("../mocks/providers")).storageModule(original))
vi.mock("@repo/copacker-shipments/documents", async (original) =>
  (await import("../mocks/providers")).documentsModule(original)
)
vi.mock("@repo/copacker-shipments/product-labels", async (original) =>
  (await import("../mocks/providers")).productLabelsModule(original)
)
vi.mock("../../src/server/auth", async (original) => (await import("../test-session")).mockAuth(original))
vi.mock("@/db", () => import("../test-db"))
vi.mock("../../src/server/import-trace", async (original) =>
  (await import("../mocks/providers")).importTraceModule(original)
)
vi.mock("../../src/server/readiness", async (original) =>
  (await import("../mocks/providers")).readinessModule(original)
)

setUpWorkflowTests()

const fbaPlanId = "wf00000000-0000-4000-8000-000000000001"

// Amazon's FBA inbound plans, as far as the shipment job uses them. Every step finishes by the time the job checks its
// operation. Amazon offers a packing option that splits cords from gloves and one that doesn't, and places the plan's
// boxes in two shipments to two warehouses, each offering its partnered carrier and the seller's own carrier with a
// delivery window.
function fakeFba() {
  const state = {
    name: "",
    status: "ACTIVE",
    packingOptions: [] as Array<{ packingOptionId: string; status: string; packingGroups: string[] }>,
    boxes: [] as Array<{ items: Array<{ msku: string; quantity: number }>; dimensions: unknown; weight: unknown }>,
    placementOptions: [] as Array<{ placementOptionId: string; status: string; shipmentIds: string[]; fee: number }>,
    transportation: false,
    windows: new Set<string>(),
    chosenWindows: new Map<string, string>(),
    selected: new Map<string, string>(),
    operations: 0
  }
  const api = provider.api
  const started = async () => `op-${++state.operations}`
  const groupItems: Record<string, string[]> = { cords: ["foil-2"], gloves: ["glove-6"], all: ["foil-2", "glove-6"] }
  // Cords go to the first warehouse, gloves to the second.
  const shipmentFor = (msku: string) => (msku === "foil-2" ? "sh-1" : "sh-2")
  api.fbaCreatePlan.mockImplementation(async (body: { name: string }) => {
    state.name = body.name
    return { inboundPlanId: fbaPlanId, operationId: await started() }
  })
  api.fbaOperation.mockResolvedValue({ operationStatus: "SUCCESS", operationProblems: [] })
  api.fbaPlan.mockImplementation(async () => ({
    inboundPlanId: fbaPlanId,
    name: state.name,
    status: state.status,
    packingOptions: state.packingOptions.map(({ packingOptionId, status }) => ({ packingOptionId, status })),
    placementOptions: state.placementOptions.map(({ placementOptionId, status }) => ({ placementOptionId, status }))
  }))
  api.fbaGeneratePackingOptions.mockImplementation(async () => {
    state.packingOptions = [
      { packingOptionId: "po-split", status: "OFFERED", packingGroups: ["cords", "gloves"] },
      { packingOptionId: "po-together", status: "OFFERED", packingGroups: ["all"] }
    ]
    return started()
  })
  api.fbaPackingOptions.mockImplementation(async () =>
    state.packingOptions.map((option) => ({ ...option, fees: [], discounts: [] }))
  )
  api.fbaPackingGroupItems.mockImplementation(async (_plan: string, group: string) =>
    groupItems[group]!.map((msku) => ({ msku, quantity: 1 }))
  )
  api.fbaConfirmPackingOption.mockImplementation(async (_plan: string, id: string) => {
    state.packingOptions = state.packingOptions.map((option) => ({
      ...option,
      status: option.packingOptionId === id ? "ACCEPTED" : "EXPIRED"
    }))
    return started()
  })
  api.fbaSetPacking.mockImplementation(
    async (_plan: string, body: { packageGroupings: Array<{ boxes: (typeof state.boxes)[number][] }> }) => {
      state.boxes = body.packageGroupings.flatMap((group) => group.boxes)
      return started()
    }
  )
  api.fbaPlanBoxes.mockImplementation(async () => state.boxes.map((_, index) => ({ packageId: `pkg-${index}` })))
  api.fbaGeneratePlacementOptions.mockImplementation(async () => {
    state.placementOptions = [
      { placementOptionId: "pl-one", status: "OFFERED", shipmentIds: ["sh-1"], fee: 5000 },
      { placementOptionId: "pl-split", status: "OFFERED", shipmentIds: ["sh-1", "sh-2"], fee: 0 }
    ]
    return started()
  })
  api.fbaPlacementOptions.mockImplementation(async () =>
    state.placementOptions.map(({ fee, ...option }) => ({
      ...option,
      fees: [{ type: "FEE", value: { amount: fee, code: "USD" } }],
      discounts: []
    }))
  )
  api.fbaConfirmPlacementOption.mockImplementation(async (_plan: string, id: string) => {
    state.placementOptions = state.placementOptions.map((option) => ({
      ...option,
      status: option.placementOptionId === id ? "ACCEPTED" : "EXPIRED"
    }))
    return started()
  })
  api.fbaShipment.mockImplementation(async (_plan: string, shipmentId: string) => ({
    shipmentId,
    placementOptionId: "pl-split",
    destination: { destinationType: "AMAZON_OPTIMIZED", warehouseId: shipmentId === "sh-1" ? "SMF3" : "ONT8" },
    selectedTransportationOptionId: state.selected.get(shipmentId),
    selectedDeliveryWindow: state.chosenWindows.has(shipmentId)
      ? { deliveryWindowOptionId: state.chosenWindows.get(shipmentId) }
      : undefined,
    shipmentConfirmationId: state.selected.has(shipmentId)
      ? `FBA15${shipmentId.toUpperCase().replace("-", "")}`
      : undefined
  }))
  api.fbaGenerateTransportationOptions.mockImplementation(async () => {
    state.transportation = true
    return started()
  })
  api.fbaTransportationOptions.mockImplementation(async (_plan: string, _placement: string, shipmentId: string) =>
    state.transportation
      ? [
          {
            transportationOptionId: `${shipmentId}-partnered`,
            shipmentId,
            shippingMode: "GROUND_SMALL_PARCEL",
            shippingSolution: "AMAZON_PARTNERED_CARRIER",
            preconditions: [],
            carrier: { name: "UPS" }
          },
          {
            transportationOptionId: `${shipmentId}-own`,
            shipmentId,
            shippingMode: "GROUND_SMALL_PARCEL",
            shippingSolution: "USE_YOUR_OWN_CARRIER",
            preconditions: ["CONFIRMED_DELIVERY_WINDOW"],
            carrier: { name: "Other" }
          }
        ]
      : []
  )
  api.fbaGenerateDeliveryWindowOptions.mockImplementation(async (_plan: string, shipmentId: string) => {
    state.windows.add(shipmentId)
    return started()
  })
  api.fbaDeliveryWindowOptions.mockImplementation(async (_plan: string, shipmentId: string) =>
    state.windows.has(shipmentId)
      ? [
          {
            deliveryWindowOptionId: `${shipmentId}-window`,
            startDate: "2099-01-01T00:00:00Z",
            endDate: "2099-01-08T00:00:00Z",
            availabilityType: "AVAILABLE",
            validUntil: "2099-01-01T00:00:00Z"
          }
        ]
      : []
  )
  api.fbaConfirmDeliveryWindow.mockImplementation(async (_plan: string, shipmentId: string, id: string) => {
    state.chosenWindows.set(shipmentId, id)
    return started()
  })
  api.fbaConfirmTransportation.mockImplementation(
    async (_plan: string, selections: Array<{ shipmentId: string; transportationOptionId: string }>) => {
      for (const selection of selections) {
        if (!state.chosenWindows.has(selection.shipmentId)) {
          throw new Error("Confirm a delivery window first")
        }
        state.selected.set(selection.shipmentId, selection.transportationOptionId)
      }
      return started()
    }
  )
  api.fbaShipmentBoxes.mockImplementation(async (_plan: string, shipmentId: string) =>
    state.boxes.flatMap((box, index) =>
      shipmentFor(box.items[0]!.msku) === shipmentId
        ? [
            {
              packageId: `pkg-${index}`,
              boxId: `FBA15${shipmentId.toUpperCase().replace("-", "")}U00000${index + 1}`,
              items: box.items,
              dimensions: box.dimensions,
              weight: box.weight
            }
          ]
        : []
    )
  )
  api.fbaBoxLabel.mockImplementation(
    async (_confirmation: string, boxId: string) => `https://fba-labels.s3.amazonaws.com/${boxId}.pdf`
  )
  api.fbaCancelPlan.mockImplementation(async () => {
    state.status = "VOIDED"
    return started()
  })
  return state
}

describe("PO to a released FBA shipment", () => {
  beforeEach(async () => {
    await database.update(tables.orders).set({ status: "draft", data: fbaOrder }).where(eq(tables.orders.id, orderId))
    await database
      .update(tables.orderRevisions)
      .set({ data: fbaOrder })
      .where(eq(tables.orderRevisions.orderId, orderId))
    const stored = new Map<string, Uint8Array>()
    storage.putFile.mockImplementation(async (key: string, bytes: Uint8Array) => {
      stored.set(key, bytes)
    })
    storage.getFile.mockImplementation(async (key: string) => stored.get(key)!)
    provider.shopifyFor.mockResolvedValue({ variants: async () => [] })
    const label = await PDFDocument.create()
    label.addPage([612, 792])
    const bytes = await label.save()
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response(Buffer.from(bytes)))
    )
  })

  // Sends the PO, enters the invoice and cartons for the supplier and runs the Amazon job until it stops.
  async function packed(cartons: Packing["cartons"]) {
    const { shipmentId } = await submitOrder(buyer, orderId, 1)
    await uploadPdf("invoice")
    const packing = packingSchema.parse({
      readyDate,
      origin: {
        name: "Supplier",
        addressLine1: "Road 1",
        city: "Shenzhen",
        stateOrRegion: "Guangdong",
        postalCode: "518000",
        countryCode: "CN",
        phoneNumber: "+86123456789",
        email: "supplier@example.com"
      },
      cartons
    })
    expect(await submitPacking(buyer, shipmentId, packing, 1)).toEqual({ approval: false })
    await prepareAmazonShipment(buyer, shipmentId, 1)
    await database.delete(tables.jobs).where(eq(tables.jobs.kind, "email"))
    for (let run = 0; run < 30; run++) {
      await retryDue()
      if (!(await runNextJob())) {
        break
      }
    }
    return shipmentId
  }

  it("plans, packs, places, books the buyer's own carrier and fetches each carton's box label", async () => {
    const amazon = fakeFba()
    const shipmentId = await packed([
      { cartonId: "C1", length: 50, width: 40, height: 30, weight: 15, items: [{ itemId, pieces: 80 }] },
      // Mixed cartons are fine at FBA, and a 70 cm carton holding a single unit is too.
      { cartonId: "C2", length: 50, width: 40, height: 30, weight: 12, items: [{ itemId, pieces: 80 }] },
      { cartonId: "G1", length: 70, width: 20, height: 10, weight: 1, items: [{ itemId: gloveId, pieces: 1 }] },
      { cartonId: "G2", length: 30, width: 20, height: 10, weight: 3, items: [{ itemId: gloveId, pieces: 9 }] }
    ])
    const [job] = await database.select().from(tables.jobs)
    expect(job).toMatchObject({ status: "complete", error: null })
    expect(provider.api.fbaCreatePlan).toHaveBeenCalledOnce()
    expect(provider.api.fbaCreatePlan.mock.calls[0]![0]).toMatchObject({
      name: `cp-${shipmentId.replaceAll("-", "")}-1`,
      destinationMarketplaces: ["ATVPDKIKX0DER"],
      sourceAddress: { stateOrProvinceCode: "Guangdong", countryCode: "CN" },
      items: [
        { msku: "foil-2", quantity: 80, labelOwner: "SELLER", prepOwner: "NONE" },
        { msku: "glove-6", quantity: 10, labelOwner: "SELLER", prepOwner: "SELLER" }
      ]
    })
    // The option with one packing group, the cheaper placement across two warehouses, and the buyer's own carrier.
    expect(provider.api.fbaConfirmPackingOption).toHaveBeenCalledWith(fbaPlanId, "po-together")
    expect(amazon.boxes.map((box) => box.items)).toEqual([
      [{ msku: "foil-2", quantity: 40, labelOwner: "SELLER", prepOwner: "NONE" }],
      [{ msku: "foil-2", quantity: 40, labelOwner: "SELLER", prepOwner: "NONE" }],
      [{ msku: "glove-6", quantity: 1, labelOwner: "SELLER", prepOwner: "SELLER" }],
      [{ msku: "glove-6", quantity: 9, labelOwner: "SELLER", prepOwner: "SELLER" }]
    ])
    expect(provider.api.fbaConfirmPlacementOption).toHaveBeenCalledWith(fbaPlanId, "pl-split")
    expect([...amazon.selected.values()]).toEqual(["sh-1-own", "sh-2-own"])
    const [shipment] = await database.select().from(tables.shipments).where(eq(tables.shipments.id, shipmentId))
    expect(shipment).toMatchObject({
      status: "waiting_labels",
      amazonOrderId: fbaPlanId,
      amazonShipmentId: "FBA15SH1, FBA15SH2",
      // Each SKU's group in the confirmed option.
      packingGroups: { "foil-2": "all", "glove-6": "all" },
      issue: null
    })
    expect(shipment!.labels).toEqual([
      { cartonId: "C1", labelNumber: "FBA15SH1U000001", destinationCode: "SMF3", amazonShipmentId: "FBA15SH1" },
      { cartonId: "C2", labelNumber: "FBA15SH1U000002", destinationCode: "SMF3", amazonShipmentId: "FBA15SH1" },
      { cartonId: "G1", labelNumber: "FBA15SH2U000003", destinationCode: "ONT8", amazonShipmentId: "FBA15SH2" },
      { cartonId: "G2", labelNumber: "FBA15SH2U000004", destinationCode: "ONT8", amazonShipmentId: "FBA15SH2" }
    ])
    expect(provider.api.fbaBoxLabel).toHaveBeenCalledWith("FBA15SH2", "FBA15SH2U000004")

    expect(
      (
        await post("shipment.transport", {
          id: shipmentId,
          revision: 1,
          expected: null,
          transport: {
            service: "parcel",
            handoff: "supplier",
            collection: "pickup",
            carrierLabels: "per_carton",
            instructions: ""
          }
        })
      ).status
    ).toBe(200)
    // Parcel transport needs a carrier label on each carton, and the four complete the packet.
    expect(await shipmentState(shipmentId)).toEqual({
      status: "waiting_labels",
      issues: Array(4).fill("missing_shipping_label")
    })
    const shipping = await uploadCarrierLabels(
      shipmentId,
      ["C1", "C2", "G1", "G2"].map((cartonId, index) => ({
        cartonId,
        file: 0,
        page: index + 1,
        trackingNumber: printed(index + 1)
      })),
      [4]
    )
    expect(await shipping.json()).toEqual({ sent: true })
    await database
      .insert(tables.memberships)
      .values({ orgId: buyerId, userId: buyer.user.id, email: buyer.user.email, role: "owner" })
    const packet = await downloadPacket(new Request("http://localhost?section=carton_labels"), {
      params: { id: shipmentId }
    })
    expect(packet.status).toBe(200)
    // Packing list, checklist, two product label sheets, four box labels and four shipping labels.
    expect((await PDFDocument.load(await packet.arrayBuffer())).getPageCount()).toBe(4)
  })

  it("ships to Amazon from the forwarder's address when the PO stops at a forwarder on the way", async () => {
    fakeFba()
    const forwarder = await createForwarder({ id: buyerId, name: "Buyer" }, { name: "Yiwu Logistics", email: "" })
    const stop = {
      name: "Yiwu warehouse",
      addressLine1: "88 Futian Road",
      addressLine2: "",
      city: "Yiwu",
      stateOrRegion: "Zhejiang",
      postalCode: "322000",
      countryCode: "CN",
      phoneNumber: "",
      email: ""
    }
    await saveForwarderAddress(buyerId, { forwarderId: forwarder.id, name: "Yiwu warehouse", address: stop })
    const [saved] = await forwarderAddresses(buyerId)
    const data = { ...fbaOrder, via: { forwarderId: forwarder.id, addressId: saved!.addressId } }
    await database.update(tables.orders).set({ data }).where(eq(tables.orders.id, orderId))
    await database.update(tables.orderRevisions).set({ data }).where(eq(tables.orderRevisions.orderId, orderId))
    const cartons = [
      { cartonId: "C1", length: 50, width: 40, height: 30, weight: 15, items: [{ itemId, pieces: 160 }] },
      { cartonId: "G1", length: 30, width: 20, height: 10, weight: 3, items: [{ itemId: gloveId, pieces: 10 }] }
    ]
    // Amazon needs a phone number to collect from the forwarder.
    const shipmentId = await packed(cartons)
    const [waiting] = await database.select().from(tables.shipments).where(eq(tables.shipments.id, shipmentId))
    expect(waiting).toMatchObject({ status: "needs_attention", amazonOrderId: null, operation: "none" })
    expect(waiting!.issue).toContain("Add a phone number to Yiwu Logistics’s Yiwu warehouse address")
    await saveForwarderAddress(buyerId, {
      forwarderId: forwarder.id,
      id: saved!.addressId,
      name: "Yiwu warehouse",
      address: { ...stop, phoneNumber: "+8657985550100" }
    })
    const retried = await action(
      new Request("http://localhost:3000/api/action", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({ action: "shipment.retry", data: { id: shipmentId, revision: 1 } })
      })
    )
    expect(retried.status).toBe(200)
    for (let run = 0; run < 30 && (await runNextJob()); run++) {
      await retryDue()
    }
    expect(provider.api.fbaCreatePlan.mock.calls[0]![0]).toMatchObject({
      sourceAddress: {
        name: "Yiwu warehouse",
        addressLine1: "88 Futian Road",
        city: "Yiwu",
        stateOrProvinceCode: "Zhejiang",
        phoneNumber: "+8657985550100"
      }
    })
    const [shipment] = await database.select().from(tables.shipments).where(eq(tables.shipments.id, shipmentId))
    expect(shipment?.status).toBe("waiting_labels")
    // The supplier's own documents still show its pickup address.
    expect(shipment!.packing!.origin.city).toBe("Shenzhen")
  })

  it("keeps a sent PO's stop when its forwarder joins, at the forwarder's own copy of the address", async () => {
    fakeFba()
    const forwarder = await createForwarder({ id: buyerId, name: "Buyer" }, { name: "Yiwu Logistics", email: "" })
    const stop = {
      name: "Yiwu warehouse",
      addressLine1: "88 Futian Road",
      addressLine2: "",
      city: "Yiwu",
      stateOrRegion: "Zhejiang",
      postalCode: "322000",
      countryCode: "CN",
      phoneNumber: "",
      email: ""
    }
    await saveForwarderAddress(buyerId, { forwarderId: forwarder.id, name: "Yiwu warehouse", address: stop })
    const [saved] = await forwarderAddresses(buyerId)
    const data = { ...fbaOrder, via: { forwarderId: forwarder.id, addressId: saved!.addressId } }
    await database.update(tables.orders).set({ data }).where(eq(tables.orders.id, orderId))
    await database.update(tables.orderRevisions).set({ data }).where(eq(tables.orderRevisions.orderId, orderId))
    // Amazon waits for a phone number at the stop, and the forwarder joins before anyone adds one.
    const shipmentId = await packed([
      { cartonId: "C1", length: 50, width: 40, height: 30, weight: 15, items: [{ itemId, pieces: 160 }] },
      { cartonId: "G1", length: 30, width: 20, height: 10, weight: 3, items: [{ itemId: gloveId, pieces: 10 }] }
    ])
    const forwarderOrg = await joinForwarder(forwarder.id)
    const [own] = await database.select().from(tables.contacts).where(eq(tables.contacts.orgId, forwarderOrg))
    // The forwarder adds the phone number to the address it now keeps, and the buyer retries.
    signedIn.actor = actor("forwarder", forwarderOrg)
    const update = {
      id: own!.id,
      name: "Yiwu warehouse",
      kind: "delivery",
      address: { ...stop, phoneNumber: "+8657985550100" }
    }
    expect((await post("contact.update", update)).status).toBe(200)
    signedIn.actor = buyer
    expect((await post("shipment.retry", { id: shipmentId, revision: 1 })).status).toBe(200)
    for (let run = 0; run < 30 && (await runNextJob()); run++) {
      await retryDue()
    }
    const [shipment] = await database.select().from(tables.shipments).where(eq(tables.shipments.id, shipmentId))
    expect(shipment).toMatchObject({ status: "waiting_labels", issue: null })
    expect(provider.api.fbaCreatePlan.mock.calls[0]![0]).toMatchObject({
      sourceAddress: { addressLine1: "88 Futian Road", city: "Yiwu", phoneNumber: "+8657985550100" }
    })
    // The purchase order ships to the address as the forwarder keeps it.
    await generatePo(orderId)
    expect(vi.mocked(purchaseOrderPdf).mock.lastCall![0].shipTo).toEqual({
      name: "Yiwu Logistics, Yiwu warehouse",
      lines: ["Then to Amazon FBA", "88 Futian Road", "Yiwu, Zhejiang 322000", "CN", "Yiwu warehouse, +8657985550100"]
    })
  })

  it("splits one PO's cartons into a shipment per Amazon network, each with its own Amazon job", async () => {
    fakeFba()
    // Cords go to AWD US in bulk; gloves go to FBA.
    const data = {
      ...fbaOrder,
      items: [{ ...fbaOrder.items[0]!, receiver: "awd_us" as const }, fbaOrder.items[1]!]
    }
    await database.update(tables.orders).set({ data }).where(eq(tables.orders.id, orderId))
    await database.update(tables.orderRevisions).set({ data }).where(eq(tables.orderRevisions.orderId, orderId))
    // An already-saved draft from before drafts were assigned a network at PO submission.
    await database.update(tables.orders).set({ status: "submitted" }).where(eq(tables.orders.id, orderId))
    const [draft] = await database
      .insert(tables.shipments)
      .values({ orderId, orderRevision: 1, snapshot: data })
      .returning()
    const shipmentId = draft!.id
    await uploadPdf("invoice")
    const packing = packingSchema.parse({
      readyDate,
      origin: {
        name: "Supplier",
        addressLine1: "Road 1",
        city: "Shenzhen",
        stateOrRegion: "Guangdong",
        postalCode: "518000",
        countryCode: "CN",
        phoneNumber: "+86123456789"
      },
      cartons: [
        { cartonId: "A1", length: 50, width: 40, height: 30, weight: 15, items: [{ itemId, pieces: 80 }] },
        { cartonId: "A2", length: 50, width: 40, height: 30, weight: 15, items: [{ itemId, pieces: 80 }] },
        { cartonId: "G1", length: 30, width: 20, height: 10, weight: 3, items: [{ itemId: gloveId, pieces: 10 }] }
      ]
    })
    // A carton can't mix networks.
    const mixed = {
      ...packing,
      cartons: [
        {
          ...packing.cartons[0]!,
          items: [
            { itemId, pieces: 160 },
            { itemId: gloveId, pieces: 10 }
          ]
        }
      ]
    }
    await expect(submitPacking(buyer, shipmentId, mixed, 1)).rejects.toThrow(
      "Pack FBA and AWD US products in separate cartons"
    )
    await submitPacking(buyer, shipmentId, packing, 1)
    await prepareAmazonShipment(buyer, shipmentId, 1)
    const rows = await database.select().from(tables.shipments).where(eq(tables.shipments.orderId, orderId))
    expect(
      rows
        .map((row) => [row.amazonNetwork, row.status, row.packing!.cartons.map((carton) => carton.cartonId)])
        .toSorted()
    ).toEqual([
      ["awd_us", "queued", ["A1", "A2"]],
      ["fba", "queued", ["G1"]]
    ])
    expect(rows.find((row) => row.id === shipmentId)?.amazonNetwork).toBe("fba")
    const queued = await database.select().from(tables.jobs).where(eq(tables.jobs.kind, "amazon"))
    expect(queued.map((job) => job.payload.shipmentId).toSorted()).toEqual(rows.map((row) => row.id).toSorted())
    const events = await database.select().from(tables.events).where(eq(tables.events.orderId, orderId))
    expect(events).toContainEqual(
      expect.objectContaining({
        messageKey: "packingSplit",
        messageValues: { networks: ["FBA", "AWD US"] },
        message: null
      })
    )
    // Every piece is reserved once across the two shipments.
    expect((await orderWorkflow(buyer, orderId)).items.map((item) => item.remainingPieces)).toEqual([0, 0])
    // The FBA shipment goes through Amazon's inbound plan on its own.
    await database.delete(tables.jobs).where(eq(tables.jobs.kind, "email"))
    await database
      .delete(tables.jobs)
      .where(eq(tables.jobs.key, `amazon:${rows.find((row) => row.amazonNetwork === "awd_us")!.id}:1`))
    for (let run = 0; run < 30 && (await runNextJob()); run++) {
      await retryDue()
    }
    expect(provider.api.fbaCreatePlan.mock.calls[0]![0]).toMatchObject({ items: [{ msku: "glove-6", quantity: 10 }] })
    const [fba] = await database.select().from(tables.shipments).where(eq(tables.shipments.id, shipmentId))
    expect(fba).toMatchObject({ status: "waiting_labels", amazonShipmentId: "FBA15SH2" })
  })

  it("keeps one PO invoice when shipments split or are corrected", async () => {
    const data = {
      ...fbaOrder,
      items: [{ ...fbaOrder.items[0]!, receiver: "awd_us" as const }, fbaOrder.items[1]!]
    }
    await database.update(tables.orders).set({ data }).where(eq(tables.orders.id, orderId))
    await database.update(tables.orderRevisions).set({ data }).where(eq(tables.orderRevisions.orderId, orderId))
    // An already-saved draft from before drafts were assigned a network at PO submission.
    await database.update(tables.orders).set({ status: "submitted" }).where(eq(tables.orders.id, orderId))
    const [draft] = await database
      .insert(tables.shipments)
      .values({ orderId, orderRevision: 1, snapshot: data })
      .returning()
    const shipmentId = draft!.id
    await uploadPdf("invoice")
    const packing = packingSchema.parse({
      readyDate,
      origin: {
        name: "Supplier",
        addressLine1: "Road 1",
        city: "Shenzhen",
        stateOrRegion: "Guangdong",
        postalCode: "518000",
        countryCode: "CN",
        phoneNumber: "+86123456789"
      },
      cartons: [
        { cartonId: "A1", length: 50, width: 40, height: 30, weight: 15, items: [{ itemId, pieces: 160 }] },
        { cartonId: "G1", length: 30, width: 20, height: 10, weight: 3, items: [{ itemId: gloveId, pieces: 10 }] }
      ]
    })
    await submitPacking(buyer, shipmentId, packing, 1)
    await prepareAmazonShipment(buyer, shipmentId, 1)
    const [awd] = await database
      .select()
      .from(tables.shipments)
      .where(and(eq(tables.shipments.orderId, orderId), eq(tables.shipments.amazonNetwork, "awd_us")))
    // The FBA shipment's cartons are corrected while the AWD shipment carries on and is released.
    await correctShipment(buyer, shipmentId, "Change cartons")
    await database.update(tables.shipments).set({ status: "ready" }).where(eq(tables.shipments.id, awd!.id))
    signedIn.actor = supplier
    expect(await (await post("shipment.ship", { id: awd!.id })).json()).toEqual({ ok: true })
    const invoices = await database.select().from(tables.documents).where(eq(tables.documents.kind, "invoice"))
    expect(invoices).toMatchObject([{ shipmentId: null, name: "Labels.pdf", outdated: false }])
    expect(invoices).toHaveLength(1)
    const invoice = invoices[0]!
    await database
      .insert(tables.memberships)
      .values({ orgId: supplierId, userId: supplier.user.id, email: supplier.user.email, role: "owner" })
    const download = await downloadDocument(new Request("http://localhost"), {
      params: { id: invoice.id }
    })
    expect(download.status).toBe(200)
    expect((await PDFDocument.load(await download.arrayBuffer())).getPageCount()).toBe(1)
  })

  it("keeps products Amazon packs separately out of the same carton", async () => {
    fakeFba()
    provider.api.fbaGeneratePackingOptions.mockImplementation(async () => "op-split-only")
    provider.api.fbaPackingOptions.mockResolvedValue([
      { packingOptionId: "po-split", status: "OFFERED", packingGroups: ["cords", "gloves"], fees: [], discounts: [] }
    ])
    const shipmentId = await packed([
      {
        cartonId: "M1",
        length: 50,
        width: 40,
        height: 30,
        weight: 15,
        items: [
          { itemId, pieces: 160 },
          { itemId: gloveId, pieces: 10 }
        ]
      }
    ])
    const [shipment] = await database.select().from(tables.shipments).where(eq(tables.shipments.id, shipmentId))
    expect(shipment).toMatchObject({
      status: "needs_attention",
      amazonOrderId: fbaPlanId,
      packingGroups: { "foil-2": "cords", "glove-6": "gloves" }
    })
    expect(shipment!.issue).toContain("Pack each product in its own cartons")

    // Packed again after cancelling the plan, the same carton breaks the groups Amazon set before it's sent.
    await correctShipment(buyer, shipmentId, "Pack cords and gloves apart")
    const cancelled = await action(
      new Request("http://localhost:3000/api/action", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({ action: "shipment.cancelAmazon", data: { id: shipmentId } })
      })
    )
    expect(cancelled.status).toBe(200)
    const next = await newShipment(supplier, orderId)
    const message =
      "FBA can’t take B-2 and G-6 in one carton: Amazon handles them differently, for example for dangerous goods, prep or labels"
    expect((await checkPacking(supplier, next.id, shipment!.packing)).issues).toContainEqual(
      expect.objectContaining({ code: "packing_rule", cartonId: "M1", message })
    )
    const apart = {
      ...shipment!.packing!,
      cartons: [
        { cartonId: "M1", length: 50, width: 40, height: 30, weight: 12, items: [{ itemId, pieces: 160 }] },
        { cartonId: "M2", length: 30, width: 20, height: 10, weight: 3, items: [{ itemId: gloveId, pieces: 10 }] }
      ]
    }
    expect((await checkPacking(supplier, next.id, apart)).issues).toEqual([])
  })

  it("cancels the inbound plan in Amazon before a replacement shipment", async () => {
    const amazon = fakeFba()
    const shipmentId = await packed([
      { cartonId: "C1", length: 50, width: 40, height: 30, weight: 15, items: [{ itemId, pieces: 160 }] },
      { cartonId: "G1", length: 30, width: 20, height: 10, weight: 3, items: [{ itemId: gloveId, pieces: 10 }] }
    ])
    await correctShipment(buyer, shipmentId, "Change cartons")
    const cancel = () =>
      action(
        new Request("http://localhost:3000/api/action", {
          method: "POST",
          headers: { origin: "http://localhost:3000", "content-type": "application/json" },
          body: JSON.stringify({ action: "shipment.cancelAmazon", data: { id: shipmentId } })
        })
      )
    expect((await cancel()).status).toBe(200)
    expect(amazon.status).toBe("VOIDED")
    const [shipment] = await database.select().from(tables.shipments).where(eq(tables.shipments.id, shipmentId))
    expect(shipment?.status).toBe("cancelled")
  })
})
