import type { ShopifyLocationKind } from "@repo/copacker-marketplaces/shopify"
import type { Shopify } from "@repo/copacker-marketplaces/shopify"
import { z } from "zod"

export const locationMappingSchema = z.strictObject({
  orgId: z.uuid(),
  shopifyDomain: z.string().min(1),
  locationId: z.string().regex(/^gid:\/\/shopify\/Location\/\d+$/),
  classification: z.enum(["merchant", "amazon_mirror", "excluded", "unresolved"])
})
type Mapping = z.infer<typeof locationMappingSchema>
export type LocationClassification = Mapping["classification"]
type Stock = Awaited<ReturnType<Shopify["stock"]>>

// How a location is treated until the buyer saves a choice: the store's own locations hold its stock, Shopify
// Collective holds a partner's, and Amazon's location mirrors FBA. Other apps' locations need a decision. The kind comes
// from the location's fulfillment service (see shopifyLocationKind), never its name. Synthetic stock pools without
// a Shopify fulfillment service remain unresolved unless explicitly classified.
const automatic: Record<ShopifyLocationKind, LocationClassification> = {
  merchant: "merchant",
  shopify_collective: "excluded",
  amazon_fulfillment: "amazon_mirror",
  fulfillment_service: "unresolved"
}
export function automaticClassification(kind: ShopifyLocationKind | null | undefined): LocationClassification {
  return kind ? automatic[kind] : "unresolved"
}

// Each observed location's classification: the buyer's saved choice, otherwise the automatic one.
export function locationClassifications(
  stock: { rows: { levels: { locationId: string; locationKind?: ShopifyLocationKind }[] }[] } | null,
  saved: Pick<Mapping, "locationId" | "classification">[]
) {
  const choices = new Map(saved.map((mapping) => [mapping.locationId, mapping.classification]))
  const result = new Map<string, LocationClassification>(choices)
  for (const row of stock?.rows ?? []) {
    for (const level of row.levels) {
      result.set(level.locationId, choices.get(level.locationId) ?? automaticClassification(level.locationKind))
    }
  }
  return result
}

// Shopify mirrors are observations, never authoritative Amazon inventory.
// This function makes no FBA/AWD association based on a location's display name.
export function classifyShopifyStock(orgId: string, stock: Stock, mappings: Mapping[]) {
  const selected = new Map<string, Mapping["classification"]>()
  for (const input of mappings) {
    const mapping = locationMappingSchema.parse(input)
    if (mapping.orgId !== orgId || mapping.shopifyDomain !== stock.shopifyDomain) {
      throw new Error("Inventory location mapping belongs to a different workspace or store")
    }
    if (selected.has(mapping.locationId)) {
      throw new Error("Duplicate inventory location mapping")
    }
    selected.set(mapping.locationId, mapping.classification)
  }
  const observed = new Set<string>()
  const rows = stock.rows.map((row) => {
    const levels = row.levels.map((level) => {
      observed.add(level.locationId)
      return {
        ...level,
        classification: selected.get(level.locationId) ?? automaticClassification(level.locationKind)
      }
    })
    const merchant = levels.filter((level) => level.classification === "merchant")
    const hasUnresolvedLocations = levels.some((level) => level.classification === "unresolved")
    const sum = (field: "available" | "onHand" | "incoming" | "committed") => {
      if (
        !row.tracked ||
        merchant.length === 0 ||
        hasUnresolvedLocations ||
        merchant.some((level) => level[field] === null)
      ) {
        return null
      }
      let total = 0
      for (const level of merchant) {
        total += level[field] ?? 0
        if (!Number.isSafeInteger(total)) {
          throw new Error("Inventory quantity exceeds the supported range")
        }
      }
      return total
    }
    return {
      ...row,
      levels,
      hasUnresolvedLocations,
      merchant: {
        available: sum("available"),
        onHand: sum("onHand"),
        incoming: sum("incoming"),
        committed: sum("committed")
      }
    }
  })
  return {
    source: stock.source,
    shopifyDomain: stock.shopifyDomain,
    observedAt: stock.observedAt,
    rows,
    // No levels for a mapped location is not evidence it was deleted or contains zero stock.
    unobservedLocationIds: [...selected.keys()].filter((id) => !observed.has(id)).sort()
  }
}
