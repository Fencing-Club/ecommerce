import { inventoryLocationKey, type InventoryLocationRef } from "@repo/copacker-contract"
import { usMarketplaceId } from "@repo/copacker-marketplaces/amazon-marketplaces"

// Collector capabilities. Adding a scope here also requires a collector that can read it; names never grant support.
export const stockScopes = {
  fba: { provider: "amazon", scopeKey: usMarketplaceId },
  awd: { provider: "amazon", scopeKey: "us" },
  shopify: { provider: "shopify", scopeKey: "store" }
} as const

export function inventoryLocationEnabled(
  selection: readonly InventoryLocationRef[] | null | undefined,
  location: InventoryLocationRef
) {
  return (
    selection === null ||
    selection === undefined ||
    selection.some((member) => inventoryLocationKey(member) === inventoryLocationKey(location))
  )
}
