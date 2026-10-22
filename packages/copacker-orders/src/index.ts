import { inventoryItemIdSchema, variantIdSchema, variantName } from "@repo/copacker-marketplaces/shopify"
import {
  amazonNetworks,
  groupReceivers,
  orderDestination,
  type ReceiverGroup,
  receiverGroups,
  type ReceiverId,
  receiverIds,
  receivers
} from "@repo/copacker-packing-rules"
import { z } from "zod"
import { packingRequirementsSchema } from "./packing-requirements"

// Amazon inbound preparation categories.
export const prepCategories = [
  "POLYBAGGING",
  "NO_PREP",
  "BUBBLEWRAPPING",
  "TAPING",
  "LABELING",
  "BLACK_SHRINKWRAPPING",
  "HANG_GARMENT"
] as const
export type PrepCategory = (typeof prepCategories)[number]
// Where a PO ships, as a group of receivers: Amazon, or one of the buyer's own locations (a saved delivery address). Each
// line names its receiver (see @repo/copacker-packing-rules' receivers), and a PO's lines share one group, which
// `orderDestination` reads. A PO to Amazon can send lines to FBA and AWD, so it can become several Amazon shipments. A
// freight forwarder is never where a PO ends, only a stop on the way.
export const destinationSchema = z.enum(receiverGroups)
export type Destination = ReceiverGroup
export const addressSchema = z.object({
  name: z.string().trim().min(1).max(50),
  addressLine1: z.string().trim().min(1).max(180),
  addressLine2: z.string().trim().max(60).default(""),
  city: z.string().trim().min(1).max(50),
  stateOrRegion: z.string().trim().min(1).max(50),
  postalCode: z.string().trim().min(1).max(20),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Choose a country"),
  phoneNumber: z
    .string()
    .trim()
    .pipe(z.union([z.literal(""), z.string().min(6, "Enter a phone number").max(30)]))
    .default(""),
  email: z
    .string()
    .trim()
    .pipe(z.union([z.literal(""), z.email().max(254)]))
    .default("")
})
export type Address = z.infer<typeof addressSchema>
// How a supplier prices a product: per piece, per sellable pack or per case.
export const priceBases = ["piece", "sellable_pack", "case"] as const
export type PriceBasis = (typeof priceBases)[number]
// How a PO line's product matched the supplier's catalog, from no catalog to a matched price.
export const supplierCatalogStatuses = [
  "supplier_catalog_unavailable",
  "supplier_sku_missing",
  "not_in_supplier_catalog",
  "ambiguous_supplier_sku",
  "archived_supplier_product",
  "currency_review",
  "price_missing",
  "price_conversion_review",
  "matched"
] as const
export type SupplierCatalogStatus = (typeof supplierCatalogStatuses)[number]
const supplierCatalogSnapshot = z.object({
  productId: z.uuid(),
  revision: z.number().int().positive(),
  supplierSku: z.string().min(1),
  title: z.string().optional(),
  notes: z.string().nullable().optional(),
  currency: z.string(),
  priceMinor: z.number().int().nonnegative().nullable(),
  priceBasis: z.enum(priceBases),
  piecesPerSellablePack: z.number().int().positive(),
  sellablePacksPerCase: z.number().int().positive().nullable()
})
export const itemSchema = z
  .object({
    id: z.uuid(),
    variantId: variantIdSchema,
    inventoryItemId: inventoryItemIdSchema,
    name: z.string().trim().min(1).max(240),
    variant: z.string().max(240),
    buyerSku: z.string().trim().min(1).max(255),
    supplierSku: z.string().trim().max(255).default(""),
    // Shopify bundle components are physical supplier items; the sellable bundle retains its own buyer SKU.
    components: z
      .array(
        z.object({
          variantId: variantIdSchema,
          buyerSku: z.string().trim().max(255).nullable(),
          supplierSku: z.string().trim().max(255).nullable(),
          quantity: z.number().int().positive().safe(),
          supplierCatalog: supplierCatalogSnapshot.optional()
        })
      )
      .max(25)
      .optional(),
    supplierCatalogStatus: z.enum(supplierCatalogStatuses).optional(),
    supplierCatalog: supplierCatalogSnapshot.optional(),
    asin: z
      .string()
      .regex(/^[A-Z0-9]{10}$/)
      .or(z.literal("")),
    fnsku: z
      .string()
      .regex(/^[A-Z0-9]{10}$/)
      .or(z.literal("")),
    pieces: z.number().int().min(1).max(1000000),
    piecesPerSet: z.number().int().min(1).max(1000),
    unitPrice: z.number().int().min(0).max(100000000),
    // Supplier services for this product, such as assembling a multipack. Amounts are rates in minor units.
    supplierCharges: z
      .array(
        z.object({
          description: z.string().trim().min(1).max(255),
          amount: z.number().int().min(0).max(100000000),
          basis: z.enum(["piece", "pack", "flat"])
        })
      )
      .max(20)
      .optional(),
    instructions: z.string().max(4000).default(""),
    packingRequirements: packingRequirementsSchema.optional(),
    prepCategory: z.enum(prepCategories).default("POLYBAGGING"),
    // Each unit's polybag gets a suffocation warning label, printed from the PO's label sheets.
    suffocationWarning: z.boolean().default(false),
    // Whether each unit gets its SKU label. Left out, the product's label setting decides; POs to Amazon always label.
    skuLabel: z.boolean().optional(),
    // Where this line's cartons go, which decides how they're packed: an Amazon network, or the buyer's location.
    receiver: z.enum(receiverIds)
  })
  .refine((i) => i.pieces % i.piecesPerSet === 0, "Units must be divisible by units per pack")
export type OrderItem = z.infer<typeof itemSchema>
// Payment terms a PO can have, as Shopify offers them. None is an empty string.
export const commonPaymentTerms = [
  "Net 7",
  "Net 15",
  "Net 30",
  "Net 45",
  "Net 60",
  "Cash on delivery",
  "Payment on receipt",
  "Payment in advance"
] as const
// The kinds of cost a PO's summary can add or take off, Shopify's plus packing and labeling by the supplier. Each is
// kept as the adjustment's description; a discount's amount is negative.
export const adjustmentTypes = [
  "Shipping amount",
  "Customs duties",
  "Discount",
  "Foreign transaction fee",
  "Freight fee",
  "Insurance",
  "Labeling",
  "Packing",
  "Rush fee",
  "Surcharge",
  "Tariffs",
  "Other"
] as const
// The currencies a PO, and a supplier's prices, can be in.
export const orderCurrencies = ["USD", "CNY", "EUR", "GBP", "CAD", "AUD"] as const
export type OrderCurrency = (typeof orderCurrencies)[number]
export const orderInputSchema = z
  .object({
    supplierId: z.uuid(),
    reference: z.string().trim().min(1).max(80),
    // For a PO to one of the buyer's locations, its delivery address.
    deliveryId: z.uuid().optional(),
    // A freight forwarder the goods stop at on the way to Amazon or the buyer's location, such as a consolidator in
    // China: the forwarder and the address the supplier ships to.
    via: z.object({ forwarderId: z.uuid(), addressId: z.uuid() }).optional(),
    currency: z.enum(orderCurrencies),
    // When the buyer needs the goods, as the purchase order's "Required by".
    dueDate: z.iso.date().optional(),
    // When the supplier expects the goods ready to ship, which it sets once it has the PO.
    readyDate: z.iso.date().optional(),
    // How and when the supplier is paid, such as "Net 30" or "30% deposit, 70% before shipment".
    paymentTerms: z.string().trim().max(200).default(""),
    notes: z.string().max(8000).default(""),
    adjustments: z
      .array(
        z.object({
          description: z.string().trim().min(1).max(255),
          amount: z.number().int().min(-100000000).max(100000000)
        })
      )
      .max(50)
      .optional(),
    items: z.array(itemSchema).min(1).max(150)
  })
  .superRefine((order, ctx) => {
    const total =
      order.items.reduce((sum, item) => sum + itemTotal(item), 0) +
      (order.adjustments ?? []).reduce((sum, adjustment) => sum + adjustment.amount, 0)
    if (!Number.isSafeInteger(total) || total < 0) {
      ctx.addIssue({
        code: "custom",
        message: "Purchase order total must be a nonnegative safe integer",
        path: ["adjustments"]
      })
    }
    if (new Set(order.items.map((item) => receivers[item.receiver].group)).size > 1) {
      ctx.addIssue({
        code: "custom",
        message: "Send every product to Amazon, or every one to your location",
        path: ["items"]
      })
    }
    if (orderDestination(order) === "warehouse" && !order.deliveryId) {
      ctx.addIssue({ code: "custom", message: "Choose a delivery address", path: ["deliveryId"] })
    }
    if (
      new Set(order.items.map((i) => i.buyerSku)).size !== order.items.length ||
      new Set(order.items.map((i) => i.id)).size !== order.items.length
    ) {
      ctx.addIssue({ code: "custom", message: "Each product must appear once", path: ["items"] })
    }
  })
export type OrderInput = z.infer<typeof orderInputSchema>
// A supplier's SKU and unit price for a PO line, as it sends them with a packing. One that differs from the PO waits for
// the buyer's approval.
export const itemChangeSchema = z.object({
  itemId: z.uuid(),
  supplierSku: z.string().trim().max(255),
  unitPrice: z.number().int().min(0).max(100000000)
})
type ItemChanges = { changes: ReadonlyArray<z.infer<typeof itemChangeSchema>> }

export function commercialChanges(order: OrderInput, packing: ItemChanges) {
  return packing.changes.filter((change) => {
    const item = order.items.find((i) => i.id === change.itemId)
    return !item || item.unitPrice !== change.unitPrice || item.supplierSku !== change.supplierSku
  })
}

export function approveChanges(order: OrderInput, packing: ItemChanges) {
  return orderInputSchema.parse({
    ...order,
    items: order.items.map((item) => {
      const change = packing.changes.find((c) => c.itemId === item.id)
      if (!change) {
        return item
      }
      if (change.supplierSku !== item.supplierSku) {
        const { supplierCatalog: _catalog, supplierCatalogStatus: _status, ...rest } = item
        return { ...rest, supplierSku: change.supplierSku, unitPrice: change.unitPrice }
      }
      return { ...item, supplierSku: change.supplierSku, unitPrice: change.unitPrice }
    })
  })
}

// Money in minor units. Hide cents only for whole amounts; keep the currency's precision otherwise.
export function money(amount: number, currency = "USD", locale = "en-US") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: amount % 100 === 0 ? 0 : undefined
  }).format(amount / 100)
}
export function supplierChargeTotal(
  item: Pick<OrderItem, "pieces" | "piecesPerSet">,
  charge: NonNullable<OrderItem["supplierCharges"]>[number]
) {
  const counts = { flat: 1, pack: item.pieces / item.piecesPerSet, piece: item.pieces }
  return charge.amount * counts[charge.basis]
}

// A product's total includes services assigned to it, so those costs follow it between shipment groups.
type PricedItem = Pick<OrderItem, "pieces" | "piecesPerSet" | "unitPrice" | "supplierCharges">
type OrderCosts = { items: readonly PricedItem[]; adjustments?: OrderInput["adjustments"] }

export function itemTotal(item: PricedItem) {
  return (
    item.pieces * item.unitPrice +
    (item.supplierCharges ?? []).reduce((sum, charge) => sum + supplierChargeTotal(item, charge), 0)
  )
}

// Summary rows and PDFs share the same charge calculation. Product prices remain separate from service rates.
export function orderCharges(order: OrderCosts) {
  const amounts = new Map<string, number>()
  for (const item of order.items) {
    for (const charge of item.supplierCharges ?? []) {
      amounts.set(charge.description, (amounts.get(charge.description) ?? 0) + supplierChargeTotal(item, charge))
    }
  }
  for (const charge of order.adjustments ?? []) {
    amounts.set(charge.description, (amounts.get(charge.description) ?? 0) + charge.amount)
  }
  return [...amounts].map(([description, amount]) => ({ description, amount }))
}

// What a PO's products cost at their unit prices, before supplier services and adjustments.
export function orderSubtotal(items: readonly Pick<OrderItem, "pieces" | "unitPrice">[]) {
  return items.reduce((sum, item) => sum + item.pieces * item.unitPrice, 0)
}

// How many pieces a PO's lines order in all.
export function orderUnits(items: readonly Pick<OrderItem, "pieces">[]) {
  return items.reduce((sum, item) => sum + item.pieces, 0)
}

// A PO's lines as the shipments they become: one for each receiver they go to, Amazon's networks in amazonNetworks'
// order, then the buyer's location. Each keeps its lines in the PO's order.
export function shipmentGroups<Line extends { receiver: ReceiverId }>(lines: readonly Line[]) {
  return [...amazonNetworks, ...groupReceivers("warehouse")].flatMap((receiver) => {
    const grouped = lines.filter((line) => line.receiver === receiver)
    return grouped.length ? [{ receiver, lines: grouped }] : []
  })
}

// A product as a PO line names it: with its variant, such as "Canvas tote bag / Natural", or alone when it has only one.
export function lineName(name: string, variant: string | null | undefined) {
  return [name, variantName(variant)].filter(Boolean).join(" / ")
}

export function orderTotal(order: OrderCosts) {
  return (
    order.items.reduce((sum, item) => sum + itemTotal(item), 0) +
    (order.adjustments ?? []).reduce((sum, adjustment) => sum + adjustment.amount, 0)
  )
}
