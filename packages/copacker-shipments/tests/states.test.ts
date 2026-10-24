import { describe, expect, it } from "vitest"
import { canEditRoute } from "../src/route"
import {
  canEditPacking,
  canReopenPacking,
  finishedStates,
  packedStates,
  releasedStates,
  shippedStates,
  shipmentStates
} from "../src/states"

const idle = { operation: "none", amazonOrderId: null }

describe("shipment states", () => {
  it("nests the groups the way a shipment moves through them", () => {
    expect(releasedStates.every((state) => packedStates.includes(state))).toBe(true)
    expect(shippedStates.every((state) => releasedStates.includes(state) && finishedStates.includes(state))).toBe(true)
    expect(packedStates.every((state) => shipmentStates.includes(state))).toBe(true)
  })

  it("edits packing only while it's packed or corrected and no Amazon request has started", () => {
    expect(canEditPacking({ status: "packing", ...idle })).toBe(true)
    expect(canEditPacking({ status: "correction", ...idle })).toBe(true)
    expect(canEditPacking({ status: "packed", ...idle })).toBe(false)
    expect(canEditPacking({ status: "packing", operation: "create", amazonOrderId: null })).toBe(false)
    expect(canEditPacking({ status: "packing", operation: "none", amazonOrderId: "STAR-1" })).toBe(false)
  })

  it("reopens finished packing only until the Amazon shipment starts", () => {
    expect(canReopenPacking({ status: "packed", ...idle })).toBe(true)
    expect(canReopenPacking({ status: "packed", operation: "none", amazonOrderId: "STAR-1" })).toBe(false)
    expect(canReopenPacking({ status: "ready", ...idle })).toBe(false)
  })

  it("lets a released shipment choose who moves its last leg once", () => {
    expect(canEditRoute("shipped", "none", null)).toBe(true)
    expect(
      canEditRoute("shipped", "none", {
        service: "parcel",
        handoff: "supplier",
        collection: "pickup",
        carrierLabels: "per_carton"
      })
    ).toBe(false)
    expect(canEditRoute("packed", "create", null)).toBe(false)
    expect(canEditRoute("waiting_labels", "labels", null)).toBe(true)
    expect(canEditRoute("cancelled", "none", null)).toBe(false)
  })
})
