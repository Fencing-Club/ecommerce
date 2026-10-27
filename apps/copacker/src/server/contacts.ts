import { locationIdSchema } from "@repo/copacker-marketplaces/shopify"
import { addressSchema } from "@repo/copacker-orders"
import { and, eq, isNull, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { contacts, orders, shipmentStops } from "@/db/schema"
import { LocalizedError } from "@/i18n/errors"
import { contactKinds, contactKindsFor } from "@/lib/contacts"
import { StatusError } from "./errors"
import type { Session } from "./workspace-session"

// A workspace's own addresses: where a buyer or forwarder takes deliveries and where a supplier's goods are picked
// up. A partner's addresses change through the partner's actions, which need Partners access.

export const contactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  kind: z.enum(contactKinds),
  address: addressSchema,
  // The Shopify location a delivery address is, whose stock counts; other kinds have none.
  shopifyLocationId: locationIdSchema.nullable().default(null)
})

type Workspace = Pick<Session["org"], "id" | "kind">

// What's saved of an address, once its kind is one this workspace keeps.
function saved(org: Workspace, contact: z.output<typeof contactSchema>) {
  if (!contactKindsFor(org.kind).includes(contact.kind)) {
    throw new LocalizedError(org.kind === "supplier" ? "supplierPickupAddressesOnly" : "saveDeliveryAddressesHere")
  }
  return { ...contact, shopifyLocationId: contact.kind === "delivery" ? contact.shopifyLocationId : null }
}

// The workspace's own address, never one it keeps for a partner.
const ownContact = (orgId: string, id: string) =>
  and(eq(contacts.id, id), eq(contacts.orgId, orgId), isNull(contacts.supplierId), isNull(contacts.forwarderId))

export async function createContact(org: Workspace, contact: z.output<typeof contactSchema>) {
  await db()
    .insert(contacts)
    .values({ orgId: org.id, ...saved(org, contact) })
}

export async function updateContact(org: Workspace, id: string, contact: z.output<typeof contactSchema>) {
  const updated = await db()
    .update(contacts)
    .set(saved(org, contact))
    .where(ownContact(org.id, id))
    .returning({ id: contacts.id })
  if (!updated.length) {
    throw new StatusError("addressRemovedRefresh", 404)
  }
}

// A forwarder's address that a purchase order or a shipment's route stops at stays until the route changes.
export async function deleteContact(orgId: string, id: string) {
  const [stop] = await db()
    .select({ id: shipmentStops.shipmentId })
    .from(shipmentStops)
    .where(eq(shipmentStops.addressId, id))
    .union(
      db()
        .select({ id: orders.id })
        .from(orders)
        .where(sql`${orders.data}->'via'->>'addressId' = ${id}`)
    )
    .limit(1)
  if (stop) {
    throw new StatusError("addressOnRoute", 409)
  }
  const deleted = await db().delete(contacts).where(ownContact(orgId, id)).returning({ id: contacts.id })
  if (!deleted.length) {
    throw new StatusError("addressAlreadyRemoved", 404)
  }
}
