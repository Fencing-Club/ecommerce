import type { OrderInput, OrderItem, PrepCategory } from "./index"

// How the supplier prepares each unit, as agreed on the PO line.
export const prepInstructions: Record<PrepCategory, string> = {
  POLYBAGGING: "Seal each unit in a clear polybag",
  NO_PREP: "No unit preparation",
  BUBBLEWRAPPING: "Bubble-wrap each unit",
  TAPING: "Tape each unit closed",
  BLACK_SHRINKWRAPPING: "Shrink-wrap each unit in black film",
  HANG_GARMENT: "Put each garment on a hanger",
  LABELING: "Label each unit"
}

// Rules a whole shipment follows because of where it goes. Amazon AWD and FBA check cartons and unit labels on
// arrival and charge for, or refuse, what doesn't comply; the buyer's own location and forwarders have none of their own.
export function destinationRequirements(destination: OrderInput["destination"]): string[] {
  const units = [
    "Label every unit with its FNSKU barcode, covering any other barcode.",
    "Polybags need a suffocation warning when the opening is 5 in (12.7 cm) or wider.",
    "Keep multi-packs together as one unit with a single label."
  ]
  if (destination === "amazon" || destination === "awd_us" || destination === "awd_china") {
    return [
      "Cartons at most 63.5 cm (25 in) on each side and 22.68 kg (50 lb).",
      "One SKU per carton, at most 150 units, packed the same way for each SKU.",
      ...units
    ]
  }
  if (destination === "fba") {
    return [
      "Cartons at most 63.5 cm (25 in) on each side and 22.68 kg (50 lb), unless one unit is larger.",
      "Mixed-SKU cartons are allowed. List each carton's contents on the packing list.",
      ...units
    ]
  }
  return []
}

// The preparation every line of a PO shares, stated once for the whole PO instead of on each line.
export function sharedPrep(order: Pick<OrderInput, "items">) {
  const [first, ...rest] = order.items
  return first && rest.every((item) => item.prepCategory === first.prepCategory) ? first.prepCategory : null
}

// What the supplier does for one line: its preparation (unless the whole PO shares it), multi-pack assembly, Amazon
// label and the product's own instructions, one per line.
export function itemRequirements(
  item: OrderItem,
  destination: OrderInput["destination"],
  shared: OrderItem["prepCategory"] | null = null
): string[] {
  const amazon = ["amazon", "awd_us", "awd_china", "fba"].includes(destination)
  return [
    ...(item.prepCategory === shared ? [] : [prepInstructions[item.prepCategory]]),
    ...(item.piecesPerSet > 1 ? [`Pack ${item.piecesPerSet} pieces together as one unit`] : []),
    ...(amazon && item.fnsku ? [`FNSKU label ${item.fnsku}`] : []),
    ...item.instructions
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
  ]
}
