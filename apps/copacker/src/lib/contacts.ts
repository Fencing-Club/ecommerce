// Which saved addresses a workspace keeps. Buyers and forwarders save where goods arrive; suppliers save where cartons
// are collected. A buyer's addresses for its forwarders are kept with each forwarder, on the Partners page.
export const contactKinds = ["delivery", "forwarder", "pickup"] as const
export type ContactKind = (typeof contactKinds)[number]

export function contactKindsFor(orgKind: "buyer" | "supplier" | "forwarder"): readonly ContactKind[] {
  return orgKind === "supplier" ? ["pickup"] : ["delivery"]
}

// Each kind's label, as its key in the "partners" messages: useTranslations("partners")(contactKindLabelKeys[kind]).
export const contactKindLabelKeys = {
  delivery: "contactKinds.delivery",
  forwarder: "contactKinds.forwarder",
  pickup: "contactKinds.pickup"
} as const satisfies Record<ContactKind, string>
