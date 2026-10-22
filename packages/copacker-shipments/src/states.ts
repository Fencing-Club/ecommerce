// Where a shipment is in its life, as groups of its states, and what can still change in each. Pages, the server and
// transport read the same rules, so a page offers only what the server allows.
export const shipmentStates = [
  "packing",
  "packed",
  "approval",
  "queued",
  "creating",
  "waiting_labels",
  "ready",
  // The supplier shipped the goods, to the forwarder on the way or straight to the destination.
  "shipped",
  // A forwarder on the way shipped them on, with its freight cost, carrier and tracking.
  "forwarded",
  "received",
  "correction",
  "needs_attention",
  "cancelled"
] as const
export type ShipmentState = (typeof shipmentStates)[number]

// The supplier is packing the shipment, or correcting finished packing.
export const openPackingStates: readonly ShipmentState[] = ["packing", "correction"]
// Copacker is asking Amazon to create the shipment.
export const amazonRequestStates: readonly ShipmentState[] = ["queued", "creating"]
// The supplier packet is released from "ready" on; "received" means the goods arrived where the PO sent them.
export const releasedStates: readonly ShipmentState[] = ["ready", "shipped", "forwarded", "received"]
// The goods have left the supplier.
export const shippedStates: readonly ShipmentState[] = ["shipped", "forwarded", "received"]
// From "packed" on, the shipment's packing is finished, so its packing list prints; a correction reopens it.
export const packedStates: readonly ShipmentState[] = [
  "packed",
  "approval",
  "queued",
  "creating",
  "waiting_labels",
  "ready",
  "shipped",
  "forwarded",
  "received",
  "needs_attention"
]
// Once the supplier ships, a shipment's cartons and documents can't change any more.
export const finishedStates: readonly ShipmentState[] = ["shipped", "forwarded", "received", "cancelled"]

type ShipmentProgress = { status: ShipmentState; operation: string; amazonOrderId: string | null }

// Whether a shipment's packing can still change: it's being packed or corrected, and no Amazon request has started.
export function canEditPacking({ status, operation, amazonOrderId }: ShipmentProgress) {
  return openPackingStates.includes(status) && operation === "none" && !amazonOrderId
}

// Whether finished packing for Amazon can go back to packing: until the buyer starts the Amazon shipment.
export function canReopenPacking({ status, operation, amazonOrderId }: ShipmentProgress) {
  return status === "packed" && operation === "none" && !amazonOrderId
}
