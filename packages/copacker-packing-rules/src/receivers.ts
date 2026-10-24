import { amazonSources, type CartonPolicy, cartonPolicies } from "./carton-policies"
import { type PalletPolicy, palletPolicies } from "./pallet-policies"

// Where a purchase order line's goods end up: a receiver. Each PO line names one, and the receiver brings the rules its
// cartons and pallets follow. A new receiver, such as GWD, ShipBob or Shopify's fulfillment network, is a new entry
// here; receivers of one group can share a PO, as FBA and AWD do. A freight forwarder is never a receiver: it is a stop
// on the way, which a PO names in `via`.
export const receiverIds = ["fba", "awd_us", "warehouse"] as const
export type ReceiverId = (typeof receiverIds)[number]

// The receivers that can share a PO: Amazon's networks, or one of the buyer's own locations.
export const receiverGroups = ["amazon", "warehouse"] as const
export type ReceiverGroup = (typeof receiverGroups)[number]

export type Receiver = {
  // As messages name it, such as "FBA".
  name: string
  group: ReceiverGroup
  // The rules its cartons and pallets follow. A receiver without them takes any carton or pallet.
  cartonPolicy?: CartonPolicy
  palletPolicy?: PalletPolicy
  // The receiver's own pages: where it states its requirements, and what it is, for someone choosing it.
  documentation?: string
  website?: string
}

// In order from the most lenient rules to the strictest: a carton or pallet that wrongly mixes receivers follows the
// strictest of their rules.
export const receivers = {
  fba: {
    name: "FBA",
    group: "amazon",
    cartonPolicy: cartonPolicies.fba,
    palletPolicy: palletPolicies.fba,
    documentation: amazonSources.fbaShipping,
    website: "https://sell.amazon.com/fulfillment-by-amazon"
  },
  awd_us: {
    name: "AWD US",
    group: "amazon",
    cartonPolicy: cartonPolicies.awd_us,
    palletPolicy: palletPolicies.awd_us,
    documentation: amazonSources.awdShipping,
    website: "https://sell.amazon.com/programs/warehousing"
  },
  warehouse: { name: "Warehouse", group: "warehouse" }
} as const satisfies Record<ReceiverId, Receiver>

export const isReceiverId = (value: unknown): value is ReceiverId =>
  typeof value === "string" && (receiverIds as readonly string[]).includes(value)

// The receivers of a group, in registry order.
export const groupReceivers = (group: ReceiverGroup) => receiverIds.filter((id) => receivers[id].group === group)

// Amazon's networks: the receivers Amazon books inbound shipments for.
export const amazonNetworks = ["fba", "awd_us"] as const satisfies readonly ReceiverId[]
export type AmazonNetwork = (typeof amazonNetworks)[number]
export const isAmazonNetwork = (receiver: ReceiverId | null | undefined): receiver is AmazonNetwork =>
  (amazonNetworks as readonly (ReceiverId | null | undefined)[]).includes(receiver)

// Where a PO's goods go, as a group: its lines' receivers all share one, so the first line's says.
export function orderDestination(order: { items: readonly { receiver: ReceiverId }[] }): ReceiverGroup {
  const first = order.items[0]
  return first ? receivers[first.receiver].group : "warehouse"
}

// The receiver a new line of a PO to the given group goes to: the product's preferred one when it is in the group, such as
// AWD US for a product kept as bulk stock, otherwise the group's first.
export function receiverFor(group: ReceiverGroup, preferred?: ReceiverId | null): ReceiverId {
  if (preferred && receivers[preferred].group === group) {
    return preferred
  }
  const [first] = groupReceivers(group)
  if (!first) {
    throw new Error(`No receiver in ${group}`)
  }
  return first
}
