import { addressLine } from "@repo/copacker-orders"
import type { Route, RouteChoices, RouteStop } from "@/components/route-editor"
import { baylineShenzhen, baylineWarehouse, harborWarehouse, northwindFactory } from "./parties"

// The stops a shipment's route can make, from Northwind Textiles' factory by way of Bayline Freight or AGL to Harbor
// Goods' warehouse or one of Amazon's networks.
export const northwindStop: RouteStop = {
  id: "northwind-factory",
  company: "Northwind Textiles",
  name: "Northwind Textiles / Main factory",
  detail: addressLine(northwindFactory)
}
export const baylineStop: RouteStop = {
  id: "bayline-ningbo",
  company: "Bayline Freight",
  name: "Bayline Freight",
  detail: addressLine(baylineWarehouse)
}
export const baylineShenzhenStop: RouteStop = {
  id: "bayline-shenzhen",
  company: "Bayline Freight",
  name: "Bayline Freight / Shenzhen",
  detail: addressLine(baylineShenzhen)
}
export const aglStop: RouteStop = {
  id: "agl",
  company: "Amazon",
  name: "Amazon Global Logistics (AGL)",
  detail: "Booked in Seller Central",
  agl: true
}
export const harborStop: RouteStop = {
  id: "harbor-portland",
  company: "Harbor Goods",
  name: "Harbor Goods / Portland warehouse",
  detail: addressLine(harborWarehouse),
  final: true
}
export const fbaStop: RouteStop = {
  id: "fba",
  company: "Amazon",
  name: "Amazon FBA US",
  detail: "Amazon picks the fulfillment centers when the shipment is created",
  final: true,
  network: "fba"
}
export const awdStop: RouteStop = {
  id: "awd_us",
  company: "Amazon",
  name: "Amazon AWD US",
  detail: "Amazon picks the warehouse when the inbound order is confirmed",
  final: true,
  network: "awd_us"
}

export const routeChoices: { stops: RouteChoices; destinations: RouteChoices } = {
  stops: [
    { label: "Forwarders", stops: [baylineStop, baylineShenzhenStop] },
    { label: "Amazon", stops: [aglStop] }
  ],
  destinations: [
    { label: "Harbor Goods", stops: [harborStop] },
    { label: "Amazon", stops: [fbaStop, awdStop] }
  ]
}

// Northwind Textiles ships to Bayline Freight, which takes the cartons on to AWD.
export const throughForwarder: Route = {
  stops: [northwindStop, baylineStop, awdStop],
  legs: ["receiverArranges", "senderArranges"]
}

// Straight from the factory to Harbor Goods' warehouse, in Northwind Textiles' own truck.
export const direct: Route = { stops: [northwindStop, harborStop], legs: ["senderMoves"] }

// AGL collects the cartons from the factory and ships them on to FBA.
export const throughAgl: Route = {
  stops: [northwindStop, aglStop, fbaStop],
  legs: ["senderArranges", "senderArranges"]
}
