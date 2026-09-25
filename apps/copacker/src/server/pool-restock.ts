import { poolDemand } from "./pool-demand"
import { restockRecommendation } from "./restock"
import { restockAvailability } from "./restock-availability"
import type { DemandGap, DemandRow } from "./sales-attribution"

type Sales = { rows: DemandRow[]; gaps: DemandGap[] } | null
type Selection =
  | { pool: "shopify"; variantId: string; locationId: string }
  | { pool: "fba" | "awd"; buyerSku: string; skuIsUnique: boolean }
type Availability = Parameters<typeof restockAvailability>[0]

export function poolRestock(input: {
  selection: Selection
  availability: Availability
  incoming: number | null
  caseQuantity: number | null
  unitCostMinor: number | null
  stocked: boolean
  unitsVerified: boolean
  shopifySales: Sales
  amazonSales: Sales
  leadTimeDays: number
  salesWindowDays: number
}) {
  const stock = restockAvailability(input.availability)
  if (stock.source !== input.selection.pool) {
    throw new Error("Stock source does not match the selected restock pool")
  }
  const demand = poolDemand(input.selection, input.shopifySales, input.amazonSales)
  const recommendation = restockRecommendation(
    {
      available: stock.available,
      verifiedIncoming: input.incoming,
      soldUnits: demand.soldUnits,
      caseQuantity: input.caseQuantity,
      unitCostMinor: input.unitCostMinor,
      stocked: input.stocked,
      unitsVerified: input.unitsVerified
    },
    { leadTimeDays: input.leadTimeDays, salesWindowDays: input.salesWindowDays }
  )
  return { stock, demand, recommendation }
}
