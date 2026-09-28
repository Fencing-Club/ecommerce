import { and, eq, isNull, ne } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { orders, suppliers } from "@/db/schema"
import { LocalizedError } from "@/i18n/errors"
import { contactDetailsSchema } from "@/lib/contact-details"

// Removes a supplier from a buyer's workspace. Its invitation stops working and its workspace loses access to the
// buyer's POs. A supplier working on a sent PO stays until that PO is closed, so no shipment is left without its packer.
export async function removeSupplier(buyerOrgId: string, supplierId: string) {
  await db().transaction(async (tx) => {
    const [supplier] = await tx
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.id, supplierId), eq(suppliers.buyerOrgId, buyerOrgId), isNull(suppliers.removedAt)))
      .for("update")
    if (!supplier) {
      throw new LocalizedError("supplierAlreadyRemoved")
    }
    const open = await tx
      .select({ data: orders.data })
      .from(orders)
      .where(and(eq(orders.supplierId, supplierId), eq(orders.status, "submitted")))
    if (open.length) {
      const references = open.map((order) => order.data.reference).join(", ")
      throw new LocalizedError("supplierHasOpenOrders", { name: supplier.name, references, count: open.length })
    }
    await tx
      .update(suppliers)
      .set({ removedAt: new Date(), invitationHash: null, expiresAt: null })
      .where(eq(suppliers.id, supplierId))
  })
}

// A contact detail as the forms check it: left out keeps what's saved, and empty clears it.
const keepOrClear = (field: z.ZodType<string, string>) =>
  field.optional().transform((value) => (value === undefined ? undefined : value || null))
const details = contactDetailsSchema.shape
export const supplierContactSchema = z.object({
  website: keepOrClear(details.website),
  contactName: keepOrClear(details.contactName),
  contactEmail: keepOrClear(details.contactEmail),
  phoneNumber: keepOrClear(details.phoneNumber)
})

export const supplierUpdateSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().trim().min(1).max(120),
  // As it appears in Shopify's product Supplier field; empty when it isn't used there.
  shopifySupplierName: z
    .string()
    .trim()
    .max(255)
    .nullable()
    .optional()
    // Left out keeps the saved name; empty clears it.
    .transform((value) => (value === undefined ? undefined : value || null)),
  leadTimeDays: z.number().int().min(1).max(730).nullable(),
  // The supplier's contact details, all optional. Left out keeps what's saved; empty clears it.
  ...supplierContactSchema.shape
})

// A supplier's name, and how long they take to deliver to the buyer's locations and to Amazon (used by restock).
export async function updateSupplier(buyerOrgId: string, raw: unknown) {
  const input = supplierUpdateSchema.parse(raw)
  const [taken] = await db()
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(and(eq(suppliers.buyerOrgId, buyerOrgId), eq(suppliers.name, input.name), ne(suppliers.id, input.id)))
  if (taken) {
    throw new LocalizedError("supplierNameTaken")
  }
  const [current] = await db()
    .select({ supplierOrgId: suppliers.supplierOrgId })
    .from(suppliers)
    .where(and(eq(suppliers.id, input.id), eq(suppliers.buyerOrgId, buyerOrgId)))
  // Once the supplier joins, their contact details are theirs to keep in their own workspace.
  const contact = current?.supplierOrgId
    ? {}
    : Object.fromEntries(
        (["website", "contactName", "contactEmail", "phoneNumber"] as const).flatMap((field) =>
          input[field] === undefined ? [] : [[field, input[field]]]
        )
      )
  const updated = await db()
    .update(suppliers)
    .set({
      name: input.name,
      leadTimeDays: input.leadTimeDays,
      ...(input.shopifySupplierName !== undefined && { shopifySupplierName: input.shopifySupplierName }),
      ...contact
    })
    .where(and(eq(suppliers.id, input.id), eq(suppliers.buyerOrgId, buyerOrgId), isNull(suppliers.removedAt)))
    .returning({ id: suppliers.id })
  if (!updated.length) {
    throw new LocalizedError("supplierRemoved")
  }
}

// The suppliers Shopify names in its product Supplier field become the buyer's suppliers, so every one can get POs.
// A Shopify name matching a supplier's name or its name in Shopify is already there; an existing supplier whose name
// is part of the Shopify name, such as "Guanda" in "Wuxi Guanda Sport Goods Co. Ltd.", is linked to it instead of
// duplicated; the rest are added without an email, to invite later. A supplier the buyer removed stays removed.
export async function syncShopifySuppliers(buyerOrgId: string, names: Iterable<string | null | undefined>) {
  const wanted = [...new Set([...names].map((name) => name?.trim()).filter((name): name is string => Boolean(name)))]
  if (!wanted.length) {
    return { added: 0, linked: 0 }
  }
  const existing = await db().select().from(suppliers).where(eq(suppliers.buyerOrgId, buyerOrgId))
  const key = (value: string) => value.trim().toLowerCase()
  let added = 0
  let linked = 0
  for (const name of wanted) {
    const known = existing.some(
      (supplier) =>
        key(supplier.name) === key(name) ||
        (supplier.shopifySupplierName && key(supplier.shopifySupplierName) === key(name))
    )
    if (known) {
      continue
    }
    const partOf = existing.find(
      (supplier) => !supplier.removedAt && !supplier.shopifySupplierName && key(name).includes(key(supplier.name))
    )
    if (partOf) {
      await db().update(suppliers).set({ shopifySupplierName: name }).where(eq(suppliers.id, partOf.id))
      partOf.shopifySupplierName = name
      linked++
      continue
    }
    const [row] = await db()
      .insert(suppliers)
      .values({ buyerOrgId, name, shopifySupplierName: name })
      .onConflictDoNothing()
      .returning()
    if (row) {
      existing.push(row)
      added++
    }
  }
  return { added, linked }
}
