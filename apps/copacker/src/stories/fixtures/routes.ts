import type { Route } from "@repo/copacker-packing-rules"
import type { RouteChoices, RouteStop } from "@/components/route-editor"
import { baylineShenzhen, baylineWarehouse, harborWarehouse, northwindFactory } from "./parties"

// The stops a shipment's route can make, from Northwind Textiles' factory by way of Bayline Freight or AGL to Harbor
// Goods' warehouse or one of Amazon's networks.
export const northwindStop: RouteStop = {
  id: "northwind-factory",
  company: "Northwind Textiles",
  kind: "supplier",
  name: "Northwind Textiles / Main factory",
  places: [{ address: northwindFactory }]
}
export const baylineStop: RouteStop = {
  id: "bayline-ningbo",
  company: "Bayline Freight",
  kind: "forwarder",
  name: "Bayline Freight",
  places: [{ address: baylineWarehouse }]
}
export const baylineShenzhenStop: RouteStop = {
  id: "bayline-shenzhen",
  company: "Bayline Freight",
  kind: "forwarder",
  name: "Bayline Freight / Shenzhen",
  places: [{ address: baylineShenzhen }]
}
export const aglStop: RouteStop = {
  id: "agl",
  company: "Amazon",
  kind: "agl",
  name: "Amazon Global Logistics (AGL)",
  detail: "Booked in Seller Central"
}
export const harborStop: RouteStop = {
  id: "harbor-portland",
  company: "Harbor Goods",
  kind: "receiver",
  receiver: "warehouse",
  name: "Harbor Goods / Portland warehouse",
  places: [{ address: harborWarehouse }]
}
export const fbaStop: RouteStop = {
  id: "fba",
  company: "Amazon",
  kind: "receiver",
  receiver: "fba",
  name: "Amazon FBA US",
  detail: "Amazon picks the fulfillment centers when the shipment is created"
}
export const awdStop: RouteStop = {
  id: "awd_us",
  company: "Amazon",
  kind: "receiver",
  receiver: "awd_us",
  name: "Amazon AWD US",
  detail: "Amazon picks the warehouse when the inbound order is confirmed"
}

// Every place a stop can be, in its menu's groups. The route rules pick the ones that fit each position.
export const routeChoices: RouteChoices = [
  { label: "Forwarders", stops: [baylineStop, baylineShenzhenStop] },
  { label: "Harbor Goods", stops: [harborStop] },
  { label: "Amazon", stops: [aglStop, fbaStop, awdStop] }
]

// Northwind Textiles ships to Bayline Freight, which takes the cartons on to AWD.
export const throughForwarder: Route<RouteStop> = {
  stops: [northwindStop, baylineStop, awdStop],
  legs: ["receiverArranges", "senderArranges"]
}

// Straight from the factory to Harbor Goods' warehouse, in Northwind Textiles' own truck.
export const direct: Route<RouteStop> = { stops: [northwindStop, harborStop], legs: ["senderMoves"] }

// AGL collects the cartons from the factory and ships them on to FBA.
export const throughAgl: Route<RouteStop> = {
  stops: [northwindStop, aglStop, fbaStop],
  legs: ["senderArranges", "senderArranges"]
}
