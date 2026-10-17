import {
  type AmazonNetwork,
  amazonNetworkNames,
  amazonNetworks,
  type OrderInput,
  type OrderItem,
  type PrepCategory
} from "./index"
import { packingTasks, type ProductTask } from "./packing-requirements"

// One thing the supplier must do, as a code and the values it names, so the app can say it in each reader's language
// and documents in English (requirementText).
export type Requirement =
  | { code: "productTask"; task: ProductTask; countryCode: string }
  | { code: "prep"; prep: PrepCategory }
  | { code: "cartons"; network: AmazonNetwork }
  | { code: "separateCartons"; networks: AmazonNetwork[] }
  | { code: "unitLabels" | "suffocationWarnings" | "multiPacks" | "suffocationLabel" }
  | { code: "packFor"; network: AmazonNetwork }
  | { code: "bundle"; units: number }
  | { code: "fnskuLabel"; fnsku: string }
  // The product's complete Markdown instructions, preserving paragraphs and nested lists.
  | { code: "instruction"; text: string }

// How the supplier prepares each unit, as agreed on the PO line.
const prepInstructions: Record<PrepCategory, string> = {
  POLYBAGGING: "Seal each unit in a clear polybag",
  NO_PREP: "No unit preparation",
  BUBBLEWRAPPING: "Bubble-wrap each unit",
  TAPING: "Tape each unit closed",
  BLACK_SHRINKWRAPPING: "Shrink-wrap each unit in black film",
  HANG_GARMENT: "Put each garment on a hanger",
  LABELING: "Label each unit"
}

const cartonRules: Record<AmazonNetwork, string> = {
  fba: "FBA cartons: mixed SKUs are allowed; at most 63.5 cm (25 in) on each side and 22.68 kg (50 lb), unless one unit is larger.",
  awd_us:
    "AWD US cartons: one SKU per carton, at most 150 units, every carton of a SKU packed the same way; at most 63.5 cm (25 in) on each side and 22.68 kg (50 lb)."
}

const networkList = (networks: AmazonNetwork[]) => networks.map((network) => amazonNetworkNames[network]).join(" and ")

// A requirement in English, as documents print it.
export function requirementText(requirement: Requirement): string {
  switch (requirement.code) {
    case "productTask": {
      const labels: Record<ProductTask, string> = {
        polybag: "Place each pack in a polybag",
        sealedPolybag: "Place each pack in a polybag and seal it closed",
        sku: "Apply the SKU label to each pack",
        fnsku: "Apply the FNSKU label to each pack",
        suffocation: "Apply a suffocation warning to each polybag",
        choking: "Apply a choking-hazard label to each pack",
        countryOfOrigin: `Apply a country-of-origin label: ${requirement.countryCode}`
      }
      return labels[requirement.task]
    }
    case "prep":
      return prepInstructions[requirement.prep]
    case "cartons":
      return cartonRules[requirement.network]
    case "separateCartons":
      return `Pack ${networkList(requirement.networks)} products in separate cartons.`
    case "unitLabels":
      return "Label every unit with its FNSKU barcode, covering any other barcode."
    case "suffocationWarnings":
      return "Polybags need a suffocation warning when the opening is 5 in (12.7 cm) or wider."
    case "multiPacks":
      return "Keep each multi-pack together, with one label on the pack."
    case "packFor":
      return `Pack for ${amazonNetworkNames[requirement.network]}`
    case "bundle":
      return `Bundle ${requirement.units} units into one pack`
    case "fnskuLabel":
      return `Label with FNSKU ${requirement.fnsku}`
    case "suffocationLabel":
      return "Put a suffocation warning label on each polybag"
    case "instruction":
      return requirement.text
  }
}

// Whether a requirement is about the cartons rather than the units in them.
export const isCartonRule = (requirement: Requirement) =>
  requirement.code === "cartons" || requirement.code === "separateCartons"

// The Amazon networks the given lines go to, in network order, or none for a PO that doesn't go to Amazon.
export function orderNetworks(order: Pick<OrderInput, "destination" | "items">): AmazonNetwork[] {
  if (order.destination !== "amazon") {
    return []
  }
  const used = new Set(order.items.map((item) => item.amazonNetwork))
  return amazonNetworks.filter((network) => used.has(network))
}

// Rules the cartons and units follow because of where they go: for a PO to Amazon, each network's carton rules and
// Amazon's unit labeling. Amazon checks them on arrival and charges for, or refuses, what doesn't comply; the buyer's own
// locations have none of their own.
export function destinationRequirements(order: Pick<OrderInput, "destination" | "items">): Requirement[] {
  const networks = orderNetworks(order)
  if (!networks.length) {
    return []
  }
  return [
    ...networks.map((network) => ({ code: "cartons" as const, network })),
    ...(networks.length > 1 ? [{ code: "separateCartons" as const, networks }] : []),
    ...(order.items.some((item) => item.packingRequirements)
      ? []
      : [{ code: "unitLabels" as const }, { code: "suffocationWarnings" as const }, { code: "multiPacks" as const }])
  ]
}

// Where a PO or shipment goes, as documents name it, such as "Amazon FBA and AWD US".
export function destinationName(order: Pick<OrderInput, "destination" | "items">) {
  const networks = orderNetworks(order)
  if (networks.length) {
    return `Amazon ${networkList(networks)}`
  }
  return "Buyer's location"
}

// The preparation every line of a PO shares, stated once for the whole PO instead of on each line.
export function sharedPrep(order: Pick<OrderInput, "items">) {
  if (order.items.some((item) => item.packingRequirements)) {
    return null
  }
  const [first, ...rest] = order.items
  return first && rest.every((item) => item.prepCategory === first.prepCategory) ? first.prepCategory : null
}

// What the supplier does for one line: which Amazon network it's packed for, its preparation (unless the whole PO
// shares it), multi-pack assembly, Amazon label and the product's own instructions.
export function itemRequirements(
  item: OrderItem,
  destination: OrderInput["destination"],
  shared: OrderItem["prepCategory"] | null = null
): Requirement[] {
  const amazon = destination === "amazon"
  if (item.packingRequirements) {
    return [
      ...(amazon ? [{ code: "packFor" as const, network: item.amazonNetwork }] : []),
      ...(item.piecesPerSet > 1 ? [{ code: "bundle" as const, units: item.piecesPerSet }] : []),
      ...packingTasks(item.packingRequirements).map((task) => ({
        code: "productTask" as const,
        task,
        countryCode: item.packingRequirements!.countryCode
      })),
      ...(item.packingRequirements.instructions.trim()
        ? [{ code: "instruction" as const, text: item.packingRequirements.instructions }]
        : [])
    ]
  }
  return [
    ...(amazon ? [{ code: "packFor" as const, network: item.amazonNetwork }] : []),
    ...(item.prepCategory === shared ? [] : [{ code: "prep" as const, prep: item.prepCategory }]),
    ...(item.piecesPerSet > 1 ? [{ code: "bundle" as const, units: item.piecesPerSet }] : []),
    ...(amazon && item.fnsku ? [{ code: "fnskuLabel" as const, fnsku: item.fnsku }] : []),
    ...(item.suffocationWarning ? [{ code: "suffocationLabel" as const }] : []),
    ...(item.instructions.trim() ? [{ code: "instruction" as const, text: item.instructions }] : [])
  ]
}
