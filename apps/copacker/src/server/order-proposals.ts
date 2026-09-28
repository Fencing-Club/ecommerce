import { randomUUID } from "node:crypto"
import { type OrderInput, orderInputSchema, orderTotal } from "@repo/aisle"
import { and, desc, eq, inArray } from "drizzle-orm"
import { z } from "zod"
import { db, type Transaction } from "@/db"
import {
  documents,
  events,
  jobs,
  orderProposals,
  orderRevisions,
  orders,
  shipments,
  supplierProducts,
  variantFields
} from "@/db/schema"
import { accessibleOrder } from "./access"
import { requireBuyer, requireSupplier, type Session } from "./auth"
import { customerProducts } from "./catalogs"
import { shopifyFor } from "./connections"
import { generateInvoice, generatePo } from "./documents"
import { checkOrder, prepareOrder } from "./orders"
import { describeError } from "./stock"

export const proposalSchema = z.object({
  lines: z
    .array(
      z.object({
        itemId: z.uuid().optional(),
        supplierSku: z.string().trim().max(255),
        title: z.string().trim().min(1).max(500),
        pieces: z.number().int().min(1).max(1_000_000),
        unitPrice: z.number().int().min(0).max(100_000_000)
      })
    )
    .min(1, "Keep at least one product")
    .max(150),
  paymentTerms: z.string().trim().max(200),
  readyDate: z.iso.date().nullable(),
  note: z.string().trim().max(4000)
})
export type ProposalInput = z.infer<typeof proposalSchema>

type Executor = Transaction | ReturnType<typeof db>

// A sent PO can change while every shipment is still being packed and none has been submitted.
async function changeable(executor: Executor, orderId: string) {
  const rows = await executor.select().from(shipments).where(eq(shipments.orderId, orderId))
  return (
    rows.length > 0 &&
    rows.every(
      (shipment) =>
        shipment.status === "packing" && !shipment.packing && shipment.operation === "none" && !shipment.amazonOrderId
    )
  )
}

// The PO as the supplier's changes would leave it, before the buyer's Shopify details fill in added products.
function applied(order: OrderInput, proposal: ProposalInput) {
  const kept = proposal.lines.flatMap((line) => {
    const item = order.items.find((candidate) => candidate.id === line.itemId)
    return item ? [{ ...item, pieces: line.pieces, unitPrice: line.unitPrice }] : []
  })
  return { ...order, items: kept, paymentTerms: proposal.paymentTerms, readyDate: proposal.readyDate ?? undefined }
}

function lineChange(item: OrderInput["items"][number] | undefined, line: ProposalInput["lines"][number]) {
  if (!item) {
    return "added"
  }
  return item.pieces !== line.pieces || item.unitPrice !== line.unitPrice ? "changed" : "same"
}

// What changed between the PO and the proposal, as the buyer's review lists it.
export function proposalChanges(order: OrderInput, proposal: ProposalInput) {
  const lines = proposal.lines.map((line) => {
    const item = order.items.find((candidate) => candidate.id === line.itemId)
    return {
      key: line.itemId ?? line.supplierSku,
      name: item
        ? [item.name, item.variant && item.variant !== "Default Title" ? item.variant : ""].filter(Boolean).join(" / ")
        : line.title,
      supplierSku: line.supplierSku,
      change: lineChange(item, line),
      before: item ? { pieces: item.pieces, unitPrice: item.unitPrice } : null,
      after: { pieces: line.pieces, unitPrice: line.unitPrice }
    } as const
  })
  const removed = order.items
    .filter((item) => !proposal.lines.some((line) => line.itemId === item.id))
    .map((item) => ({
      key: item.id,
      name: [item.name, item.variant && item.variant !== "Default Title" ? item.variant : ""]
        .filter(Boolean)
        .join(" / "),
      supplierSku: item.supplierSku,
      change: "removed" as const,
      before: { pieces: item.pieces, unitPrice: item.unitPrice },
      after: null
    }))
  const addedTotal = proposal.lines
    .filter((line) => !line.itemId)
    .reduce((sum, line) => sum + line.pieces * line.unitPrice, 0)
  return {
    lines: [...lines, ...removed],
    paymentTerms:
      order.paymentTerms !== proposal.paymentTerms
        ? { before: order.paymentTerms, after: proposal.paymentTerms }
        : null,
    readyDate:
      (order.readyDate ?? null) !== proposal.readyDate
        ? { before: order.readyDate ?? null, after: proposal.readyDate }
        : null,
    total: { before: orderTotal(order), after: orderTotal(applied(order, proposal)) + addedTotal }
  }
}

// A PO's pending proposal and the latest decision, and whether the supplier can propose changes now.
export async function proposalState(orderId: string) {
  const [latest] = await db()
    .select()
    .from(orderProposals)
    .where(eq(orderProposals.orderId, orderId))
    .orderBy(desc(orderProposals.createdAt))
    .limit(1)
  return { latest: latest ?? null, changeable: await changeable(db(), orderId) }
}

// What the supplier's edit page needs: the PO, and the products it can add at this customer's prices.
export async function reviseContext(s: Session, orderId: string) {
  requireSupplier(s)
  const { order, supplier } = await accessibleOrder(s, orderId)
  const [{ latest, changeable: open }, products] = await Promise.all([
    proposalState(orderId),
    db().transaction(async (tx) => {
      const skus = await tx
        .select({ sku: supplierProducts.supplierSku })
        .from(supplierProducts)
        .where(and(eq(supplierProducts.supplierOrgId, s.org.id), eq(supplierProducts.active, 1)))
      return customerProducts(
        tx,
        supplier,
        skus.map((row) => row.sku)
      )
    })
  ])
  return { order, latest, changeable: open, products: products.filter((product) => product.active) }
}

// The supplier proposes changes to a sent PO. A change to the ready date alone needs no approval and applies at once.
export async function proposeChanges(s: Session, orderId: string, raw: unknown, expectedRevision: number) {
  requireSupplier(s)
  const parsed = proposalSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Check the changes and try again")
  }
  const proposal = parsed.data
  return db().transaction(async (tx) => {
    const { order, supplier } = await accessibleOrder(s, orderId, tx, true)
    if (order.status !== "submitted" || order.revision !== expectedRevision) {
      throw new Error("This purchase order has changed. Refresh and try again")
    }
    if (!(await changeable(tx, orderId))) {
      throw new Error("A shipment is already packed, so this purchase order can't change")
    }
    const ids = proposal.lines.flatMap((line) => (line.itemId ? [line.itemId] : []))
    if (new Set(ids).size !== ids.length || ids.some((id) => !order.data.items.some((item) => item.id === id))) {
      throw new Error("This purchase order has changed. Refresh and try again")
    }
    for (const line of proposal.lines) {
      const item = order.data.items.find((candidate) => candidate.id === line.itemId)
      if (item && line.pieces % item.piecesPerSet !== 0) {
        throw new Error(
          `${item.buyerSku} is a set of ${item.piecesPerSet}. Order a multiple of ${item.piecesPerSet} pieces`
        )
      }
    }
    const added = proposal.lines.filter((line) => !line.itemId)
    if (added.length) {
      const skus = added.map((line) => line.supplierSku)
      const offered = await customerProducts(tx, supplier, skus)
      const missing = skus.filter((sku) => !offered.some((product) => product.active && product.supplierSku === sku))
      if (missing.length) {
        throw new Error(`Add only your active products: ${missing.join(", ")}`)
      }
      if (new Set(skus).size !== skus.length || order.data.items.some((item) => skus.includes(item.supplierSku))) {
        throw new Error("A product is on the purchase order twice. Change its quantity instead")
      }
    }
    const changes = proposalChanges(order.data, proposal)
    const commercial = changes.lines.some((line) => line.change !== "same") || changes.paymentTerms
    await tx
      .update(orderProposals)
      .set({ status: "withdrawn", decidedBy: s.user.id, decidedAt: new Date() })
      .where(and(eq(orderProposals.orderId, orderId), eq(orderProposals.status, "pending")))
    if (!commercial) {
      if (!changes.readyDate) {
        throw new Error("Change something before sending")
      }
      // The ready date is the supplier's to set: it updates the PO as it is, without a new revision.
      const data = orderInputSchema.parse({ ...order.data, readyDate: proposal.readyDate ?? undefined })
      await tx.update(orders).set({ data, updatedAt: new Date() }).where(eq(orders.id, orderId))
      await tx
        .update(orderRevisions)
        .set({ data })
        .where(and(eq(orderRevisions.orderId, orderId), eq(orderRevisions.revision, order.revision)))
      await tx
        .update(shipments)
        .set({ snapshot: data })
        .where(and(eq(shipments.orderId, orderId), eq(shipments.status, "packing")))
      await tx.insert(events).values({
        orderId,
        actor: s.user.id,
        message: proposal.readyDate
          ? `Supplier set the ready date to ${proposal.readyDate}`
          : "Supplier cleared the ready date"
      })
      return { approval: false }
    }
    await tx.insert(orderProposals).values({
      orderId,
      baseRevision: order.revision,
      data: proposal,
      proposedBy: s.user.id
    })
    await tx.insert(events).values({
      orderId,
      actor: s.user.id,
      message: proposal.note ? `Supplier proposed changes: ${proposal.note}` : "Supplier proposed changes"
    })
    return { approval: true }
  })
}

async function pendingFor(tx: Transaction, s: Session, proposalId: string) {
  const [proposal] = await tx.select().from(orderProposals).where(eq(orderProposals.id, proposalId)).for("update")
  if (!proposal || proposal.status !== "pending") {
    throw new Error("These changes were already answered. Refresh to see the purchase order")
  }
  const { order, supplier } = await accessibleOrder(s, proposal.orderId, tx, true)
  return { proposal, order, supplier }
}

export async function withdrawProposal(s: Session, proposalId: string) {
  requireSupplier(s)
  await db().transaction(async (tx) => {
    const { proposal } = await pendingFor(tx, s, proposalId)
    await tx
      .update(orderProposals)
      .set({ status: "withdrawn", decidedBy: s.user.id, decidedAt: new Date() })
      .where(eq(orderProposals.id, proposalId))
    await tx
      .insert(events)
      .values({ orderId: proposal.orderId, actor: s.user.id, message: "Supplier withdrew its changes" })
  })
}

export async function declineProposal(s: Session, proposalId: string, reason: string) {
  requireBuyer(s)
  const why = z.string().trim().max(2000).parse(reason)
  await db().transaction(async (tx) => {
    const { proposal } = await pendingFor(tx, s, proposalId)
    await tx
      .update(orderProposals)
      .set({ status: "declined", decidedBy: s.user.id, decidedAt: new Date(), reason: why || null })
      .where(eq(orderProposals.id, proposalId))
    await tx.insert(events).values({
      orderId: proposal.orderId,
      actor: s.user.id,
      message: why ? `Supplier's changes declined: ${why}` : "Supplier's changes declined"
    })
  })
}

// The buyer approves a supplier's changes: the PO's next revision takes them, with Shopify's details for any product
// the supplier added, matched by supplier SKU. The supplier's commercial invoice for it is filed with the shipment.
export async function approveProposal(s: Session, proposalId: string) {
  requireBuyer(s)
  const [proposal] = await db().select().from(orderProposals).where(eq(orderProposals.id, proposalId))
  if (!proposal || proposal.status !== "pending") {
    throw new Error("These changes were already answered. Refresh to see the purchase order")
  }
  const { order } = await accessibleOrder(s, proposal.orderId)
  const added = proposal.data.lines.filter((line) => !line.itemId)
  const matches = added.length
    ? await db()
        .select({ variantId: variantFields.variantId, supplierSku: variantFields.supplierSku })
        .from(variantFields)
        .where(
          and(
            eq(variantFields.orgId, s.org.id),
            eq(variantFields.shopifyDomain, order.shopifyDomain),
            inArray(
              variantFields.supplierSku,
              added.map((line) => line.supplierSku)
            )
          )
        )
    : []
  const unmatched = added.filter((line) => !matches.some((row) => row.supplierSku === line.supplierSku))
  if (unmatched.length) {
    throw new Error(
      `Give a Shopify variant the supplier SKU ${unmatched.map((line) => line.supplierSku).join(", ")}, then approve`
    )
  }
  const variants = added.length
    ? await (await shopifyFor(s.org.id, order.shopifyDomain)).variants(matches.map((row) => row.variantId))
    : []
  const newItems = added.map((line) => {
    const variantId = matches.find((row) => row.supplierSku === line.supplierSku)!.variantId
    const variant = variants.find((candidate) => candidate?.id === variantId)
    if (!variant) {
      throw new Error(`Shopify has no variant for supplier SKU ${line.supplierSku}`)
    }
    return {
      id: randomUUID(),
      variantId,
      inventoryItemId: variant.inventoryItem.id,
      name: variant.product.title,
      variant: variant.title,
      buyerSku: variant.sku ?? line.supplierSku,
      supplierSku: line.supplierSku,
      pieces: line.pieces,
      piecesPerSet: 1,
      unitPrice: line.unitPrice,
      asin: "",
      fnsku: ""
    }
  })
  const next = applied(order.data, proposal.data)
  const prepared = await prepareOrder(s, { ...next, items: [...next.items, ...newItems] })
  const result = await db().transaction(async (tx) => {
    const { proposal: current, order: locked, supplier } = await pendingFor(tx, s, proposalId)
    if (
      locked.revision !== current.baseRevision ||
      locked.status !== "submitted" ||
      !(await changeable(tx, locked.id))
    ) {
      throw new Error(
        "The purchase order changed since the supplier proposed this. Ask them to send their changes again"
      )
    }
    await checkOrder(tx, s, prepared, { stock: false })
    const revision = locked.revision + 1
    const data = prepared.input
    await tx
      .insert(orderRevisions)
      .values({ orderId: locked.id, revision, data, actor: s.user.id, reason: "Approved supplier changes" })
    await tx.update(orders).set({ data, revision, updatedAt: new Date() }).where(eq(orders.id, locked.id))
    const open = await tx
      .update(shipments)
      .set({ snapshot: data, orderRevision: revision, updatedAt: new Date() })
      .where(and(eq(shipments.orderId, locked.id), eq(shipments.status, "packing")))
      .returning({ id: shipments.id })
    await tx
      .update(documents)
      .set({ outdated: 1 })
      .where(and(eq(documents.orderId, locked.id), inArray(documents.kind, ["purchase_order", "invoice"])))
    await tx
      .update(orderProposals)
      .set({ status: "approved", decidedBy: s.user.id, decidedAt: new Date() })
      .where(eq(orderProposals.id, proposalId))
    if (supplier.supplierOrgId && supplier.email) {
      await tx
        .insert(jobs)
        .values({
          key: `po:${locked.id}:${revision}`,
          kind: "email",
          payload: { type: "po", orderId: locked.id, revision, to: supplier.email }
        })
        .onConflictDoNothing()
    }
    await tx.insert(events).values({
      orderId: locked.id,
      actor: s.user.id,
      message: `Supplier's changes approved; purchase order revision ${revision} published`
    })
    return { orderId: locked.id, revision, shipmentIds: open.map((row) => row.id) }
  })
  // The documents are made again if storage fails, when they're next needed.
  try {
    await generatePo(result.orderId, result.revision)
    for (const shipmentId of result.shipmentIds) {
      await generateInvoice(result.orderId, shipmentId, result.revision)
    }
  } catch (error) {
    console.error(
      JSON.stringify({ event: "proposal_documents_failed", orderId: result.orderId, error: describeError(error) })
    )
  }
  return result
}
