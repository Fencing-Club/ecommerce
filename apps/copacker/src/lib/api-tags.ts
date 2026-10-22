// The browser's cached API data, by what it holds: "Supplier" for supplier names and lead times, "Restock" for restock
// results, "ProductSupplier" for which products have a supplier, and "InventoryLocation" for which Shopify locations
// count. A change made anywhere drops the caches it affects, so every view that shows them loads them again.
export const apiTags = ["Supplier", "Restock", "ProductSupplier", "InventoryLocation"] as const
export type ApiTag = (typeof apiTags)[number]

// The response header an /api/action names the caches it changed in, as a comma-separated list of tags.
export const invalidatesHeader = "X-Invalidates"
