import { addressLines } from "@repo/copacker-orders"
import { orderDestination } from "@repo/copacker-packing-rules"
import { amazonNetworkNames } from "@repo/copacker-shipments"
import { packedStates } from "@repo/copacker-shipments/states"
import { and, eq, or } from "drizzle-orm"
import { db } from "../src/db/index"
import { contacts, forwarders, orders, organizations, shipments, suppliers } from "../src/db/schema"

// A packed shipment's supplier packet input, read from the database: the same JSON the exporter takes, to render or to
// print and edit first. It reads the shipment's accepted PO and packing, never prices, and calls no provider, so an
// Amazon shipment exports before Amazon has it, without its labels or warehouse address.
export async function packetFromDatabase(id: string) {
  const [shipment] = await db().select().from(shipments).where(eq(shipments.id, id))
  if (!shipment) {
    throw new Error(`No shipment ${id}`)
  }
  if (!shipment.packing || !shipment.transport || !packedStates.includes(shipment.status)) {
    throw new Error("Finish the shipment's packing and transport first")
  }
  if (shipment.labels.length) {
    throw new Error("This shipment has Amazon's labels. Download its supplier packet in Copacker")
  }
  const [order] = await db().select().from(orders).where(eq(orders.id, shipment.orderId))
  if (!order) {
    throw new Error(`No purchase order for shipment ${id}`)
  }
  const data = shipment.snapshot ?? order.data
  const [[buyer], [supplier], numbered] = await Promise.all([
    db().select({ name: organizations.name }).from(organizations).where(eq(organizations.id, order.buyerOrgId)),
    db().select({ name: suppliers.name }).from(suppliers).where(eq(suppliers.id, order.supplierId)),
    // A purchase order's shipments are numbered oldest first, as on the shipment's page.
    db()
      .select({ id: shipments.id })
      .from(shipments)
      .where(eq(shipments.orderId, order.id))
      .orderBy(shipments.createdAt)
  ])
  if (!buyer || !supplier) {
    throw new Error(`No buyer or supplier for shipment ${id}`)
  }
  const delivery = async () => {
    const [place] = data.deliveryId
      ? await db()
          .select()
          .from(contacts)
          .where(and(eq(contacts.id, data.deliveryId), eq(contacts.orgId, order.buyerOrgId)))
      : []
    if (!place) {
      throw new Error("Choose the PO's delivery address first")
    }
    return { name: place.name, address: addressLines(place.address) }
  }
  const amazon = shipment.amazonNetwork && {
    name: `Amazon ${amazonNetworkNames[shipment.amazonNetwork]}`,
    address: []
  }
  let destination
  let onward
  if (data.via) {
    // The supplier's leg ends at the forwarder's address: one the buyer saved for it, or the forwarder's own.
    const [stop] = await db()
      .select({ name: forwarders.name, address: contacts.address })
      .from(contacts)
      .innerJoin(forwarders, eq(forwarders.id, data.via.forwarderId))
      .where(
        and(
          eq(contacts.id, data.via.addressId),
          eq(forwarders.buyerOrgId, order.buyerOrgId),
          or(eq(contacts.forwarderId, forwarders.id), eq(contacts.orgId, forwarders.forwarderOrgId))
        )
      )
    if (!stop) {
      throw new Error("The PO's forwarder address is gone")
    }
    destination = { name: stop.name, address: addressLines(stop.address) }
    onward = {
      destination: orderDestination(data) === "warehouse" ? await delivery() : amazon,
      service: "forwarder"
    }
  } else {
    destination = orderDestination(data) === "warehouse" ? await delivery() : amazon
  }
  return {
    company: buyer.name,
    supplier: supplier.name,
    shipmentId: `Shipment ${numbered.findIndex((row) => row.id === id) + 1}`,
    revision: shipment.revision,
    generatedDate: new Date().toISOString().slice(0, 10),
    order: data,
    packing: shipment.packing,
    transport: shipment.transport,
    destination,
    ...(onward && { onward }),
    amazonPending: !data.via && orderDestination(data) === "amazon",
    evidence: { verifiedAt: new Date().toISOString(), source: `Copacker shipment ${id}` }
  }
}
