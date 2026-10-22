import type { PrepCategory } from "@repo/copacker-shipments"

// Preparation choices offered on purchase orders and product defaults, in order, each with its label's key in the
// "shipments" messages.
export const prepLabelKeys = {
  POLYBAGGING: "prep.polybag",
  NO_PREP: "prep.noPrep",
  BUBBLEWRAPPING: "prep.bubbleWrap",
  TAPING: "prep.taping"
} as const satisfies Partial<Record<PrepCategory, string>>

export type PrepLabelKey = (typeof prepLabelKeys)[keyof typeof prepLabelKeys]

// The choices for a select, labelled by the "shipments" translator: prepOptions(useTranslations("shipments")).
export function prepOptions(t: (key: PrepLabelKey) => string) {
  return Object.entries(prepLabelKeys).flatMap(([value, key]) =>
    isPrepChoice(value) ? [{ value, label: t(key) }] : []
  )
}

function isPrepChoice(value: string): value is keyof typeof prepLabelKeys {
  return value in prepLabelKeys
}
