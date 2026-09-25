import { approveChanges, commercialChanges, orderInputSchema, packingDraftSchema } from "@repo/aisle"
import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { orders, orderRevisions, suppliers, shipments, documents, events, jobs } from "@/db/schema"
import { accessibleOrder } from "./access"
import { requireBuyer, type Session } from "./auth"
import { shopifyFor, amazonFor, connection } from "./connections"
import { reservedPieces, packingReadiness } from "./readiness"

export async function createOrder(s: Session, raw: unknown) {
  requireBuyer(s)
  const input = orderInputSchema.parse(raw)
  const [supplier] = await db()
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.buyerOrgId, s.org.id)))
  if (!supplier) {
    throw new Error("Select a supplier in this workspace")
  }
  const shop = await connection(s.org.id, "shopify"),
    amazon = await connection(s.org.id, "amazon")
  const catalog = await (await shopifyFor(s.org.id, shop.externalId)).variants(input.items.map((i) => i.variantId))
  const identities = await (
    await amazonFor(s.org.id, amazon.externalId)
  ).listings(
    amazon.externalId,
    catalog.flatMap((item) => (item?.sku ? [item.sku] : []))
  )
  input.items = input.items.map((item) => {
    const source = catalog.find((v) => v?.id === item.variantId)
    if (!source?.sku) {
      throw new Error("Every PO item must have a Shopify SKU")
    }
    const identity = identities.get(source.sku)
    if (source.asin?.value && identity?.asin && source.asin.value !== identity.asin) {
      throw new Error(`Shopify and Amazon ASINs disagree for SKU ${source.sku}`)
    }
    return {
      ...item,
      name: source.product.title,
      variant: source.title,
      buyerSku: source.sku,
      inventoryItemId: source.inventoryItem.id,
      supplierSku: source.supplierSku?.value ?? "",
      asin: identity?.asin ?? "",
      fnsku: identity?.fnsku ?? ""
    }
  })
  orderInputSchema.parse(input)
  return db().transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({
        buyerOrgId: s.org.id,
        supplierId: supplier.id,
        shopifyDomain: shop.externalId,
        amazonSellerId: amazon.externalId,
        data: input
      })
      .returning()
    await tx
      .insert(orderRevisions)
      .values({ orderId: order!.id, revision: 1, data: input, actor: s.user.id, reason: "PO created" })
    return order!
  })
}
export async function submitOrder(s: Session, id: string, expectedRevision: number) {
  requireBuyer(s)
  return db().transaction(async (tx) => {
    const { order, supplier } = await accessibleOrder(s, id, tx, true)
    if (order.status !== "draft" || order.revision !== expectedRevision) {
      throw new Error("This PO has changed. Refresh before submitting")
    }
    if (order.data.destination !== "awd_us") {
      throw new Error("The first release supports AWD USA. Save other destinations as drafts")
    }
    await tx.update(orders).set({ status: "submitted", updatedAt: new Date() }).where(eq(orders.id, id))
    await tx
      .insert(jobs)
      .values({
        key: `po:${id}:${order.revision}`,
        kind: "email",
        payload: { type: "po", orderId: id, revision: order.revision, to: supplier.email, orgName: s.org.name }
      })
      .onConflictDoNothing()
    const [shipment] = await tx
      .insert(shipments)
      .values({ orderId: id, orderRevision: order.revision, snapshot: order.data })
      .returning()
    await tx.insert(events).values({ orderId: id, actor: s.user.id, message: "PO submitted to supplier" })
    return { shipmentId: shipment!.id }
  })
}
export async function newShipment(s: Session, orderId: string) {
  return db().transaction(async (tx) => {
    const { order } = await accessibleOrder(s, orderId, tx, true)
    if (order.status !== "submitted") {
      throw new Error("Submit the PO before creating a shipment")
    }
    const existing = await tx
      .select()
      .from(shipments)
      .where(eq(shipments.orderId, orderId))
      .orderBy(shipments.createdAt)
    const editable = existing.find(
      (row) => ["packing", "correction"].includes(row.status) && row.operation === "none" && !row.amazonOrderId
    )
    if (editable) {
      return editable
    }
    const reserved = reservedPieces(existing)
    if (order.data.items.every((item) => (reserved[item.id] ?? 0) >= item.pieces)) {
      throw new Error("All PO quantities are already assigned to shipments")
    }
    const [shipment] = await tx
      .insert(shipments)
      .values({ orderId, orderRevision: order.revision, snapshot: order.data })
      .returning()
    return shipment!
  })
}
export async function submitPacking(s: Session, shipmentId: string, raw: unknown, expectedRevision: number) {
  return db().transaction(async (tx) => {
    const [initial] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId))
    if (!initial) {
      throw new Error("Shipment not found")
    }
    const { order } = await accessibleOrder(s, initial.orderId, tx, true)
    const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId)).for("update")
    if (!shipment || !["packing", "correction"].includes(shipment.status) || shipment.revision !== expectedRevision) {
      throw new Error("This shipment has changed. Refresh before submitting")
    }
    if (shipment.amazonOrderId || shipment.operation !== "none") {
      throw new Error("Resolve the existing Amazon shipment before submitting replacement cartons")
    }
    const docs = await tx.select().from(documents).where(eq(documents.orderId, order.id))
    const others = await tx.select().from(shipments).where(eq(shipments.orderId, order.id))
    const assessed = packingReadiness(
      order.data,
      shipment,
      raw ?? shipment.packingDraft,
      docs,
      reservedPieces(others, shipmentId),
      order.revision
    )
    if (!assessed.packing || assessed.issues.length) {
      throw new Error(
        assessed.issues.map((issue) => `${issue.cartonId ? `${issue.cartonId}: ` : ""}${issue.message}`).join("\n")
      )
    }
    const packing = assessed.packing
    const approval = commercialChanges(order.data, packing).length > 0
    await tx
      .update(shipments)
      .set({
        packing,
        packingDraft: null,
        snapshot: order.data,
        orderRevision: order.revision,
        status: approval ? "approval" : "queued",
        updatedAt: new Date()
      })
      .where(eq(shipments.id, shipmentId))
    await tx.insert(events).values({
      orderId: order.id,
      actor: s.user.id,
      message: approval
        ? "Supplier submitted invoice changes for approval"
        : "Packing submitted; Amazon creation queued"
    })
    if (!approval) {
      await tx
        .insert(jobs)
        .values({
          key: `amazon:${shipmentId}:${shipment.revision}`,
          kind: "amazon",
          payload: { shipmentId, revision: shipment.revision }
        })
        .onConflictDoNothing()
    }
    return { approval }
  })
}
export async function approveInvoice(s: Session, shipmentId: string, expectedRevision: number, updateCost: boolean) {
  requireBuyer(s)
  return db().transaction(async (tx) => {
    const [initial] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId))
    if (!initial) {
      throw new Error("Shipment not found")
    }
    const { order, supplier } = await accessibleOrder(s, initial.orderId, tx, true)
    const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId)).for("update")
    if (
      !shipment?.packing ||
      shipment.status !== "approval" ||
      shipment.revision !== expectedRevision ||
      shipment.orderRevision !== order.revision
    ) {
      throw new Error("The PO or invoice has changed. Ask the supplier to resubmit against the latest PO")
    }
    const data = approveChanges(order.data, shipment.packing),
      revision = order.revision + 1
    await tx
      .insert(orderRevisions)
      .values({ orderId: order.id, revision, data, actor: s.user.id, reason: "Approved supplier commercial changes" })
    await tx.update(orders).set({ data, revision, updatedAt: new Date() }).where(eq(orders.id, order.id))
    await tx
      .update(shipments)
      .set({ snapshot: data, orderRevision: revision, status: "queued", updatedAt: new Date() })
      .where(eq(shipments.id, shipmentId))
    await tx
      .update(documents)
      .set({ outdated: 1 })
      .where(and(eq(documents.orderId, order.id), eq(documents.kind, "purchase_order")))
    await tx
      .insert(jobs)
      .values([
        {
          key: `shopify:${shipmentId}:${shipment.revision}`,
          kind: "shopify",
          payload: {
            orgId: s.org.id,
            orderId: order.id,
            revision,
            changes: commercialChanges(order.data, shipment.packing),
            updateCost
          }
        },
        {
          key: `amazon:${shipmentId}:${shipment.revision}`,
          kind: "amazon",
          payload: { shipmentId, revision: shipment.revision }
        },
        {
          key: `po:${order.id}:${revision}`,
          kind: "email",
          payload: { type: "po", orderId: order.id, revision, to: supplier.email }
        }
      ])
      .onConflictDoNothing()
    await tx.insert(events).values({
      orderId: order.id,
      actor: s.user.id,
      message: `Invoice changes approved; PO revision ${revision} published`
    })
  })
}
export async function correctShipment(s: Session, shipmentId: string, reason: string) {
  z.string().trim().min(3).max(2000).parse(reason)
  return db().transaction(async (tx) => {
    const [initial] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId))
    if (!initial) {
      throw new Error("Shipment not found")
    }
    await accessibleOrder(s, initial.orderId, tx, true)
    const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId)).for("update")
    if (!shipment || ["creating", "collected", "cancelled"].includes(shipment.status)) {
      throw new Error("Shipment cannot be edited in its current state")
    }
    if (shipment.operation === "sending" && !shipment.amazonOrderId) {
      throw new Error("Reconcile the uncertain Amazon creation before requesting a correction")
    }
    await tx
      .update(shipments)
      .set({
        status: "correction",
        issue: reason,
        packingDraft: shipment.packingDraft ?? shipment.packing,
        revision: shipment.revision + 1,
        updatedAt: new Date()
      })
      .where(eq(shipments.id, shipmentId))
    await tx.update(documents).set({ outdated: 1 }).where(eq(documents.shipmentId, shipmentId))
    await tx
      .update(jobs)
      .set({ status: "cancelled" })
      .where(
        and(eq(jobs.key, `amazon:${shipmentId}:${shipment.revision}`), inArray(jobs.status, ["pending", "failed"]))
      )
    await tx
      .insert(events)
      .values({ orderId: shipment.orderId, actor: s.user.id, message: `Correction requested: ${reason}` })
  })
}

export async function savePacking(
  s: Session,
  shipmentId: string,
  raw: unknown,
  expectedRevision: number,
  expectedOrderRevision: number
) {
  const draft = packingDraftSchema.parse(raw)
  return db().transaction(async (tx) => {
    const [initial] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId))
    if (!initial) {
      throw new Error("Shipment not found")
    }
    const { order } = await accessibleOrder(s, initial.orderId, tx, true)
    const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId)).for("update")
    if (!shipment || shipment.revision !== expectedRevision || order.revision !== expectedOrderRevision) {
      throw new Error("The PO or packing draft has changed. Refresh before saving")
    }
    if (
      !["packing", "correction"].includes(shipment.status) ||
      shipment.operation !== "none" ||
      shipment.amazonOrderId
    ) {
      throw new Error("Request a correction before changing submitted packing")
    }
    const itemIds = new Set(order.data.items.map((item) => item.id))
    if (
      draft.cartons?.some((carton) => carton.items?.some((item) => item.itemId && !itemIds.has(item.itemId))) ||
      draft.changes?.some((change) => !itemIds.has(change.itemId))
    ) {
      throw new Error("Draft contains a product that is not on this PO")
    }
    const revision = shipment.revision + 1
    await tx
      .update(shipments)
      .set({ packingDraft: draft, revision, orderRevision: order.revision, updatedAt: new Date() })
      .where(eq(shipments.id, shipmentId))
    return { revision, savedAt: new Date().toISOString() }
  })
}
export async function checkPacking(s: Session, shipmentId: string, raw?: unknown) {
  return db().transaction(async (tx) => {
    const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId))
    if (!shipment) {
      throw new Error("Shipment not found")
    }
    const { order } = await accessibleOrder(s, shipment.orderId, tx)
    const docs = await tx.select().from(documents).where(eq(documents.orderId, order.id))
    const all = await tx.select().from(shipments).where(eq(shipments.orderId, order.id))
    const reserved = reservedPieces(all, shipment.id)
    const result = packingReadiness(
      order.data,
      shipment,
      raw ?? shipment.packingDraft ?? shipment.packing ?? {},
      docs,
      reserved,
      order.revision
    )
    return {
      revision: shipment.revision,
      orderRevision: order.revision,
      canSubmit: result.issues.length === 0,
      requiresApproval: result.packing ? commercialChanges(order.data, result.packing).length > 0 : false,
      issues: result.issues,
      items: order.data.items.map((item) => ({
        itemId: item.id,
        buyerSku: item.buyerSku,
        orderedPieces: item.pieces,
        reservedPieces: reserved[item.id] ?? 0,
        availablePieces: Math.max(0, item.pieces - (reserved[item.id] ?? 0))
      }))
    }
  })
}
