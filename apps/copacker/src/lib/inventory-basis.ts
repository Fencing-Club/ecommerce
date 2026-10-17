import { z } from "zod"
import { inventoryAmount, inventoryMicros } from "./inventory-money"
const reference = z.string().trim().min(1).max(200)
const quantity = z.number().int().min(1).max(1000000000)
const decimal = z
  .string()
  .regex(/^(0|[1-9]\d{0,11})(\.\d{1,6})?$/)
  .transform((value) => {
    const [whole, fraction] = value.split(".")
    const trimmed = fraction?.replace(/0+$/, "")
    return trimmed ? `${whole}.${trimmed}` : whole!
  })
const money = z.object({ amount: decimal, currency: z.string().regex(/^[A-Z]{3}$/) })
const product = { shopifyDomain: reference, variantId: reference }
const common = {
  sourceReference: reference,
  sourceLine: reference,
  occurredAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value).toISOString()),
  evidence: z.string().trim().min(1).max(2000),
  supersedes: z.uuid().optional()
}
const purchaseSource = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("manual"),
    costBasis: z.enum(["actual", "estimated"]).default("actual"),
    ...product,
    quantity,
    piecesPerUnit: z.number().int().min(1).max(1000),
    unitCost: money,
    supplierReference: reference,
    invoiceReference: reference,
    batchReference: reference
  }),
  z.strictObject({
    type: z.literal("purchase_order"),
    orderId: z.uuid(),
    revision: z.number().int().min(1),
    itemId: z.uuid(),
    invoiceReference: reference,
    batchReference: reference
  })
])
export const inventoryBasisSchemas = {
  purchase: z.strictObject({ ...common, kind: z.literal("purchase"), source: purchaseSource }),
  opening: z
    .strictObject({
      ...common,
      kind: z.literal("opening"),
      ...product,
      quantity: z.number().int().min(0).max(1000000000),
      piecesPerUnit: z.number().int().min(1).max(1000),
      location: reference,
      batchReference: reference.nullable(),
      valuation: z.discriminatedUnion("status", [
        z.strictObject({ status: z.literal("unknown") }),
        z.strictObject({ status: z.enum(["actual", "estimated"]), totalCost: money })
      ])
    })
    .refine(
      (value) =>
        value.quantity !== 0 || value.valuation.status === "unknown" || value.valuation.totalCost.amount === "0",
      "Zero quantity cannot carry a positive value"
    ),
  depletion: z.strictObject({
    ...common,
    kind: z.literal("depletion"),
    occurredAt: common.occurredAt.optional(),
    unitMappingId: z.uuid().optional(),
    ...product,
    quantity,
    piecesPerUnit: z.number().int().min(1).max(1000),
    location: reference,
    sale: z
      .discriminatedUnion("source", [
        z.strictObject({
          source: z.literal("shopify"),
          salesOrderId: z.uuid(),
          fulfillmentId: reference,
          fulfillmentLineId: reference
        }),
        z.strictObject({
          source: z.literal("amazon"),
          salesOrderId: z.uuid(),
          orderItemId: reference,
          shipmentReference: reference,
          shipmentItemId: reference.optional(),
          units: quantity
        })
      ])
      .optional()
  }),
  receipt: z.strictObject({
    ...common,
    kind: z.literal("receipt"),
    purchaseId: z.uuid(),
    quantity,
    location: reference,
    condition: z.enum(["sellable", "damaged", "uninspected"]),
    shipmentId: z.uuid().optional()
  })
}
export const inventoryBasisInput = z.union([
  inventoryBasisSchemas.purchase,
  inventoryBasisSchemas.opening,
  inventoryBasisSchemas.receipt,
  inventoryBasisSchemas.depletion
])
export type InventoryBasisInput = z.infer<typeof inventoryBasisInput>
export type InventoryBasisKind = InventoryBasisInput["kind"]
export type InventoryBasisData = {
  saleEvidence?: {
    salesOrderId: string
    fingerprint: string
    mappingId: string | null
    sourceLocationId: string | null
    units: number
  }
  input: InventoryBasisInput
  costBasis: "actual" | "estimated" | "missing"
  unitCost: z.infer<typeof money> | null
  totalCost: z.infer<typeof money> | null
  supplierReference: string | null
  batchReference: string | null
  // Snapshot all PO line charges/adjustments as evidence; do not silently include them in base purchase cost.
  purchaseOrder: { orderId: string; revision: number; item: unknown; adjustments: unknown } | null
}
export function multiplyInventoryCost(amount: string, quantity: number) {
  return inventoryAmount(inventoryMicros(amount) * BigInt(quantity))
}
