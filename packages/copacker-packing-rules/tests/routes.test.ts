import { describe, expect, it } from "vitest"
import {
  appendStop,
  legChoices,
  removeLastStop,
  replaceStop,
  type Route,
  routeComplete,
  routeIssues,
  type RouteStop,
  setLeg,
  stopChoices
} from "../src/index"

const supplier: RouteStop = { id: "factory", company: "Northwind Textiles", kind: "supplier" }
const forwarder: RouteStop = { id: "bayline", company: "Bayline Freight", kind: "forwarder" }
const otherForwarder: RouteStop = { id: "bayline-shenzhen", company: "Bayline Freight", kind: "forwarder" }
const agl: RouteStop = { id: "agl", company: "Amazon", kind: "agl" }
const warehouse: RouteStop = { id: "portland", company: "Harbor Goods", kind: "receiver", receiver: "warehouse" }
const fba: RouteStop = { id: "fba", company: "Amazon", kind: "receiver", receiver: "fba" }
const awd: RouteStop = { id: "awd", company: "Amazon", kind: "receiver", receiver: "awd_us" }
const places = [supplier, forwarder, otherForwarder, agl, warehouse, fba, awd]
const ids = (stops: readonly RouteStop[]) => stops.map((stop) => stop.id)

const throughForwarder: Route = { stops: [supplier, forwarder, awd], legs: ["receiverArranges", "senderArranges"] }

describe("legChoices", () => {
  it("lets either company move the goods between two stops that aren't Amazon's", () => {
    expect(legChoices(supplier, forwarder)).toEqual([
      "senderArranges",
      "senderMoves",
      "receiverArranges",
      "receiverMoves"
    ])
    expect(legChoices(supplier, warehouse)).toHaveLength(4)
  })

  it("lets only the sender ship into an Amazon network", () => {
    expect(legChoices(forwarder, awd)).toEqual(["senderArranges", "senderMoves"])
    expect(legChoices(supplier, fba)).toEqual(["senderArranges", "senderMoves"])
  })

  it("leaves the legs to and from AGL to Amazon", () => {
    expect(legChoices(supplier, agl)).toEqual([])
    expect(legChoices(agl, fba)).toEqual([])
  })
})

describe("stopChoices", () => {
  it("offers a forwarder or AGL on the way, and AGL only before an Amazon network", () => {
    expect(ids(stopChoices(throughForwarder, 1, places))).toEqual(["bayline", "bayline-shenzhen", "agl"])
    const toWarehouse: Route = { stops: [supplier, forwarder, warehouse], legs: ["senderArranges", "senderArranges"] }
    expect(ids(stopChoices(toWarehouse, 1, places))).toEqual(["bayline", "bayline-shenzhen"])
  })

  it("offers final destinations for the last stop, and only Amazon's after AGL", () => {
    expect(ids(stopChoices(throughForwarder, 2, places))).toEqual(["portland", "fba", "awd"])
    const throughAgl: Route = { stops: [supplier, agl, fba], legs: ["senderArranges", "senderArranges"] }
    expect(ids(stopChoices(throughAgl, 2, places))).toEqual(["fba", "awd"])
  })

  it("offers anything that can follow the last stop when one is added, but nothing after a final destination", () => {
    const toForwarder: Route = { stops: [supplier, forwarder], legs: ["senderArranges"] }
    expect(ids(stopChoices(toForwarder, 2, places))).toEqual(["bayline-shenzhen", "agl", "portland", "fba", "awd"])
    expect(stopChoices(throughForwarder, 3, places)).toEqual([])
  })

  it("keeps the supplier first", () => {
    expect(ids(stopChoices(throughForwarder, 0, places))).toEqual(["factory"])
  })
})

describe("route changes", () => {
  it("moves a leg into an Amazon network to the sender when its stop becomes one", () => {
    const toWarehouse: Route = { stops: [supplier, warehouse], legs: ["receiverMoves"] }
    expect(replaceStop(toWarehouse, 1, fba).legs).toEqual(["senderArranges"])
  })

  it("keeps who moves a leg when the new stop still allows it", () => {
    expect(replaceStop(throughForwarder, 1, otherForwarder).legs).toEqual(["receiverArranges", "senderArranges"])
  })

  it("removes the last stop with the leg into it, and adds one with the first leg it allows", () => {
    const shorter = removeLastStop(throughForwarder)
    expect(shorter).toEqual({ stops: [supplier, forwarder], legs: ["receiverArranges"] })
    expect(appendStop(shorter, fba).legs).toEqual(["receiverArranges", "senderArranges"])
    expect(removeLastStop({ stops: [supplier], legs: [] }).stops).toEqual([supplier])
  })

  it("sets who moves a leg only when its stops allow it", () => {
    expect(setLeg(throughForwarder, 0, "receiverMoves").legs).toEqual(["receiverMoves", "senderArranges"])
    expect(setLeg(throughForwarder, 1, "receiverMoves")).toBe(throughForwarder)
  })
})

describe("routeIssues", () => {
  it("passes a route that ends at a final destination", () => {
    expect(routeIssues(throughForwarder)).toEqual([])
    expect(routeComplete(throughForwarder)).toBe(true)
  })

  it("asks for a final destination", () => {
    expect(routeIssues({ stops: [supplier, forwarder], legs: ["senderArranges"] })).toEqual([
      { code: "noFinalDestination" }
    ])
  })

  it("reports AGL that doesn't deliver into Amazon, a stop after a final destination and a leg nobody can move", () => {
    expect(routeIssues({ stops: [supplier, agl, warehouse], legs: ["senderArranges", "senderArranges"] })).toEqual([
      { code: "aglNotIntoAmazon", index: 1 }
    ])
    expect(routeIssues({ stops: [supplier, fba, forwarder], legs: ["senderArranges", "senderArranges"] })).toEqual([
      { code: "stopAfterFinalDestination", index: 2 },
      { code: "noFinalDestination" }
    ])
    expect(routeIssues({ stops: [supplier, fba], legs: ["receiverMoves"] })).toEqual([
      { code: "legNotAllowed", index: 0 }
    ])
  })
})
