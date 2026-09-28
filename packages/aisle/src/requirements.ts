import {
  type AmazonNetwork,
  amazonNetworkNames,
  amazonNetworks,
  type OrderInput,
  type OrderItem,
  type PrepCategory
} from "./index"

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

// The Amazon networks the given lines go to, in network order, or none for a PO that doesn't go to Amazon.
export function orderNetworks(order: Pick<OrderInput, "destination" | "items">): AmazonNetwork[] {
  if (order.destination !== "amazon") {
    return []
  }
  const used = new Set(order.items.map((item) => item.amazonNetwork))
  return amazonNetworks.filter((network) => used.has(network))
}

const cartonRules: Record<AmazonNetwork, string> = {
  fba: "FBA cartons: mixed SKUs are allowed; at most 63.5 cm (25 in) on each side and 22.68 kg (50 lb), unless one unit is larger.",
  awd_us:
    "AWD US cartons: one SKU per carton, at most 150 units, every carton of a SKU packed the same way; at most 63.5 cm (25 in) on each side and 22.68 kg (50 lb)."
}

// Rules the cartons and units follow because of where they go: for a PO to Amazon, each network's carton rules and
// Amazon's unit labeling. Amazon checks them on arrival and charges for, or refuses, what doesn't comply; the buyer's own
// locations have none of their own.
export function destinationRequirements(order: Pick<OrderInput, "destination" | "items">): string[] {
  const networks = orderNetworks(order)
  if (!networks.length) {
    return []
  }
  return [
    ...networks.map((network) => cartonRules[network]),
    ...(networks.length > 1
      ? [`Pack ${networks.map((network) => amazonNetworkNames[network]).join(" and ")} products in separate cartons.`]
      : []),
    "Label every unit with its FNSKU barcode, covering any other barcode.",
    "Polybags need a suffocation warning when the opening is 5 in (12.7 cm) or wider.",
    "Keep multi-packs together as one unit with a single label."
  ]
}

// Where a PO or shipment goes, as documents name it, such as "Amazon FBA and AWD US".
export function destinationName(order: Pick<OrderInput, "destination" | "items">) {
  const networks = orderNetworks(order)
  if (networks.length) {
    return `Amazon ${networks.map((network) => amazonNetworkNames[network]).join(" and ")}`
  }
  return "Buyer's location"
}

// The preparation every line of a PO shares, stated once for the whole PO instead of on each line.
export function sharedPrep(order: Pick<OrderInput, "items">) {
  const [first, ...rest] = order.items
  return first && rest.every((item) => item.prepCategory === first.prepCategory) ? first.prepCategory : null
}

// What the supplier does for one line: which Amazon network it's packed for, its preparation (unless the whole PO
// shares it), multi-pack assembly, Amazon label and the product's own instructions, one per line.
export function itemRequirements(
  item: OrderItem,
  destination: OrderInput["destination"],
  shared: OrderItem["prepCategory"] | null = null
): string[] {
  const amazon = destination === "amazon"
  return [
    ...(amazon ? [`Pack for ${amazonNetworkNames[item.amazonNetwork]}`] : []),
    ...(item.prepCategory === shared ? [] : [prepInstructions[item.prepCategory]]),
    ...(item.piecesPerSet > 1 ? [`Pack ${item.piecesPerSet} pieces together as one unit`] : []),
    ...(amazon && item.fnsku ? [`Label with FNSKU ${item.fnsku}`] : []),
    ...(item.suffocationWarning ? ["Put a suffocation warning label on each polybag"] : []),
    ...item.instructions
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
  ]
}
