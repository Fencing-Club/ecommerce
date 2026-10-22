import type { documents } from "@/db/schema"

// Amazon's and the carrier's labels reach the supplier and forwarder only once the buyer releases the shipment.
export const releasedLabelKinds: ReadonlyArray<(typeof documents.$inferSelect)["kind"]> = [
  "carton_label",
  "pallet_label",
  "shipping_label"
]
