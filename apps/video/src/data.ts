// The ad's demo workspace, the same brand, partners and products as the marketing page's pictures of the app. Every number
// agrees with every other: the restock maths, the purchase order, the cartons and the Amazon split all describe the same
// restock.

// Each company's workspace, and the person signed in to it.
export type Workspace = {
  name: string
  // A shorter name for tight spots, such as a label on the stage.
  short?: string
  kind: "Buyer" | "Supplier" | "Forwarder"
  person: { name: string; email: string }
}
export const buyer = {
  name: "Ridgeline Goods",
  kind: "Buyer",
  person: { name: "Alex Rivera", email: "alex@ridgelinegoods.com" }
} as const satisfies Workspace
export const supplier = {
  name: "Shenzhen Metalworks",
  kind: "Supplier",
  person: { name: "Wei Zhang", email: "wei@szmetalworks.com" }
} as const satisfies Workspace
export const forwarder = {
  name: "Pacific Link Logistics",
  short: "Pacific Link",
  kind: "Forwarder",
  person: { name: "Dana Brooks", email: "dana@pacificlinklogistics.com" }
} as const satisfies Workspace

// The purchase order the ad follows, and the one the agent places, by their reference numbers.
export const reference = "PO-1042"
export const agentReference = "PO-1043"

export const leadTime = 60

// The supplier's products on the restock page, with their stock status. Sold is over the last 30 days.
export const restock = [
  {
    name: "Steel Bottle 32 oz",
    sku: "SM-3201",
    status: "reorder_now",
    sold: 1830,
    available: 1140,
    incoming: 0,
    daysLeft: 18,
    order: 2520,
    caseOf: 24,
    cost: 4.5
  },
  {
    name: "Trail Mug 12 oz",
    sku: "SM-1204",
    status: "reorder_soon",
    sold: 1020,
    available: 1380,
    incoming: 0,
    daysLeft: 40,
    order: 660,
    caseOf: 12,
    cost: 3.5
  },
  {
    name: "Camp Tumbler 20 oz",
    sku: "SM-2002",
    status: "in_stock",
    sold: 540,
    available: 2400,
    incoming: 600,
    daysLeft: 133,
    order: 0,
    caseOf: 24,
    cost: 4.2
  }
] as const

export const ordered = restock.filter((line) => line.order > 0)
export const orderTotal = ordered.reduce((sum, line) => sum + line.order * line.cost, 0)
export const orderUnits = ordered.reduce((sum, line) => sum + line.order, 0)

// Restock's other supplier, with one product to reorder, and what every selected line adds up to: its cases, volume
// and weight, and the sales expected to be lost before the reorders arrive, which the Overview counts as stockout
// losses.
export const otherSupplier = { name: "Saigon Packaging Co.", leadTime: 45, units: 480, cost: 1440 }
export const restockTotals = {
  cost: orderTotal + otherSupplier.cost,
  lines: ordered.length + 1,
  units: orderUnits + otherSupplier.units,
  cases: 180,
  volume: "6.12 m³",
  weight: "1,820.0 kg",
  lost: 18340
}
// The cases, volume and weight of the supplier's own lines, from its cartons.
export const supplierTotals = { cases: 160, volume: "5.47 m³", weight: "1,652.5 kg" }

// How the purchase order splits between Amazon's networks: FBA to sell from, AWD in the US to refill it, and AWD in
// China and Vietnam to hold the rest offshore, where storage costs least.
export const split = {
  fba: { units: 780, cartons: 45 },
  awd: { units: 960, cartons: 40 },
  offshore: { units: 1440, cartons: 75 }
}
export const cartonTotal = split.fba.cartons + split.awd.cartons + split.offshore.cartons

// The holiday forecast for a product with enough stock today, and the sales it loses if the rush runs it out. The
// forecast's own model (src/scenes/holiday.tsx) works out the dates.
export const season = {
  product: restock[2].name,
  lost: 41200
}

// The end card's call to action.
export const cta = { action: "Get started", address: "copacker.ai" }

export const money = (value: number) =>
  `$${value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
// With cents, as the app's tables and totals show money.
export const cents = (value: number) =>
  `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const count = (value: number) => value.toLocaleString("en-US")
