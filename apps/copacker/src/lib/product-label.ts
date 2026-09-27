// Where a PO line's product label comes from when the variation has no uploaded label: "standard" prints Amazon's
// FNSKU label with the Shopify title; "uploaded" needs the buyer's own, such as one with size measurements; "none"
// needs no label, except on POs to Amazon, which labels every unit with its FNSKU.
export const productLabels = ["standard", "uploaded", "none"] as const
export type ProductLabel = (typeof productLabels)[number]
