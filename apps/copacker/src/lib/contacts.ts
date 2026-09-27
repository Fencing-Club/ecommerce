// Which saved addresses a workspace keeps. Buyers and forwarders save where goods arrive; suppliers save where cartons
// are collected. A buyer's addresses for its forwarders are kept with each forwarder, on the Forwarders page.
export const contactKinds = ["delivery", "forwarder", "pickup"] as const
export type ContactKind = (typeof contactKinds)[number]

export function contactKindsFor(orgKind: "buyer" | "supplier" | "forwarder"): readonly ContactKind[] {
  return orgKind === "supplier" ? ["pickup"] : ["delivery"]
}

export const contactKindLabels: Record<ContactKind, string> = {
  delivery: "Delivery address",
  forwarder: "Freight forwarder",
  pickup: "Pickup address"
}
