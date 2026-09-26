// Where a PO line's product label comes from when the variation has no uploaded label: "standard" prints Amazon's
// FNSKU label with the Shopify title; "uploaded" needs the buyer's own, such as one with size measurements.
export const productLabels = ["standard", "uploaded"] as const
export type ProductLabel = (typeof productLabels)[number]
