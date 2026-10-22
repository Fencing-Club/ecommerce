import { orderSubtotal, orderUnits } from "@repo/copacker-shipments"
import { destinationRequirements, itemRequirements, sharedPrep } from "@repo/copacker-shipments/requirements"
import { desc, eq, inArray } from "drizzle-orm"
import { db } from "@/db"
import { contacts, forwarders, orderRevisions, organizations, shipments } from "@/db/schema"
import { can } from "@/lib/access"
import { storedEvent } from "@/lib/timeline-events"
import { accessibleOrder, forwarderOrder } from "@/server/access"
import { amazonFreightByOrder } from "@/server/amazon-shipments"
import { requirePage, session } from "@/server/auth"
import { landedCostKinds, landedMarkup, orderLandedCosts } from "@/server/landed-costs"
import { proposalChanges, proposalState } from "@/server/order-proposals"
import { lineLabels } from "@/server/product-barcodes"
import { requirementTranslator } from "@/server/requirements"
import { forwarderLeg } from "@/server/shipment-legs"
import { storeTimeZone } from "@/server/store-time-zone"
import { serverTranslator } from "@/server/translation"
import { orderWorkflow } from "@/server/workflow"
import { orderEvents } from "./comments"
import { forwarderPage } from "./forwarder-page"
import { unpricedChanges, unpricedOrder } from "./prices"

export async function orderPage(input: { id: string; query: Record<string, string | string[]> }) {
  const [s, t] = await Promise.all([session(), serverTranslator("orders")])
  requirePage(s, "orders")
  // A malformed or unknown id is a not-found, from forwarderOrder or accessibleOrder.
  const { id } = input
  if (s.org.kind === "forwarder") {
    return {
      view: "forwarder" as const,
      data: await forwarderPage(await forwarderOrder(s, id), can(s, "orders", "edit"))
    }
  }
  // Someone who can only view purchase orders sees the PO without its buttons; shipments are their own page.
  const editsOrder = can(s, "orders", "edit")
  const seesShipments = can(s, "shipments")
  const editsShipments = can(s, "shipments", "edit")
  // Someone who doesn't see prices gets the PO without its costs, totals, landed costs and priced documents.
  const prices = can(s, "prices")
  // The events and workflow below take the PO as opened here, rather than opening it again.
  const opened = await accessibleOrder(s, id)
  const { order, supplier } = opened
  const [shipmentRows, history, revisions, buyerName] = await Promise.all([
    // Oldest first, so "Shipment 2" here is Shipment 2 on the shipments list and the shipment's page.
    db().select().from(shipments).where(eq(shipments.orderId, id)).orderBy(shipments.createdAt),
    orderEvents(s, opened),
    db().select().from(orderRevisions).where(eq(orderRevisions.orderId, id)).orderBy(desc(orderRevisions.revision)),
    // The supplier reads the buyer's note as from the buyer, by its workspace's name.
    s.org.kind === "supplier"
      ? db()
          .select({ name: organizations.name })
          .from(organizations)
          .where(eq(organizations.id, order.buyerOrgId))
          .then((rows) => rows[0]?.name)
      : undefined
  ])
  // Suppliers see where the PO stands on their side, in their order list's words: its latest shipment's status until
  // it's closed. Buyers see the PO's own.
  const status =
    s.org.kind === "supplier" && order.status !== "closed"
      ? (shipmentRows.at(-1)?.status ?? order.status)
      : order.status
  const [workflow, proposals] = await Promise.all([orderWorkflow(s, opened), proposalState(id)])
  // The supplier's latest changes: pending for both sides, or declined for the supplier to see why.
  const proposal =
    proposals.latest &&
    (proposals.latest.status === "pending" || (proposals.latest.status === "declined" && s.org.kind === "supplier"))
      ? proposals.latest
      : null

  const editable = workflow.shipments.some((row) => row.editable)
  const remaining = workflow.items.some((item) => item.remainingPieces > 0)
  const { currency } = order.data
  const [landed, freight] =
    s.org.kind === "buyer" && prices
      ? await Promise.all([
          orderLandedCosts(id),
          amazonFreightByOrder(s.org.id).then((rows) =>
            rows.filter((row) => row.orderId === id && row.currency === currency)
          )
        ])
      : [[], []]
  // Amazon's freight for this PO's shipments counts with the costs recorded here.
  const landedTotal =
    landed.reduce((sum, cost) => sum + cost.amountMinor, 0) + freight.reduce((sum, row) => sum + row.freightMinor, 0)
  const markup = landedMarkup(order.data, landedTotal)
  const buyer = s.org.kind === "buyer"
  // Each line's label, from its product's current barcode and label setting.
  const labels = await lineLabels(order)

  // What happened to the PO, newest first: its events, and each revision, which opens to show its lines.
  const timeline = [
    ...history.map((event) => ({
      key: event.id,
      at: event.createdAt,
      content: (event.kind === "event" && storedEvent(event)) || (event.message ?? ""),
      comment: event.kind === "comment",
      author: event.author,
      authorOrg: event.authorOrg,
      visibility: event.internalOrgId ? ("internal" as const) : ("shared" as const),
      revision: null,
      revisionNumber: null
    })),
    ...revisions.map((r) => ({
      key: r.id,
      at: r.createdAt,
      content: storedEvent({ messageKey: r.reason, messageValues: null }) ?? r.reason,
      comment: false,
      author: null,
      authorOrg: null,
      revision: r.data,
      revisionNumber: r.revision
    }))
  ].toSorted((a, b) => b.at.getTime() - a.at.getTime())
  // The documents kept with the PO that this workspace can download: the PO's own, then each shipment's, in the order
  // they're made. Product labels are made from each product instead, in the Products table.
  const documentOrder = [
    "purchase_order",
    "invoice",
    "packing_list",
    "checklist",
    "carton_label",
    "pallet_label",
    "shipping_label"
  ]
  const documentGroups = [
    { key: "order", title: null, shipmentId: null },
    // Shipments' documents are for those who can open shipments.
    ...(seesShipments ? shipmentRows : []).map((shipment, index) => ({
      key: shipment.id,
      title: t("detail.shipment", { number: index + 1 }),
      shipmentId: shipment.id
    }))
  ].flatMap((group) => {
    const documents = workflow.documents
      .filter(
        (doc) =>
          doc.downloadUrl &&
          (doc.kind === "invoice" ? null : doc.shipmentId) === group.shipmentId &&
          documentOrder.includes(doc.kind)
      )
      .toSorted(
        (a, b) =>
          documentOrder.indexOf(a.kind) - documentOrder.indexOf(b.kind) ||
          (a.cartonId ?? a.name).localeCompare(b.cartonId ?? b.name, undefined, { numeric: true })
      )
      // The purchase order and the commercial invoice are priced.
      .filter((doc) => prices || !["purchase_order", "invoice"].includes(doc.kind))
    return documents.length ? [{ ...group, documents }] : []
  })
  const prep = sharedPrep(order.data)
  // The forwarder the goods pass through, if any. The buyer ships its leg on for one that isn't on Copacker.
  const legId = forwarderLeg(order.data)
  const leg = legId
    ? await db()
        .select({ name: forwarders.name, forwarderOrgId: forwarders.forwarderOrgId })
        .from(forwarders)
        .where(eq(forwarders.id, legId))
        .then((rows) => rows[0])
    : undefined
  const text = await requirementTranslator()
  const instructions = [...(prep ? [{ code: "prep" as const, prep }] : []), ...destinationRequirements(order.data)].map(
    text.requirement
  )

  // The route's names: the forwarder stop and the delivery address.
  const addressIds = [order.data.deliveryId, order.data.via?.addressId].filter((value) => value !== undefined)
  const places = addressIds.length
    ? await db().select({ id: contacts.id, name: contacts.name }).from(contacts).where(inArray(contacts.id, addressIds))
    : []
  const place = (addressId: string | undefined) => places.find((candidate) => candidate.id === addressId)?.name
  // The stop goes by the PO's forwarder and its address there, such as "Yiwu Logistics, Yiwu warehouse": an address the
  // buyer saved for the forwarder, or the forwarder's own once it has joined.
  const stop = order.data.via && [leg?.name, place(order.data.via.addressId)].filter(Boolean).join(", ")
  // A calendar day, such as the date the PO is required by, the same wherever it's read.

  // The buyer's note, labeled from the viewer's side: to the supplier for the buyer, from the buyer for the supplier.
  let noteLabel = t("detail.noteToSupplier")
  if (s.org.kind === "supplier") {
    noteLabel = buyerName ? t("detail.noteFrom", { buyer: buyerName }) : t("detail.buyersNote")
  }

  return {
    view: "order" as const,
    data: {
      s: { org: { kind: s.org.kind, name: s.org.name }, user: { name: s.user.name, email: s.user.email } },
      id,
      editsOrder,
      seesShipments,
      editsShipments,
      prices,
      order: {
        id: order.id,
        status: order.status,
        revision: order.revision,
        data: prices ? order.data : unpricedOrder(order.data)
      },
      supplier: { id: supplier.id, name: supplier.name, supplierOrgId: supplier.supplierOrgId },
      status,
      changeable: proposals.changeable,
      proposal: proposal
        ? {
            id: proposal.id,
            status: proposal.status,
            note: proposal.data.note,
            reason: proposal.reason,
            changes: prices
              ? proposalChanges(order.data, proposal.data)
              : unpricedChanges(proposalChanges(order.data, proposal.data))
          }
        : null,
      remainingItems: workflow.items.map((row) => ({ itemId: row.itemId, remainingPieces: row.remainingPieces })),
      editable,
      remaining,
      currency,
      landedTotal: prices ? landedTotal : 0,
      markup: prices ? markup : 0,
      buyer,
      labels: labels.map((label) =>
        label.state === "uploaded" ? { itemId: label.itemId, state: label.state, name: label.name } : label
      ),
      timeline: timeline.map((entry) => ({
        ...entry,
        revision: entry.revision && !prices ? unpricedOrder(entry.revision) : entry.revision
      })),
      documentGroups: documentGroups.map((group) => ({
        ...group,
        documents: group.documents.map((doc) => ({
          id: doc.id,
          name: doc.name,
          kind: doc.kind,
          cartonId: doc.cartonId
        }))
      })),
      leg,
      instructions,
      units: orderUnits(order.data),
      subtotal: prices ? orderSubtotal(order.data) : 0,
      places,
      stop,
      noteLabel,
      timeZone: await storeTimeZone(s.org),
      instructionsByItem: Object.fromEntries(
        order.data.items.map((item) => [
          item.id,
          itemRequirements(item, prep)
            .filter((requirement) => !["packFor", "bundle", "fnskuLabel", "instruction"].includes(requirement.code))
            .map(text.requirement)
        ])
      ),
      shipmentRows: shipmentRows.map((row) => ({
        id: row.id,
        status: row.status,
        amazonNetwork: row.amazonNetwork,
        amazonShipmentId: row.amazonShipmentId,
        cartonCount: row.packingDraft?.cartons?.length ?? row.packing?.cartons.length ?? 0
      })),
      freight: prices ? freight.map((row) => ({ reference: row.reference, amount: row.freightMinor })) : [],
      landed: prices
        ? landed.map((cost) => ({
            id: cost.id,
            kind: landedCostKinds[cost.kind],
            description: cost.description,
            amount: cost.amountMinor
          }))
        : []
    }
  }
}
