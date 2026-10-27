import { routeIssues } from "@repo/copacker-packing-rules"
import { describe, expect, it } from "vitest"
import {
  defaultShipmentRoute,
  followedRoute,
  routeForwarder,
  routeTransport,
  ruleRoute,
  type ShipmentRoute,
  shipmentReceiver,
  shipmentRouteSchema
} from "../src/route"

const via = { forwarderId: "6f1d6c2e-8b0a-4a8e-9a55-3f7a1d2c9b10", addressId: "0b7e2a9c-4d3f-4b8a-8c1e-2a6f9d3e5c71" }

describe("default shipment route", () => {
  it("goes from the supplier by way of the PO's forwarder, which the supplier ships to", () => {
    const route = defaultShipmentRoute({ via })
    expect(route).toEqual({
      stops: [{ kind: "supplier" }, { kind: "forwarder", ...via }, { kind: "receiver" }],
      legs: ["senderArranges", null]
    })
    expect(routeIssues(ruleRoute(route, "fba"))).toEqual([{ code: "legMissing", index: 1 }])
  })

  it("leaves the last leg unchosen", () => {
    expect(defaultShipmentRoute({})).toEqual({ stops: [{ kind: "supplier" }, { kind: "receiver" }], legs: [null] })
  })

  it("goes by the PO's forwarder only while its address is kept", () => {
    expect(followedRoute({ via }, [via])).toEqual(defaultShipmentRoute({ via }))
    expect(followedRoute({ via }, [{ ...via, addressId: "4c2b8e1a-7d6f-4e3b-9a0c-5f1e8d2b7a64" }])).toEqual(
      defaultShipmentRoute({})
    )
  })
})

describe("shipment receiver", () => {
  it("is the shipment's network, or the one its lines go to", () => {
    expect(shipmentReceiver({ items: [{ receiver: "warehouse" }] }, null)).toBe("warehouse")
    expect(shipmentReceiver({ items: [{ receiver: "fba" }] }, null)).toBe("fba")
    expect(shipmentReceiver({ items: [{ receiver: "fba" }, { receiver: "awd_us" }] }, "awd_us")).toBe("awd_us")
  })

  it("is the first line's network while an Amazon shipment's lines go to both", () => {
    expect(shipmentReceiver({ items: [{ receiver: "awd_us" }, { receiver: "fba" }] }, null)).toBe("awd_us")
  })
})

describe("transport from the route", () => {
  const route = (stops: ShipmentRoute["stops"], legs: ShipmentRoute["legs"]) =>
    shipmentRouteSchema.parse({ stops, legs })
  const supplier = { kind: "supplier" as const }
  const forwarder = { kind: "forwarder" as const, ...via }
  const receiver = { kind: "receiver" as const }

  it("has AGL collect the cartons from the stop before it, with no carrier labels", () => {
    expect(
      routeTransport(route([supplier, forwarder, { kind: "agl" }, receiver], ["senderArranges", null, null]), "fba")
    ).toEqual({
      service: "agl",
      handoff: "forwarder",
      collection: "pickup",
      carrierLabels: "none"
    })
  })

  it("puts a carrier label on each carton when a carrier takes them into Amazon", () => {
    expect(routeTransport(route([supplier, receiver], ["senderArranges"]), "fba")).toEqual({
      service: "parcel",
      handoff: "supplier",
      collection: "pickup",
      carrierLabels: "per_carton"
    })
  })

  it("has the sender bring the cartons when it delivers them itself", () => {
    expect(
      routeTransport(route([supplier, forwarder, receiver], ["senderArranges", "senderMoves"]), "fba")
    ).toMatchObject({
      handoff: "forwarder",
      collection: "dropoff",
      carrierLabels: "none"
    })
  })

  it("asks the buyer for carrier labels to its own warehouse only when it arranges the shipping", () => {
    expect(routeTransport(route([supplier, receiver], ["receiverArranges"]), "warehouse")?.carrierLabels).toBe(
      "per_carton"
    )
    expect(routeTransport(route([supplier, receiver], ["senderArranges"]), "warehouse")?.carrierLabels).toBe("none")
    expect(routeTransport(route([supplier, receiver], ["receiverMoves"]), "warehouse")?.collection).toBe("pickup")
  })

  it("has none until someone moves the last leg", () => {
    expect(routeTransport(route([supplier, receiver], [null]), "fba")).toBeNull()
  })

  it("keeps the legs in step with the stops", () => {
    expect(shipmentRouteSchema.safeParse({ stops: [supplier, receiver], legs: [] }).success).toBe(false)
  })

  it("stops at one forwarder at most, which routeForwarder names", () => {
    expect(routeForwarder(route([supplier, forwarder, receiver], ["senderArranges", null]))).toEqual(via)
    expect(routeForwarder(route([supplier, receiver], [null]))).toBeUndefined()
    const other = { ...forwarder, addressId: "4c2b8e1a-7d6f-4e3b-9a0c-5f1e8d2b7a64" }
    expect(
      shipmentRouteSchema.safeParse({ stops: [supplier, forwarder, other, receiver], legs: [null, null, null] }).success
    ).toBe(false)
  })
})
