import type { DemandGap, DemandRow } from "./sales-attribution"

type Selection =
  | { pool: "shopify"; variantId: string; locationId: string }
  | { pool: "fba" | "awd"; buyerSku: string; skuIsUnique: boolean }

// AWD has no separate sales channel. Its replenishment velocity is the linked Amazon FBA listing's sales.
// Shopify's Amazon mirror is never mixed into merchant-location demand.
export function poolDemand(
  selection: Selection,
  shopify: { rows: DemandRow[]; gaps: DemandGap[] } | null,
  amazon: { rows: DemandRow[]; gaps: DemandGap[] } | null
) {
  const source = selection.pool === "shopify" ? shopify : amazon
  if (!source || (selection.pool !== "shopify" && !selection.skuIsUnique)) {
    return { soldUnits: null, reason: "demand_unverified" as const }
  }
  const matches = (row: { variantId: string | null; buyerSku: string | null }) =>
    selection.pool === "shopify" ? row.variantId === selection.variantId : row.buyerSku === selection.buyerSku
  // A gap without product identity can affect every recommendation from this source.
  if (source.gaps.some((gap) => (!gap.variantId && !gap.buyerSku) || matches(gap))) {
    return { soldUnits: null, reason: "attribution_gap" as const }
  }
  let soldUnits = 0
  for (const row of source.rows) {
    if (!matches(row)) {
      continue
    }
    if (selection.pool === "shopify" && (row.pool !== "shopify" || row.locationId !== selection.locationId)) {
      continue
    }
    if (selection.pool !== "shopify" && row.pool !== "fba") {
      continue
    }
    soldUnits += row.fulfilledUnits
  }
  if (!Number.isSafeInteger(soldUnits)) {
    throw new Error("Pool sales exceed the supported range")
  }
  return { soldUnits, reason: null }
}
