import type { AmazonPrep } from "@repo/copacker-marketplaces/amazon"
import { usMarketplaceId } from "@repo/copacker-marketplaces/amazon-marketplaces"
import { addressSchema, itemChangeSchema, type OrderInput } from "@repo/copacker-orders"
import {
  type AmazonNetwork,
  amazonNetworks,
  cartonReceivers,
  groupReceivers,
  isAmazonNetwork,
  orderDestination,
  receiverFor,
  receiverIds,
  receivers,
  validatePacking
} from "@repo/copacker-packing-rules"
import { z } from "zod"

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
// Amazon needs a contact phone to schedule pickup, so a shipment origin cannot omit it.
export const originSchema = addressSchema.extend({
  phoneNumber: z.string().trim().min(6, "Add a pickup phone number. Amazon needs it to schedule pickup").max(30)
})
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
  changes: z.array(itemChangeSchema).max(150).default([])
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
