// Which saved addresses a workspace keeps. Buyers save where goods arrive and their freight forwarders; suppliers save
// where cartons are collected, so pickup addresses come from the supplier's own workspace.
export const contactKinds = ["delivery", "forwarder", "pickup"] as const
export type ContactKind = (typeof contactKinds)[number]

export function contactKindsFor(orgKind: "buyer" | "supplier"): readonly ContactKind[] {
  return orgKind === "supplier" ? ["pickup"] : ["delivery", "forwarder"]
}

export const contactKindLabels: Record<ContactKind, string> = {
  delivery: "Delivery address",
  forwarder: "Freight forwarder",
  pickup: "Pickup address"
}
