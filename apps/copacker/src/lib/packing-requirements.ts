// Display labels for the shared persisted packing contract.
export type { PackingRequirements, ProductTask } from "@repo/aisle/packing-requirements"
export const preparationOptions = [
  { value: "none", label: "None" },
  { value: "polybag", label: "Polybag" },
  { value: "sealedPolybag", label: "Sealed polybag" }
] as const

export const packingLabelOptions = [
  { value: "sku", label: "SKU label" },
  { value: "fnsku", label: "FNSKU label" },
  { value: "suffocation", label: "Suffocation warning" },
  { value: "choking", label: "Choking hazard label" },
  { value: "countryOfOrigin", label: "Country of origin label" }
] as const
