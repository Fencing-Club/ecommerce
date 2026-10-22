// The stores a workspace connects and copies sales from. Lists and loops follow this order.
export const stores = ["shopify", "amazon", "ebay"] as const
export type Store = (typeof stores)[number]

// Each store's name. They're brand names, so every language uses them as they are.
export const storeNames: Record<Store, string> = { shopify: "Shopify", amazon: "Amazon", ebay: "eBay" }
