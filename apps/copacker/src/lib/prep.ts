import type { PrepCategory } from "@repo/aisle"

// Preparation choices offered on POs and product defaults.
export const prepOptions: { value: PrepCategory; label: string }[] = [
  { value: "POLYBAGGING", label: "Sealed polybag (default)" },
  { value: "NO_PREP", label: "No preparation (exception)" },
  { value: "BUBBLEWRAPPING", label: "Bubble wrapping" },
  { value: "TAPING", label: "Taping" }
]
