// The ad's demo workspace. Every number agrees with every other: the restock maths, the purchase order, the cartons and
// the Amazon split all describe the same restock.
export const buyer = { name: "Ridgeline Goods", initials: "RG" }
export const supplier = { name: "Shenzhen Metalworks", initials: "SM" }
export const forwarder = { name: "Pacific Link Logistics", short: "Pacific Link", initials: "PL" }

export const leadTime = 60

// The supplier's products on the restock page. Sold is over the last 30 days.
export const restock = [
  {
    name: "Steel Bottle 32 oz",
    sku: "SM-3201",
    status: "stockout",
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
    status: "stockout",
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
    status: "stocked",
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
export const count = (value: number) => value.toLocaleString("en-US")
