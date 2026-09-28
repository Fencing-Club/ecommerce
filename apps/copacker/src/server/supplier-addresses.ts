import { originSchema } from "@repo/aisle"
import { and, eq, inArray, isNull } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { contacts, suppliers } from "@/db/schema"

// Reads through the given database or transaction.
type Reader = Pick<ReturnType<typeof db>, "select">
type Supplier = Pick<typeof suppliers.$inferSelect, "id" | "buyerOrgId" | "supplierOrgId">

// Where carriers collect each supplier's cartons: its own pickup addresses once it has joined Copacker, and until then
// the ones its buyer saved for it. Keyed by supplier.
export async function pickupAddressesBySupplier(list: Supplier[], reader: Reader = db()) {
  const joined = [...new Set(list.flatMap((row) => (row.supplierOrgId ? [row.supplierOrgId] : [])))]
  const waiting = list.filter((row) => !row.supplierOrgId)
  const [own, saved] = await Promise.all([
    joined.length
      ? reader
          .select()
          .from(contacts)
          .where(and(inArray(contacts.orgId, joined), eq(contacts.kind, "pickup")))
          .orderBy(contacts.createdAt)
      : [],
    waiting.length
      ? reader
          .select()
          .from(contacts)
          .where(
            and(
              inArray(contacts.orgId, [...new Set(waiting.map((row) => row.buyerOrgId))]),
              inArray(
                contacts.supplierId,
                waiting.map((row) => row.id)
              ),
              eq(contacts.kind, "pickup")
            )
          )
          .orderBy(contacts.createdAt)
      : []
  ])
  return new Map(
    list.map((row) => [
      row.id,
      row.supplierOrgId
        ? own.filter((contact) => contact.orgId === row.supplierOrgId)
        : saved.filter((contact) => contact.orgId === row.buyerOrgId && contact.supplierId === row.id)
    ])
  )
}

// One supplier's pickup addresses, such as for packing its shipment.
export async function supplierPickupAddresses(supplier: Supplier, reader: Reader = db()) {
  return (await pickupAddressesBySupplier([supplier], reader)).get(supplier.id) ?? []
}

// The buyer's current supplier that hasn't joined, whose pickup addresses the buyer keeps.
async function waitingSupplier(buyerOrgId: string, id: string) {
  const [supplier] = await db()
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, id), eq(suppliers.buyerOrgId, buyerOrgId), isNull(suppliers.removedAt)))
  if (!supplier) {
    throw new Error("This supplier was removed")
  }
  if (supplier.supplierOrgId) {
    throw new Error(`${supplier.name} keeps its own pickup addresses now that it has joined`)
  }
  return supplier
}

// Adds or edits a pickup address for a supplier that hasn't joined. Amazon needs its phone number to schedule pickup.
export async function saveSupplierAddress(buyerOrgId: string, raw: unknown) {
  const input = z
    .object({
      supplierId: z.uuid(),
      id: z.uuid().optional(),
      name: z.string().trim().min(1).max(100),
      address: originSchema
    })
    .parse(raw)
  const supplier = await waitingSupplier(buyerOrgId, input.supplierId)
  const values = { name: input.name, address: input.address }
  if (input.id) {
    const updated = await db()
      .update(contacts)
      .set(values)
      .where(and(eq(contacts.id, input.id), eq(contacts.orgId, buyerOrgId), eq(contacts.supplierId, supplier.id)))
      .returning({ id: contacts.id })
    if (!updated.length) {
      throw new Error("This address was removed")
    }
    return { id: input.id }
  }
  const [created] = await db()
    .insert(contacts)
    .values({ orgId: buyerOrgId, kind: "pickup", supplierId: supplier.id, ...values })
    .returning({ id: contacts.id })
  return { id: created!.id }
}

export async function removeSupplierAddress(buyerOrgId: string, raw: unknown) {
  const input = z.object({ supplierId: z.uuid(), id: z.uuid() }).parse(raw)
  const supplier = await waitingSupplier(buyerOrgId, input.supplierId)
  const removed = await db()
    .delete(contacts)
    .where(and(eq(contacts.id, input.id), eq(contacts.orgId, buyerOrgId), eq(contacts.supplierId, supplier.id)))
    .returning({ id: contacts.id })
  if (!removed.length) {
    throw new Error("This address was already removed")
  }
  return { id: input.id }
}
