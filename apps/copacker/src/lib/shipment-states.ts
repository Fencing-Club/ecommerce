import type { documents, ShipmentState } from "@/db/schema"

// Where a shipment is in its life, as groups of its states, and what can still change in each. Pages and the server
// read the same rules, so a page offers only what the server allows.

// The supplier packet is released from "ready" on; "received" means the goods arrived where the PO sent them.
export const releasedStates: readonly ShipmentState[] = ["ready", "shipped", "forwarded", "received"]
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
// Amazon's and the carrier's labels reach the supplier and forwarder only once the buyer releases the shipment.
export const releasedLabelKinds: ReadonlyArray<(typeof documents.$inferSelect)["kind"]> = [
  "carton_label",
  "pallet_label",
  "shipping_label"
]

type ShipmentProgress = { status: ShipmentState; operation: string; amazonOrderId: string | null }

// Whether a shipment's packing can still change: it's being packed or corrected, and no Amazon request has started.
export function canEditPacking({ status, operation, amazonOrderId }: ShipmentProgress) {
  return (status === "packing" || status === "correction") && operation === "none" && !amazonOrderId
}

// Whether finished packing for Amazon can go back to packing: until the buyer starts the Amazon shipment.
export function canReopenPacking({ status, operation, amazonOrderId }: ShipmentProgress) {
  return status === "packed" && operation === "none" && !amazonOrderId
}
