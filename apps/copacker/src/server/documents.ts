import { randomUUID } from "node:crypto"
import { orderDestination } from "@repo/copacker-shipments"
import type { Address } from "@repo/copacker-shipments"
import type { OrderInput } from "@repo/copacker-shipments"
import type { Packing } from "@repo/copacker-shipments"
import { purchaseOrderPdf, commercialInvoicePdf } from "@repo/copacker-shipments/documents"
import { destinationName } from "@repo/copacker-shipments/requirements"
import { and, eq, inArray, isNull } from "drizzle-orm"
import invariant from "tiny-invariant"
import { db } from "@/db"
import {
  contacts,
  documents,
  forwarders,
  orders,
  shipments,
  organizations,
  supplierProfiles,
  suppliers,
  orderRevisions
} from "@/db/schema"
import { amazonDestinationAddresses } from "./amazon-shipments"
import { amazonFor } from "./connections"
import { getFile, putFile } from "./storage"

type DocumentInput = Omit<typeof documents.$inferInsert, "id" | "objectKey" | "bytes">
export async function storeDocument(input: DocumentInput, bytes: Uint8Array) {
  const id = randomUUID(),
    objectKey = `orders/${input.orderId}/${id}.pdf`
  await putFile(objectKey, bytes)
  return db().transaction(async (tx) => {
    // Serialize replacement with user uploads and preserve previous versions as outdated.
    const [order] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).for("update")
    if (!order) {
      throw new Error("Purchase order is unavailable")
    }
    let outdated = input.outdated ?? 0
    if (input.shipmentId) {
      const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, input.shipmentId)).for("update")
      if (
        !shipment ||
        shipment.orderId !== input.orderId ||
        shipment.revision !== input.shipmentRevision ||
        shipment.orderRevision !== input.orderRevision ||
        ["packing", "correction", "cancelled"].includes(shipment.status)
      ) {
        throw new Error("Shipment changed while generating documents")
      }
    } else if (input.orderRevision !== order.revision) {
      outdated = 1
    }
    // A late copy for an older revision leaves the current one in place.
    if (input.shipmentId || !outdated) {
      await tx
        .update(documents)
        .set({ outdated: 1 })
        .where(
          and(
            eq(documents.orderId, input.orderId),
            eq(documents.kind, input.kind),
            // A PO's own document replaces every earlier revision's; a shipment's replaces those of its revision.
            input.shipmentId
              ? and(eq(documents.shipmentId, input.shipmentId), eq(documents.orderRevision, input.orderRevision))
              : isNull(documents.shipmentId),
            input.cartonId ? eq(documents.cartonId, input.cartonId) : isNull(documents.cartonId),
            input.itemId ? eq(documents.itemId, input.itemId) : isNull(documents.itemId)
          )
        )
    }
    const [doc] = await tx
      .insert(documents)
      .values({ ...input, outdated, id, objectKey, bytes: bytes.length })
      .returning()
    invariant(doc, "Filing a document inserts one row")
    return doc
  })
}
// "1 Test Street", "Suite 2", "Testville, WA 98000", "US"
function addressLines(address: Address) {
  return [
    address.addressLine1,
    address.addressLine2,
    [address.city, [address.stateOrRegion, address.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    address.countryCode
  ].filter(Boolean)
}

// "Wei Chen, wei@supplier.example, +86 512 5555 0100", leaving out what isn't known.
function contactLine(...parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(", ")
}

// Who a PO or shipment document is from and to: the buyer with its business details, the supplier with its contact
// details, and the delivery or forwarder address it ships to.
async function documentParties(order: { buyerOrgId: string; supplierId: string }, data: OrderInput) {
  const [row] = await db()
    .select({ buyer: organizations, supplier: suppliers })
    .from(organizations)
    .innerJoin(suppliers, eq(suppliers.id, order.supplierId))
    .where(eq(organizations.id, order.buyerOrgId))
  if (!row) {
    throw new Error("Purchase order is unavailable")
  }
  const { via } = data
  const destination = orderDestination(data)
  // With a stop on the way, the supplier ships to the forwarder's address there, and the forwarder sends the goods on
  // to Amazon or the buyer's location. A forwarder's address is the buyer's until the forwarder joins, then its own.
  const [forwarder] = via
    ? await db()
        .select()
        .from(forwarders)
        .where(and(eq(forwarders.id, via.forwarderId), eq(forwarders.buyerOrgId, order.buyerOrgId)))
    : []
  const addressOwners = [order.buyerOrgId, ...(forwarder?.forwarderOrgId ? [forwarder.forwarderOrgId] : [])]
  const location = destination === "warehouse" ? data.deliveryId : undefined
  const shipToId = via ? forwarder && via.addressId : location
  const addressIds = [shipToId, location].filter((id) => id !== undefined)
  const [places, [buyerProfile], [supplierProfile]] = await Promise.all([
    addressIds.length
      ? db()
          .select({ id: contacts.id, name: contacts.name, address: contacts.address })
          .from(contacts)
          .where(and(inArray(contacts.id, addressIds), inArray(contacts.orgId, addressOwners)))
      : Promise.resolve([]),
    db().select().from(supplierProfiles).where(eq(supplierProfiles.orgId, order.buyerOrgId)),
    row.supplier.supplierOrgId
      ? db().select().from(supplierProfiles).where(eq(supplierProfiles.orgId, row.supplier.supplierOrgId))
      : Promise.resolve([])
  ])
  // A joined supplier keeps its own contact details; until then, the buyer's notes on it.
  const supplierContact = row.supplier.supplierOrgId ? supplierProfile : row.supplier
  const delivery = places.find((place) => place.id === shipToId)
  // After a stop, the buyer's location the goods go on to, if that's where they end.
  const onward = via && places.find((place) => place.id === location)
  return {
    buyer: {
      name: row.buyer.name,
      // Where the goods go is the PO's ship-to address; the buyer is its name and website.
      lines: [],
      website: buyerProfile?.website
    },
    supplier: {
      name: row.supplier.name,
      lines: [
        row.supplier.shopifySupplierName && row.supplier.shopifySupplierName !== row.supplier.name
          ? row.supplier.shopifySupplierName
          : "",
        contactLine(
          supplierContact?.contactName,
          supplierContact?.contactEmail ?? row.supplier.email,
          supplierContact?.phoneNumber
        )
      ].filter(Boolean)
    },
    shipTo: delivery
      ? {
          name: forwarder ? `${forwarder.name}, ${delivery.name}` : delivery.name,
          lines: [
            // Where the forwarder sends the goods on: the buyer's location, such as "Fencing Club, Warehouse", or the
            // lines' Amazon networks, such as "Amazon FBA".
            ...(via ? [`Then to ${onward ? `${row.buyer.name}, ${onward.name}` : destinationName(data)}`] : []),
            ...addressLines(delivery.address),
            contactLine(delivery.address.name, delivery.address.email, delivery.address.phoneNumber)
          ].filter(Boolean)
        }
      : undefined
  }
}

// A purchase order revision and who its PDF names.
async function poRevision(orderId: string, revision?: number) {
  const [order] = await db().select().from(orders).where(eq(orders.id, orderId))
  if (!order) {
    throw new Error("Purchase order is unavailable")
  }
  const targetRevision = revision ?? order.revision
  const [historical] = await db()
    .select()
    .from(orderRevisions)
    .where(and(eq(orderRevisions.orderId, orderId), eq(orderRevisions.revision, targetRevision)))
  if (!historical) {
    throw new Error("Purchase order revision is unavailable")
  }
  return { order, targetRevision, historical, parties: await documentParties(order, historical.data) }
}

// The revision's PDF as it's already filed, such as the one made when the PO was sent, or else a new one. The email
// attaches this, so sending it doesn't replace the document the PO's page links to while someone opens it.
export async function filedPo(orderId: string, revision?: number) {
  const { targetRevision, historical, parties } = await poRevision(orderId, revision)
  const [doc] = await db()
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.orderId, orderId),
        eq(documents.kind, "purchase_order"),
        isNull(documents.shipmentId),
        eq(documents.orderRevision, targetRevision),
        eq(documents.outdated, 0)
      )
    )
  if (!doc) {
    return generatePo(orderId, revision)
  }
  const bytes = await getFile(doc.objectKey)
  return { doc, bytes, shipTo: parties.shipTo?.name ?? destinationName(historical.data) }
}

export async function generatePo(orderId: string, revision?: number) {
  const { order, targetRevision, historical, parties } = await poRevision(orderId, revision)
  const bytes = await purchaseOrderPdf({
    order: historical.data,
    revision: targetRevision,
    issued: historical.createdAt.toISOString().slice(0, 10),
    ...parties
  })
  const doc = await storeDocument(
    {
      orderId,
      kind: "purchase_order",
      name: `${order.data.reference}.pdf`,
      orderRevision: targetRevision,
      outdated: targetRevision === order.revision ? 0 : 1,
      uploadedBy: "system"
    },
    bytes
  )
  // Where the PDF says the goods go, for the email it's sent with.
  return { doc, bytes, shipTo: parties.shipTo?.name ?? destinationName(historical.data) }
}
// A shipment the supplier has packed: its cartons, and the purchase order they were packed from.
type PackedShipment = typeof shipments.$inferSelect & { packing: Packing; snapshot: OrderInput }
const packed = (shipment: typeof shipments.$inferSelect | undefined): shipment is PackedShipment =>
  Boolean(shipment?.packing && shipment.snapshot)

// Who a shipment's documents are from, and where its cartons go: to the warehouses Amazon chose, named by their codes
// such as HGR6, or to the purchase order's ship-to address.
async function shipmentParties(shipment: PackedShipment) {
  const [order] = await db().select().from(orders).where(eq(orders.id, shipment.orderId))
  // Only the shipment's own lines, so a forwarder stop names the Amazon network its cartons go on to.
  const included = new Set(shipment.packing.cartons.flatMap((carton) => carton.items.map((item) => item.itemId)))
  const items = shipment.snapshot.items.filter((item) => included.has(item.id))
  const parties = await documentParties(order!, { ...shipment.snapshot, items })
  const warehouses = [...new Set(shipment.labels.map((label) => label.destinationCode).filter(Boolean))]
  const network = shipment.amazonNetwork === "fba" ? "Amazon FBA" : "Amazon AWD US"
  const shipTo =
    warehouses.length && !shipment.snapshot.via
      ? { name: network, lines: [`${warehouses.length > 1 ? "Warehouses" : "Warehouse"} ${warehouses.join(", ")}`] }
      : parties.shipTo
  if (orderDestination(shipment.snapshot) === "amazon" && !shipment.snapshot.via && shipment.amazonShipmentId) {
    const addresses = await amazonFor(order!.buyerOrgId, order!.amazonSellerId)
      .then((api) => amazonDestinationAddresses(api, shipment))
      .catch(() => [])
    if (addresses.length) {
      return {
        buyer: parties.buyer,
        shipTo: { name: network, lines: addresses.flatMap((address) => [address.name, ...addressLines(address)]) }
      }
    }
    if (shipTo) {
      shipTo.lines.push("Confirm the delivery address with the carrier before dispatch.")
    }
  }
  return { buyer: parties.buyer, shipTo }
}

// Where a packed shipment's cartons go, as its packing list names it, such as "Amazon AWD US" or the buyer's warehouse.
export async function shipmentDestination(shipment: typeof shipments.$inferSelect) {
  if (!packed(shipment)) {
    return undefined
  }
  if (
    orderDestination(shipment.snapshot) === "amazon" &&
    !shipment.snapshot.via &&
    shipment.amazonShipmentId &&
    shipment.labels.some((label) => label.destinationCode)
  ) {
    return shipment.amazonNetwork === "fba" ? "Amazon FBA" : "Amazon AWD US"
  }
  return (await shipmentParties(shipment)).shipTo?.name ?? destinationName(shipment.snapshot)
}

// The supplier's commercial invoice belongs to the approved purchase-order revision.
export async function generateInvoice(orderId: string, revision: number) {
  const [order] = await db().select().from(orders).where(eq(orders.id, orderId))
  const [historical] = await db()
    .select()
    .from(orderRevisions)
    .where(and(eq(orderRevisions.orderId, orderId), eq(orderRevisions.revision, revision)))
  if (!order || !historical) {
    throw new Error("Purchase order revision is unavailable")
  }
  const parties = await documentParties(order, historical.data)
  const [link] = await db()
    .select({ supplierOrgId: suppliers.supplierOrgId })
    .from(suppliers)
    .where(eq(suppliers.id, order.supplierId))
  const [supplierOrg] = link?.supplierOrgId
    ? await db()
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, link.supplierOrgId))
    : []
  const bytes = await commercialInvoicePdf({
    order: historical.data,
    revision,
    issued: historical.createdAt.toISOString().slice(0, 10),
    supplier: { ...parties.supplier, name: supplierOrg?.name ?? parties.supplier.name },
    buyer: { name: parties.buyer.name, lines: parties.buyer.website ? [parties.buyer.website] : [] },
    shipTo: parties.shipTo
  })
  const id = randomUUID()
  const objectKey = `orders/${orderId}/${id}.pdf`
  await putFile(objectKey, bytes)
  await db().transaction(async (tx) => {
    const [current] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update")
    if (!current || current.revision !== revision) {
      return
    }
    await tx
      .update(documents)
      .set({ outdated: 1 })
      .where(and(eq(documents.orderId, orderId), eq(documents.kind, "invoice")))
    await tx.insert(documents).values({
      id,
      orderId,
      kind: "invoice",
      objectKey,
      name: `Commercial invoice ${order.data.reference}.pdf`,
      bytes: bytes.length,
      orderRevision: revision,
      uploadedBy: "system"
    })
  })
}
