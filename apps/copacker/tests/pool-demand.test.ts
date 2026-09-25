import { describe, expect, it } from "vitest"
import { poolDemand } from "../src/server/pool-demand"
import type { DemandGap, DemandRow } from "../src/server/sales-attribution"

const row = (pool: DemandRow["pool"], locationId: string | null, fulfilledUnits: number): DemandRow => ({
  pool,
  locationId,
  fulfilledUnits,
  variantId: pool === "shopify" ? "v1" : null,
  buyerSku: "SKU-1",
  bundleVariantId: null
})
const gap = (reason: DemandGap["reason"]): DemandGap => ({
  reason,
  sourceName: "web",
  locationId: null,
  orderId: "order",
  variantId: "v1",
  buyerSku: "SKU-1",
  units: 2
})

describe("restock demand by inventory pool", () => {
  it("uses only fulfilled merchant sales at the selected Shopify location", () => {
    const shopify = { rows: [row("shopify", "local", 12), row("shopify", "other", 4)], gaps: [] }
    const amazon = { rows: [row("fba", null, 30)], gaps: [] }
    expect(poolDemand({ pool: "shopify", variantId: "v1", locationId: "local" }, shopify, amazon)).toEqual({
      soldUnits: 12,
      reason: null
    })
  })
  it("uses FBA demand for both FBA and AWD, without Shopify mirror sales", () => {
    const shopify = { rows: [row("shopify", "amazon-mirror", 50)], gaps: [] }
    const amazon = { rows: [row("fba", null, 30), row("fbm_unassigned", null, 7)], gaps: [] }
    for (const pool of ["fba", "awd"] as const) {
      expect(poolDemand({ pool, buyerSku: "SKU-1", skuIsUnique: true }, shopify, amazon)).toEqual({
        soldUnits: 30,
        reason: null
      })
    }
  })
  it("withholds recommendations when attribution or SKU identity is unresolved", () => {
    expect(
      poolDemand(
        { pool: "shopify", variantId: "v1", locationId: "local" },
        { rows: [row("shopify", "local", 12)], gaps: [gap("unfulfilled")] },
        null
      ).soldUnits
    ).toBeNull()
    expect(
      poolDemand({ pool: "fba", buyerSku: "SKU-1", skuIsUnique: false }, null, {
        rows: [row("fba", null, 30)],
        gaps: []
      }).soldUnits
    ).toBeNull()
  })
})
