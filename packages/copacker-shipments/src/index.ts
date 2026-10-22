import type { AmazonPrep } from "@repo/copacker-marketplaces/amazon"
import { usMarketplaceId } from "@repo/copacker-marketplaces/amazon-marketplaces"
import {
  type AmazonNetwork,
  amazonNetworks,
  cartonReceivers,
  groupReceivers,
  isAmazonNetwork,
  orderDestination,
  receiverFor,
  type ReceiverGroup,
  receiverGroups,
  receiverIds,
  receivers,
  validatePacking
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
export {
  amazonNetworks,
  type AmazonNetwork,
  groupReceivers,
  isAmazonNetwork,
  orderDestination,
  receiverFor,
  receiverIds,
  receivers
}
export type { ReceiverId } from "@repo/copacker-packing-rules"
export const amazonNetworkNames: Record<AmazonNetwork, string> = {
  fba: receivers.fba.name,
  awd_us: receivers.awd_us.name
}
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
// Amazon needs a contact phone to schedule pickup, so a shipment origin cannot omit it.
export const originSchema = addressSchema.extend({
  phoneNumber: z.string().trim().min(6, "Add a pickup phone number. Amazon needs it to schedule pickup").max(30)
})
const supplierCatalogSnapshot = z.object({
  productId: z.uuid(),
  revision: z.number().int().positive(),
  supplierSku: z.string().min(1),
  title: z.string().optional(),
  notes: z.string().nullable().optional(),
  currency: z.string(),
  priceMinor: z.number().int().nonnegative().nullable(),
  priceBasis: z.enum(["piece", "sellable_pack", "case"]),
  piecesPerSellablePack: z.number().int().positive(),
  sellablePacksPerCase: z.number().int().positive().nullable()
})
export const itemSchema = z
  .object({
    id: z.uuid(),
    variantId: z.string().regex(/^gid:\/\/shopify\/ProductVariant\/\d+$/),
    inventoryItemId: z.string().regex(/^gid:\/\/shopify\/InventoryItem\/\d+$/),
    name: z.string().trim().min(1).max(240),
    variant: z.string().max(240),
    buyerSku: z.string().trim().min(1).max(255),
    supplierSku: z.string().trim().max(255).default(""),
    // Shopify bundle components are physical supplier items; the sellable bundle retains its own buyer SKU.
    components: z
      .array(
        z.object({
          variantId: z.string().regex(/^gid:\/\/shopify\/ProductVariant\/\d+$/),
          buyerSku: z.string().trim().max(255).nullable(),
          supplierSku: z.string().trim().max(255).nullable(),
          quantity: z.number().int().positive().safe(),
          supplierCatalog: supplierCatalogSnapshot.optional()
        })
      )
      .max(25)
      .optional(),
    supplierCatalogStatus: z
      .enum([
        "supplier_catalog_unavailable",
        "supplier_sku_missing",
        "not_in_supplier_catalog",
        "ambiguous_supplier_sku",
        "archived_supplier_product",
        "currency_review",
        "price_missing",
        "price_conversion_review",
        "matched"
      ])
      .optional(),
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
export const orderInputSchema = z
  .object({
    supplierId: z.uuid(),
    reference: z.string().trim().min(1).max(80),
    // For a PO to one of the buyer's locations, its delivery address.
    deliveryId: z.uuid().optional(),
    // A freight forwarder the goods stop at on the way to Amazon or the buyer's location, such as a consolidator in
    // China: the forwarder and the address the supplier ships to.
    via: z.object({ forwarderId: z.uuid(), addressId: z.uuid() }).optional(),
    currency: z.enum(["USD", "CNY", "EUR", "GBP", "CAD", "AUD"]),
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
export const cartonInputSchema = z.object({
  cartonId: z.string().trim().min(1).max(60),
  length: z.number().positive().max(500),
  width: z.number().positive().max(500),
  height: z.number().positive().max(500),
  weight: z.number().positive().max(1000),
  items: z
    .array(z.object({ itemId: z.uuid(), pieces: z.number().int().min(1).max(1000000) }))
    .min(1)
    .max(150)
})
// A pallet as the supplier loads it: its size and gross weight with the pallet itself, whether another pallet can stand
// on it, and the cartons on it by their IDs.
export const palletInputSchema = z.object({
  palletId: z.string().trim().min(1).max(60),
  length: z.number().positive().max(500),
  width: z.number().positive().max(500),
  height: z.number().positive().max(500),
  weight: z.number().positive().max(5000),
  stackable: z.boolean(),
  cartonIds: z.array(z.string().trim().min(1).max(60)).max(1000)
})
export const packingSchema = z.object({
  readyDate: z.iso.date(),
  origin: originSchema,
  cartons: z.array(cartonInputSchema).min(1).max(1000),
  // Whether the cartons ship on pallets, and the pallets when they do.
  palletized: z.boolean().optional(),
  pallets: z.array(palletInputSchema).max(1000).optional(),
  changes: z
    .array(
      z.object({
        itemId: z.uuid(),
        supplierSku: z.string().trim().max(255),
        unitPrice: z.number().int().min(0).max(100000000)
      })
    )
    .max(150)
    .default([])
})
// Drafts deliberately accept incomplete form values; packingSchema remains the submission boundary.
export const packingDraftSchema = z
  .object({
    readyDate: z.union([z.iso.date(), z.literal("")]).optional(),
    origin: z
      .partialRecord(
        z.enum([
          "name",
          "addressLine1",
          "addressLine2",
          "city",
          "stateOrRegion",
          "postalCode",
          "countryCode",
          "phoneNumber",
          "email"
        ]),
        z.string().max(254)
      )
      .optional(),
    cartons: z
      .array(
        z
          .object({
            cartonId: z.string().trim().max(80).optional(),
            length: z.number().min(0).max(500).optional(),
            width: z.number().min(0).max(500).optional(),
            height: z.number().min(0).max(500).optional(),
            weight: z.number().min(0).max(1000).optional(),
            items: z
              .array(
                z
                  .object({
                    itemId: z.union([z.uuid(), z.literal("")]).optional(),
                    pieces: z.number().int().min(0).max(1000000).optional()
                  })
                  .strict()
              )
              .max(150)
              .optional()
          })
          .strict()
      )
      .max(1000)
      .optional(),
    palletized: z.boolean().optional(),
    pallets: z
      .array(
        z
          .object({
            palletId: z.string().trim().max(80).optional(),
            length: z.number().min(0).max(500).optional(),
            width: z.number().min(0).max(500).optional(),
            height: z.number().min(0).max(500).optional(),
            weight: z.number().min(0).max(5000).optional(),
            stackable: z.boolean().optional(),
            cartonIds: z.array(z.string().trim().max(80)).max(1000).optional()
          })
          .strict()
      )
      .max(1000)
      .optional(),
    changes: z
      .array(
        z
          .object({
            itemId: z.uuid(),
            supplierSku: z.string().trim().max(255).optional(),
            unitPrice: z.number().int().min(0).max(100000000).optional()
          })
          .strict()
      )
      .max(150)
      .optional()
  })
  .strict()
export type PackingDraft = z.infer<typeof packingDraftSchema>
export type Packing = z.infer<typeof packingSchema>
export type Pallet = z.infer<typeof palletInputSchema>
// A pallet's place in the Amazon shipment its cartons travel in, as Amazon numbers its pallet labels: the shipment's
// pallets in packing order, from 1.
export type PalletLabel = { palletId: string; amazonShipmentId: string; number: number; count: number }

// Each pallet's Amazon shipment and its number there, from its cartons' Amazon labels. A pallet with no labelled
// cartons has none; validatePallets and the booking keep a pallet's cartons in one shipment.
export function palletLabels(
  pallets: ReadonlyArray<Pick<Pallet, "palletId" | "cartonIds">>,
  labels: ReadonlyArray<{ cartonId: string; amazonShipmentId: string }>
): PalletLabel[] {
  const placed = pallets.flatMap((pallet) => {
    const label = labels.find((label) =>
      pallet.cartonIds.some((id) => id.toLowerCase() === label.cartonId.toLowerCase())
    )
    return label ? [{ palletId: pallet.palletId, amazonShipmentId: label.amazonShipmentId }] : []
  })
  return placed.map((pallet) => {
    const shipment = placed.filter((other) => other.amazonShipmentId === pallet.amazonShipmentId)
    return { ...pallet, number: shipment.indexOf(pallet) + 1, count: shipment.length }
  })
}

// A packing's cartons for each Amazon network they go to, each a packing of its own, in network order. Every carton goes
// to one network and every pallet holds one network's cartons, as validatePacking requires; its invoice changes stay
// with the first, and each pallet with the cartons on it. Carton IDs match in any case, as validatePacking matches them.
export function splitByNetwork(order: Pick<OrderInput, "items">, packing: Packing) {
  const split = amazonNetworks.flatMap((network) => {
    const cartons = packing.cartons.filter((carton) => cartonReceivers(order, carton)[0] === network)
    const ids = new Set(cartons.map((carton) => carton.cartonId.toLowerCase()))
    const pallets = packing.pallets?.flatMap((pallet) => {
      const cartonIds = pallet.cartonIds.filter((id) => ids.has(id.toLowerCase()))
      return cartonIds.length ? [{ ...pallet, cartonIds }] : []
    })
    return cartons.length ? [{ network, packing: { ...packing, cartons, ...(pallets && { pallets }) } }] : []
  })
  return split.map((part, index) => (index ? { ...part, packing: { ...part.packing, changes: [] } } : part))
}

export function commercialChanges(order: OrderInput, packing: Packing) {
  return packing.changes.filter((change) => {
    const item = order.items.find((i) => i.id === change.itemId)
    return !item || item.unitPrice !== change.unitPrice || item.supplierSku !== change.supplierSku
  })
}

export function approveChanges(order: OrderInput, packing: Packing) {
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

// AWD's prep details for a SKU from Amazon's record of it, with the supplier labeling and preparing.
function awdPrep(detail: AmazonPrep | undefined) {
  if (!detail) {
    return { labelOwner: "SELF" }
  }
  const category = detail.prepCategory === "NONE" ? "NO_PREP" : detail.prepCategory
  return { prepCategory: category, ...(category === "NO_PREP" ? {} : { prepOwner: "SELF" }), labelOwner: "SELF" }
}

// An AWD inbound order for a shipment's cartons. Each product's prep category is Amazon's record of the SKU (AWD's
// categories describe the product, such as TEXTILE, not what the supplier does); without one, Amazon uses no prep.
export function buildAwdRequest(
  order: OrderInput,
  packing: Packing,
  reference: string,
  prep: ReadonlyMap<string, AmazonPrep> = new Map()
) {
  const validation = validatePacking(order, packing)
  if (!validation.valid) {
    throw new Error(`Packing breaks rules: ${validation.issues.map((i) => i.code).join(", ")}`)
  }
  const groups = new Map<string, { count: number; distributionPackage: ReturnType<typeof packageFor> }>()
  function packageFor(carton: Packing["cartons"][number]) {
    const content = carton.items[0]!
    const item = order.items.find((i) => i.id === content.itemId)!
    return {
      type: "CASE" as const,
      contents: {
        products: [
          {
            sku: item.buyerSku,
            quantity: content.pieces / item.piecesPerSet,
            prepDetails: awdPrep(prep.get(item.buyerSku))
          }
        ]
      },
      measurements: {
        dimensions: {
          length: carton.length,
          width: carton.width,
          height: carton.height,
          unitOfMeasurement: "CENTIMETERS"
        },
        weight: { weight: carton.weight, unitOfMeasurement: "KILOGRAMS" }
      }
    }
  }
  for (const carton of packing.cartons) {
    const distributionPackage = packageFor(carton),
      key = JSON.stringify(distributionPackage)
    const group = groups.get(key)
    if (group) {
      group.count += 1
    } else {
      groups.set(key, { count: 1, distributionPackage })
    }
  }
  const { email: _email, ...originAddress } = packing.origin
  return { originAddress, packagesToInbound: [...groups.values()], externalReferenceId: reference }
}

// The owner an Amazon constraint such as SELLER_ONLY requires, or the fallback when it leaves the choice open.
const constrainedOwners: Record<string, "SELLER" | "AMAZON" | "NONE"> = {
  NONE_ONLY: "NONE",
  AMAZON_ONLY: "AMAZON",
  SELLER_ONLY: "SELLER"
}
const owner = (constraint: string | undefined, fallback: "SELLER" | "NONE") =>
  (constraint && constrainedOwners[constraint]) || fallback

// Who labels and prepares a SKU's units in an FBA inbound plan: the supplier, as far as Amazon's record of the SKU
// allows. A SKU Amazon has no prep category for has to be set up in Seller Central first.
function fbaOwners(sku: string, prep: ReadonlyMap<string, AmazonPrep>) {
  const detail = prep.get(sku)
  if (!detail || detail.prepCategory === "UNKNOWN") {
    throw new Error(`${sku}: choose its prep category in Seller Central before sending it to FBA`)
  }
  const prepOwner = owner(detail.prepOwnerConstraint, detail.prepCategory === "NONE" ? "NONE" : "SELLER")
  const labelOwner = owner(detail.labelOwnerConstraint, "SELLER")
  return {
    labelOwner: detail.allOwnersConstraint === "MUST_MATCH" && prepOwner !== "NONE" ? prepOwner : labelOwner,
    prepOwner
  }
}

// An FBA inbound plan for a shipment's cartons, to the US marketplace, named so the plan can be found again.
export function buildFbaPlan(order: OrderInput, packing: Packing, name: string, prep: ReadonlyMap<string, AmazonPrep>) {
  const validation = validatePacking(order, packing)
  if (!validation.valid) {
    throw new Error(`Packing breaks rules: ${validation.issues.map((i) => i.code).join(", ")}`)
  }
  const units = new Map<string, number>()
  for (const carton of packing.cartons) {
    for (const content of carton.items) {
      units.set(content.itemId, (units.get(content.itemId) ?? 0) + content.pieces)
    }
  }
  const { origin } = packing
  return {
    name,
    destinationMarketplaces: [usMarketplaceId],
    sourceAddress: {
      name: origin.name,
      addressLine1: origin.addressLine1,
      ...(origin.addressLine2 ? { addressLine2: origin.addressLine2 } : {}),
      city: origin.city,
      stateOrProvinceCode: origin.stateOrRegion,
      postalCode: origin.postalCode,
      countryCode: origin.countryCode,
      phoneNumber: origin.phoneNumber,
      ...(origin.email ? { email: origin.email } : {})
    },
    items: order.items.flatMap((item) => {
      const pieces = units.get(item.id)
      return pieces
        ? [{ msku: item.buyerSku, quantity: pieces / item.piecesPerSet, ...fbaOwners(item.buyerSku, prep) }]
        : []
    })
  }
}

// Each carton as an FBA box with its contents, in sellable units, in the packing list's order.
export function fbaBoxes(order: OrderInput, packing: Packing, prep: ReadonlyMap<string, AmazonPrep>) {
  return packing.cartons.map((carton) => ({
    cartonId: carton.cartonId,
    box: {
      contentInformationSource: "BOX_CONTENT_PROVIDED" as const,
      quantity: 1,
      dimensions: {
        length: carton.length,
        width: carton.width,
        height: carton.height,
        unitOfMeasurement: "CM" as const
      },
      weight: { value: carton.weight, unit: "KG" as const },
      items: carton.items.map((content) => {
        const item = order.items.find((i) => i.id === content.itemId)!
        return { msku: item.buyerSku, quantity: content.pieces / item.piecesPerSet, ...fbaOwners(item.buyerSku, prep) }
      })
    }
  }))
}

const palletEntry = (pallet: Pallet) => ({
  dimensions: { length: pallet.length, width: pallet.width, height: pallet.height, unitOfMeasurement: "CM" as const },
  weight: { value: pallet.weight, unit: "KG" as const },
  stackability: pallet.stackable ? ("STACKABLE" as const) : ("NON_STACKABLE" as const)
})

// The pallets carrying an FBA shipment's cartons, as Amazon takes them in its transportation request: identical pallets
// as one entry with their count. A pallet travels whole, so one holding cartons Amazon sends elsewhere comes back in
// split, by its ID.
export function fbaPallets(packing: Pick<Packing, "pallets">, cartonIds: ReadonlySet<string>) {
  const entries = new Map<string, ReturnType<typeof palletEntry> & { quantity: number }>()
  const split: string[] = []
  // Carton IDs match in any case, as validatePacking matches them.
  const ids = new Set([...cartonIds].map((id) => id.toLowerCase()))
  for (const pallet of packing.pallets ?? []) {
    const inside = pallet.cartonIds.filter((id) => ids.has(id.toLowerCase()))
    if (!inside.length) {
      continue
    }
    if (inside.length !== pallet.cartonIds.length) {
      split.push(pallet.palletId)
      continue
    }
    const entry = palletEntry(pallet)
    const key = JSON.stringify(entry)
    entries.set(key, { quantity: (entries.get(key)?.quantity ?? 0) + 1, ...entry })
  }
  return { pallets: [...entries.values()], split }
}

// What the products in some cartons are worth at the PO's prices, in minor units: the value declared for freight.
export function cartonsValue(order: Pick<OrderInput, "items">, cartons: Packing["cartons"]) {
  return cartons
    .flatMap((carton) => carton.items)
    .reduce(
      (sum, content) => sum + content.pieces * (order.items.find((item) => item.id === content.itemId)?.unitPrice ?? 0),
      0
    )
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

export function orderTotal(order: OrderCosts) {
  return (
    order.items.reduce((sum, item) => sum + itemTotal(item), 0) +
    (order.adjustments ?? []).reduce((sum, adjustment) => sum + adjustment.amount, 0)
  )
}
