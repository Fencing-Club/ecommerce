import { z } from "zod"

export const destinationSchema = z.enum(["awd_us", "awd_china", "fba", "forwarder"])
export const addressSchema = z.object({
  name: z.string().trim().min(1).max(50),
  addressLine1: z.string().trim().min(1).max(180),
  addressLine2: z.string().trim().max(60).default(""),
  city: z.string().trim().min(1).max(50),
  stateOrRegion: z.string().trim().min(1).max(50),
  postalCode: z.string().trim().min(1).max(20),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  phoneNumber: z
    .string()
    .trim()
    .pipe(z.union([z.literal(""), z.string().min(6).max(30)]))
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
export const itemSchema = z
  .object({
    id: z.uuid(),
    variantId: z.string().regex(/^gid:\/\/shopify\/ProductVariant\/\d+$/),
    inventoryItemId: z.string().regex(/^gid:\/\/shopify\/InventoryItem\/\d+$/),
    name: z.string().trim().min(1).max(240),
    variant: z.string().max(240),
    buyerSku: z.string().trim().min(1).max(255),
    supplierSku: z.string().trim().max(255).default(""),
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
    instructions: z.string().max(4000).default(""),
    prepCategory: z
      .enum(["POLYBAGGING", "NO_PREP", "BUBBLEWRAPPING", "TAPING", "LABELING", "BLACK_SHRINKWRAPPING", "HANG_GARMENT"])
      .default("POLYBAGGING")
  })
  .refine((i) => i.pieces % i.piecesPerSet === 0, "Pieces must be divisible by pieces per set")
export type OrderItem = z.infer<typeof itemSchema>
export const orderInputSchema = z
  .object({
    supplierId: z.uuid(),
    reference: z.string().trim().min(1).max(80),
    destination: destinationSchema,
    forwarderId: z.uuid().optional(),
    currency: z.enum(["USD", "CNY", "EUR", "GBP", "CAD", "AUD"]),
    dueDate: z.iso.date(),
    notes: z.string().max(8000).default(""),
    items: z.array(itemSchema).min(1).max(150)
  })
  .superRefine((order, ctx) => {
    if (order.destination === "forwarder" && !order.forwarderId) {
      ctx.addIssue({ code: "custom", message: "Choose a freight forwarder", path: ["forwarderId"] })
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
export const packingSchema = z.object({
  readyDate: z.iso.date(),
  origin: originSchema,
  invoiceDocumentId: z.uuid(),
  cartons: z.array(cartonInputSchema).min(1).max(1000),
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
    invoiceDocumentId: z.union([z.uuid(), z.literal("")]).optional(),
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
export type ValidationIssue = { cartonId?: string; message: string }

export function validatePacking(order: OrderInput, packing: Packing, reserved: Record<string, number> = {}) {
  const issues: ValidationIssue[] = []
  const totals: Record<string, number> = {}
  const configurations = new Map<string, string>()
  const cartonIds = new Set<string>()
  if (order.destination !== "awd_us") {
    issues.push({ message: "Shipment creation currently supports AWD USA only" })
  }
  for (const carton of packing.cartons) {
    const add = (message: string) => issues.push({ cartonId: carton.cartonId, message })
    if (cartonIds.has(carton.cartonId.toLowerCase())) {
      add("Carton numbers must be unique")
    }
    cartonIds.add(carton.cartonId.toLowerCase())
    if (Math.max(carton.length, carton.width, carton.height) > 63.5) {
      add("AWD cartons must not exceed 63.5 cm on any side")
    }
    if (carton.weight > 22.6796185) {
      add("AWD carton weight must not exceed 50 lb (22.68 kg)")
    }
    if (carton.items.length !== 1) {
      add("AWD requires one SKU per carton")
    }
    for (const content of carton.items) {
      const item = order.items.find((i) => i.id === content.itemId)
      if (!item) {
        add("Carton contains a product that is not on this PO")
        continue
      }
      totals[item.id] = (totals[item.id] ?? 0) + content.pieces
      const units = content.pieces / item.piecesPerSet
      if (!Number.isInteger(units)) {
        add(`${item.buyerSku}: pieces must form complete sets of ${item.piecesPerSet}`)
      }
      if (units > 150) {
        add(`${item.buyerSku}: maximum 150 sellable units per AWD carton`)
      }
      if (!item.fnsku || !item.asin) {
        add(`${item.buyerSku}: Amazon ASIN and FNSKU are required`)
      }
      const config = JSON.stringify([content.pieces, carton.length, carton.width, carton.height, carton.weight])
      if (configurations.has(item.id) && configurations.get(item.id) !== config) {
        add(
          `${item.buyerSku}: all cartons for this SKU must have the same contents, dimensions, and weight; split into separate shipments if needed`
        )
      }
      configurations.set(item.id, config)
    }
  }
  for (const item of order.items) {
    if ((totals[item.id] ?? 0) + (reserved[item.id] ?? 0) > item.pieces) {
      issues.push({ message: `${item.buyerSku}: cartons exceed the remaining PO quantity` })
    }
  }
  const changedIds = new Set<string>()
  for (const change of packing.changes) {
    if (!order.items.some((i) => i.id === change.itemId) || changedIds.has(change.itemId)) {
      issues.push({ message: "Invoice changes must reference unique PO items" })
    }
    changedIds.add(change.itemId)
  }
  return { issues, totals, valid: issues.length === 0 }
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
      return change ? { ...item, supplierSku: change.supplierSku, unitPrice: change.unitPrice } : item
    })
  })
}

export function buildAwdRequest(order: OrderInput, packing: Packing, reference: string) {
  const validation = validatePacking(order, packing)
  if (!validation.valid) {
    throw new Error(validation.issues.map((i) => i.message).join("; "))
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
            prepDetails: {
              prepCategory: item.prepCategory,
              ...(item.prepCategory === "NO_PREP" ? {} : { prepOwner: "SELF" }),
              labelOwner: "SELF"
            }
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

export function money(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100)
}
export function orderTotal(order: OrderInput) {
  return order.items.reduce((sum, item) => sum + item.pieces * item.unitPrice, 0)
}
