import type { adjustmentTypes, commonPaymentTerms } from "@repo/copacker-orders"

// Payment terms and cost adjustments are kept on the PO by their English names. These are the known ones' message keys
// under "orders", so they show in the reader's language; any other name shows as typed.
export const paymentTermKeys = {
  "Net 7": "paymentTerms.net7",
  "Net 15": "paymentTerms.net15",
  "Net 30": "paymentTerms.net30",
  "Net 45": "paymentTerms.net45",
  "Net 60": "paymentTerms.net60",
  "Cash on delivery": "paymentTerms.cashOnDelivery",
  "Payment on receipt": "paymentTerms.paymentOnReceipt",
  "Payment in advance": "paymentTerms.paymentInAdvance"
} as const satisfies Record<(typeof commonPaymentTerms)[number], string>

export const adjustmentKeys = {
  "Shipping amount": "adjustments.shipping",
  "Customs duties": "adjustments.customsDuties",
  Discount: "adjustments.discount",
  "Foreign transaction fee": "adjustments.foreignTransactionFee",
  "Freight fee": "adjustments.freightFee",
  Insurance: "adjustments.insurance",
  Labeling: "adjustments.labeling",
  Packing: "adjustments.packing",
  "Rush fee": "adjustments.rushFee",
  Surcharge: "adjustments.surcharge",
  Tariffs: "adjustments.tariffs",
  Other: "adjustments.other"
} as const satisfies Record<(typeof adjustmentTypes)[number], string>

// A stored name in the reader's language when it's one of the known ones, such as a payment term, or as typed.
export function knownName<Key extends string>(
  keys: Record<string, Key>,
  name: string,
  t: (key: Key) => string
): string {
  return Object.hasOwn(keys, name) ? t(keys[name]!) : name
}
