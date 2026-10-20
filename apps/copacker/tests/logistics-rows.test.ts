import { describe, expect, it } from "vitest"
import type { ShipmentState } from "@/db/schema"
import { amazonParty, orderProgress, shipmentParty, shipmentStage } from "@/server/logistics-rows"

const via = { forwarderId: "00000000-0000-4000-8000-000000000001", addressId: "00000000-0000-4000-8000-000000000002" }

// A shipment of `pieces` in one carton.
function shipment(status: ShipmentState, pieces = 0) {
  return { status, snapshot: null, packing: pieces ? { cartons: [{ items: [{ pieces }] }] } : null }
}

function order(status: "draft" | "submitted" | "closed") {
  return { status, data: { destination: "amazon" as const, via, items: [{ pieces: 300 }, { pieces: 120 }] } }
}

describe("who a shipment waits on", () => {
  it.each([
    ["packing", {}, "supplier"],
    ["correction", {}, "supplier"],
    ["approval", {}, "buyer"],
    ["waiting_labels", {}, "buyer"],
    ["creating", {}, "amazon"],
    ["shipped", { via }, "forwarder"],
    ["shipped", { destination: "amazon" }, "amazon"],
    ["shipped", { destination: "warehouse" }, "carrier"],
    ["forwarded", { via, destination: "amazon" }, "amazon"],
    ["received", {}, "done"],
    ["cancelled", {}, "done"]
  ] as const)("%s %o waits on %s", (status, route, party) => {
    expect(shipmentParty(status, { destination: "warehouse", ...route })).toBe(party)
  })

  it("files received and cancelled shipments, in the app's words and Amazon's", () => {
    expect(["received", "CLOSED", "cancelled", "CANCELLED", "packing"].map(shipmentStage)).toEqual([
      "closed",
      "closed",
      "cancelled",
      "cancelled",
      "active"
    ])
  })

  it("leaves a working Seller Central shipment to the buyer", () => {
    expect(["WORKING", "IN_TRANSIT", "CLOSED"].map(amazonParty)).toEqual(["buyer", "amazon", "done"])
  })
})

describe("a purchase order's progress", () => {
  it("waits on the buyer while it's a draft", () => {
    expect(orderProgress(order("draft"), [], false)).toMatchObject({ stage: "draft", waiting: "buyer" })
  })

  it("waits on the buyer for a pending proposal before anything else", () => {
    expect(orderProgress(order("submitted"), [shipment("packing")], true)).toMatchObject({
      status: "changes_proposed",
      waiting: "buyer"
    })
  })

  it("shows the shipment most in need of someone", () => {
    expect(orderProgress(order("submitted"), [shipment("shipped", 100), shipment("approval")], false)).toMatchObject({
      status: "approval",
      waiting: "buyer"
    })
  })

  it("counts the pieces of shipments on their way", () => {
    const shipments = [shipment("shipped", 100), shipment("received", 50), shipment("packing", 70)]
    expect(orderProgress(order("submitted"), shipments, false)).toMatchObject({
      shipped: 150,
      quantity: 420,
      status: "packing",
      waiting: "supplier"
    })
  })

  it("waits on whoever delivers once everything has shipped", () => {
    expect(orderProgress(order("submitted"), [shipment("shipped", 420)], false)).toMatchObject({
      status: "shipped",
      waiting: "forwarder"
    })
  })

  it("waits on the supplier for the pieces not shipped yet", () => {
    expect(orderProgress(order("submitted"), [shipment("shipped", 100)], false)).toMatchObject({
      status: "shipped",
      waiting: "supplier"
    })
    expect(orderProgress(order("submitted"), [shipment("received", 100)], false)).toMatchObject({
      status: "received",
      waiting: "supplier"
    })
  })

  it("waits on nobody once every piece is received", () => {
    expect(orderProgress(order("submitted"), [shipment("received", 420)], false)).toMatchObject({
      status: "received",
      waiting: "done"
    })
  })

  it("waits on the supplier with no shipments yet, and on nobody once closed", () => {
    expect(orderProgress(order("submitted"), [], false)).toMatchObject({ status: "submitted", waiting: "supplier" })
    expect(orderProgress(order("closed"), [], false)).toMatchObject({ stage: "closed", waiting: "done" })
  })
})
