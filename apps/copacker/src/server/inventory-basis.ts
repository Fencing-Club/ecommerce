import { createHash } from "node:crypto"
import { and, eq, isNull, sql, desc } from "drizzle-orm"
import { z } from "zod"
import { db, type Transaction } from "@/db"
import { inventoryBasisRecords, organizations, orders, orderRevisions, shipments } from "@/db/schema"
import {
  inventoryBasisInput,
  multiplyInventoryCost,
  type InventoryBasisKind,
  type InventoryBasisData
} from "@/lib/inventory-basis"
import { AnalyticsProblem, analyticsPagination } from "./analytics-contract"
import { analyticsSnapshot } from "./analytics-snapshot"
import { assertNoLandedDependencies } from "./inventory-landed-costs"
import { hasInventoryProduct } from "./inventory-product"
import { resolveSaleEvidence, resolveDepletionDate } from "./inventory-sale-evidence"
const fail = (status: number, code: string, detail: string): never => {
  throw new AnalyticsProblem(status, code, detail)
}
export const inventoryBasisQuery = z.object({
  ...analyticsPagination,
  shopifyDomain: z.string().min(1).max(512).optional(),
  variantId: z.string().min(1).max(512).optional()
})
export async function saveInventoryBasis(orgId: string, userId: string, key: string, raw: unknown) {
  return db().transaction((tx) => saveInventoryBasisInTransaction(tx, orgId, userId, key, raw))
}
export async function saveInventoryBasisInTransaction(
  tx: Transaction,
  orgId: string,
  userId: string,
  key: string,
  raw: unknown
) {
  const requestInput = inventoryBasisInput.parse(raw)
  // Serialize same-workspace corrections and receipt totals, including opening-balance uniqueness.
  const [org] = await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .for("update")
  if (!org) {
    return fail(403, "workspace_unavailable", "Workspace unavailable.")
  }
  const [replay] = await tx.select().from(inventoryBasisRecords).where(eq(inventoryBasisRecords.id, key))
  if (replay) {
    // Parse again for stable key order and normalized defaults after JSONB serialization.
    if (
      replay.orgId !== orgId ||
      replay.createdBy !== userId ||
      JSON.stringify(inventoryBasisInput.parse(replay.request)) !== JSON.stringify(requestInput)
    ) {
      return fail(409, "idempotency_key_reused", "This request key belongs to a different write.")
    }
    return { record: replay, replayed: true }
  }
  const input =
    requestInput.kind === "depletion"
      ? { ...requestInput, occurredAt: await resolveDepletionDate(tx, orgId, requestInput) }
      : requestInput
  if (Date.parse(input.occurredAt) > Date.now()) {
    return fail(422, "future_event", "Record an event that has already occurred.")
  }
  const scope = eq(inventoryBasisRecords.orgId, orgId)
  let previous: typeof inventoryBasisRecords.$inferSelect | undefined
  if (input.supersedes) {
    ;[previous] = await tx
      .select()
      .from(inventoryBasisRecords)
      .where(and(scope, eq(inventoryBasisRecords.id, input.supersedes), isNull(inventoryBasisRecords.retiredAt)))
    if (!previous || previous.kind !== input.kind) {
      return fail(409, "record_changed", "The record has changed. Refresh before correcting it.")
    }
    await assertNoLandedDependencies(tx, orgId, previous.id)
    const dependents = await tx
      .select({ id: inventoryBasisRecords.id })
      .from(inventoryBasisRecords)
      .where(and(scope, eq(inventoryBasisRecords.purchaseId, previous.id), isNull(inventoryBasisRecords.retiredAt)))
      .limit(1)
    if (dependents.length) {
      return fail(
        409,
        "receipts_depend_on_purchase",
        "Retire the linked receipts before replacing this purchase cost, then record them against its replacement."
      )
    }
  }
  let shopifyDomain: string, variantId: string, quantity: number, piecesPerUnit: number
  let purchaseId: string | null = null
  let location: string | null = null
  let sourceKey = JSON.stringify([input.sourceReference, input.sourceLine])
  const data: InventoryBasisData = {
    input,
    costBasis: "missing",
    unitCost: null,
    totalCost: null,
    supplierReference: null,
    batchReference: null,
    purchaseOrder: null
  }
  let isHistoricalProduct = false
  if (input.kind === "purchase") {
    const source = input.source
    data.batchReference = source.batchReference
    if (source.type === "purchase_order") {
      const [order] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.id, source.orderId), eq(orders.buyerOrgId, orgId)))
        .for("share")
      if (!order || order.status === "draft") {
        return fail(404, "purchase_order_not_found", "A submitted purchase order is required.")
      }
      const [revision] = await tx
        .select()
        .from(orderRevisions)
        .where(and(eq(orderRevisions.orderId, order.id), eq(orderRevisions.revision, source.revision)))
      const version = revision?.data ?? (order.revision === source.revision ? order.data : null)
      const item = version?.items.find((item) => item.id === source.itemId)
      if (!version || !item) {
        return fail(404, "purchase_line_not_found", "Purchase order revision or item not found.")
      }
      shopifyDomain = order.shopifyDomain
      variantId = item.variantId
      quantity = item.pieces
      piecesPerUnit = item.piecesPerSet
      // Supported PO currencies all use two decimal places; snapshot the base piece price only.
      data.unitCost = {
        amount: `${Math.floor(item.unitPrice / 100)}.${String(item.unitPrice % 100).padStart(2, "0")}`,
        currency: version.currency
      }
      data.costBasis = "estimated"
      data.supplierReference = order.supplierId
      data.purchaseOrder = { orderId: order.id, revision: source.revision, item, adjustments: version.adjustments }
      sourceKey = JSON.stringify(["purchase_order", order.id, item.id])
      isHistoricalProduct = true
    } else {
      ;({ shopifyDomain, variantId, quantity, piecesPerUnit } = source)
      sourceKey = JSON.stringify(["invoice", source.supplierReference, source.invoiceReference, input.sourceLine])
      data.unitCost = source.unitCost
      data.supplierReference = source.supplierReference
      data.costBasis = source.costBasis
    }
    data.totalCost = {
      amount: multiplyInventoryCost(data.unitCost.amount, quantity),
      currency: data.unitCost.currency
    }
  } else if (input.kind === "opening") {
    ;({ shopifyDomain, variantId, quantity, piecesPerUnit, location } = input)
    data.batchReference = input.batchReference
    if (input.valuation.status !== "unknown") {
      data.totalCost = input.valuation.totalCost
      data.costBasis = input.valuation.status
    }
    const [existing] = await tx
      .select({ id: inventoryBasisRecords.id })
      .from(inventoryBasisRecords)
      .where(
        and(
          scope,
          eq(inventoryBasisRecords.kind, "opening"),
          eq(inventoryBasisRecords.shopifyDomain, shopifyDomain),
          eq(inventoryBasisRecords.variantId, variantId),
          eq(inventoryBasisRecords.location, location),
          isNull(inventoryBasisRecords.retiredAt)
        )
      )
    if (existing && existing.id !== previous?.id) {
      return fail(
        409,
        "opening_already_recorded",
        "Correct the existing opening balance for this product and location."
      )
    }
  } else if (input.kind === "depletion") {
    ;({ shopifyDomain, variantId, quantity, piecesPerUnit, location } = input)
    const resolved = await resolveSaleEvidence(tx, orgId, input)
    if (resolved) {
      sourceKey = resolved.sourceKey
      data.saleEvidence = resolved.evidence
      isHistoricalProduct = true
      if (input.sale?.source === "amazon") {
        const existing = await tx
          .select()
          .from(inventoryBasisRecords)
          .where(
            and(
              scope,
              eq(inventoryBasisRecords.kind, "depletion"),
              isNull(inventoryBasisRecords.retiredAt),
              sql`${inventoryBasisRecords.data}->'input'->'sale'->>'salesOrderId'=${input.sale.salesOrderId}`
            )
          )
        const saleSource = input.sale
        const allocated = existing.filter(
          (row) =>
            row.id !== previous?.id &&
            row.data.input.kind === "depletion" &&
            row.data.input.sale?.source === "amazon" &&
            row.data.input.sale.salesOrderId === saleSource.salesOrderId &&
            row.data.input.sale.orderItemId === saleSource.orderItemId
        )
        if (
          allocated.some((row) => {
            const prior = row.data.input
            return (
              prior.kind === "depletion" &&
              prior.sale?.source === "amazon" &&
              prior.sale.shipmentReference === saleSource.shipmentReference &&
              (!prior.sale.shipmentItemId || !saleSource.shipmentItemId)
            )
          })
        ) {
          return fail(
            409,
            "shipment_already_recorded",
            "Correct the existing shipment import instead of mixing manual and provider shipment identities."
          )
        }
        if (
          allocated.some(
            (row) =>
              row.piecesPerUnit !== input.piecesPerUnit ||
              row.variantId !== input.variantId ||
              row.shopifyDomain !== input.shopifyDomain
          ) ||
          allocated.reduce((sum, row) => sum + (row.data.saleEvidence?.units ?? 0), resolved.evidence.units) >
            resolved.fulfilledUnits
        ) {
          return fail(
            409,
            "shipment_quantity_exceeded",
            "Imported shipments exceed fulfilled units or disagree on the product conversion. Correct existing imports first."
          )
        }
      }
    }
  } else {
    const [purchase] = await tx
      .select()
      .from(inventoryBasisRecords)
      .where(
        and(
          scope,
          eq(inventoryBasisRecords.id, input.purchaseId),
          eq(inventoryBasisRecords.kind, "purchase"),
          isNull(inventoryBasisRecords.retiredAt)
        )
      )
    if (!purchase) {
      return fail(404, "purchase_not_found", "Active purchase cost not found.")
    }
    if (Date.parse(input.occurredAt) < purchase.occurredAt.getTime()) {
      return fail(422, "receipt_before_purchase", "Receipt date cannot precede its purchase date.")
    }
    shopifyDomain = purchase.shopifyDomain
    variantId = purchase.variantId
    piecesPerUnit = purchase.piecesPerUnit
    quantity = input.quantity
    purchaseId = purchase.id
    location = input.location
    data.unitCost = purchase.data.unitCost
    data.costBasis = purchase.data.costBasis
    data.supplierReference = purchase.data.supplierReference
    data.batchReference = purchase.data.batchReference
    if (data.unitCost) {
      data.totalCost = {
        amount: multiplyInventoryCost(data.unitCost.amount, quantity),
        currency: data.unitCost.currency
      }
    }
    const receipts = await tx
      .select({ id: inventoryBasisRecords.id, quantity: inventoryBasisRecords.quantity })
      .from(inventoryBasisRecords)
      .where(and(scope, eq(inventoryBasisRecords.purchaseId, purchase.id), isNull(inventoryBasisRecords.retiredAt)))
    if (
      receipts.filter((row) => row.id !== previous?.id).reduce((sum, row) => sum + row.quantity, quantity) >
      purchase.quantity
    ) {
      return fail(409, "receipt_quantity_exceeded", "Received pieces exceed the recorded purchase quantity.")
    }
    if (input.shipmentId) {
      const [shipment] = await tx
        .select({ shipment: shipments, order: orders })
        .from(shipments)
        .innerJoin(orders, eq(orders.id, shipments.orderId))
        .where(and(eq(shipments.id, input.shipmentId), eq(orders.buyerOrgId, orgId)))
      if (!shipment || purchase.data.purchaseOrder?.orderId !== shipment.order.id) {
        return fail(422, "shipment_mismatch", "Shipment must belong to the purchase order for this receipt.")
      }
    }
    isHistoricalProduct = true
  }
  if (!isHistoricalProduct) {
    if (!(await hasInventoryProduct(tx, orgId, shopifyDomain, variantId))) {
      return fail(422, "product_not_in_workspace", "Choose a product recorded in this workspace.")
    }
  }
  sourceKey = createHash("sha256").update(sourceKey).digest("hex")
  const duplicates = await tx
    .select({ id: inventoryBasisRecords.id })
    .from(inventoryBasisRecords)
    .where(
      and(
        scope,
        eq(inventoryBasisRecords.kind, input.kind),
        eq(inventoryBasisRecords.sourceKey, sourceKey),
        isNull(inventoryBasisRecords.retiredAt)
      )
    )
  if (duplicates.some((row) => row.id !== previous?.id)) {
    return fail(409, "source_already_recorded", "This source line is already recorded. Correct its existing record.")
  }
  if (previous) {
    await tx
      .update(inventoryBasisRecords)
      .set({ retiredAt: new Date(), retiredBy: userId })
      .where(eq(inventoryBasisRecords.id, previous.id))
  }
  const [record] = await tx
    .insert(inventoryBasisRecords)
    .values({
      id: key,
      orgId,
      kind: input.kind,
      shopifyDomain,
      variantId,
      quantity,
      piecesPerUnit,
      purchaseId,
      location,
      sourceKey,
      occurredAt: new Date(input.occurredAt),
      data,
      request: requestInput,
      createdBy: userId,
      supersedes: input.supersedes
    })
    .returning()
  return { record: record!, replayed: false }
}
export async function listInventoryBasis(
  orgId: string,
  kind: InventoryBasisKind,
  input: z.infer<typeof inventoryBasisQuery>
) {
  return db().transaction(
    async (tx) => {
      const snapshot = await analyticsSnapshot(
        tx,
        orgId,
        input,
        JSON.stringify(["inventory-basis", kind, input.shopifyDomain, input.variantId])
      )
      const rows = await tx
        .select()
        .from(inventoryBasisRecords)
        .where(
          and(
            eq(inventoryBasisRecords.orgId, orgId),
            eq(inventoryBasisRecords.kind, kind),
            input.shopifyDomain ? eq(inventoryBasisRecords.shopifyDomain, input.shopifyDomain) : undefined,
            input.variantId ? eq(inventoryBasisRecords.variantId, input.variantId) : undefined
          )
        )
        .orderBy(desc(inventoryBasisRecords.occurredAt), inventoryBasisRecords.id)
        .limit(101)
        .offset(input.page * 100)
      return { records: rows.slice(0, 100), page: input.page, snapshot, hasMore: rows.length > 100 }
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  )
}
export async function getInventoryBasis(orgId: string, kind: InventoryBasisKind, id: string) {
  const [record] = await db()
    .select()
    .from(inventoryBasisRecords)
    .where(
      and(
        eq(inventoryBasisRecords.orgId, orgId),
        eq(inventoryBasisRecords.kind, kind),
        eq(inventoryBasisRecords.id, id)
      )
    )
  if (!record) {
    return fail(404, "record_not_found", "Record not found.")
  }
  return record
}
export async function retireInventoryBasis(orgId: string, userId: string, kind: InventoryBasisKind, id: string) {
  return db().transaction(async (tx) => {
    await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, orgId)).for("update")
    const [record] = await tx
      .select()
      .from(inventoryBasisRecords)
      .where(
        and(
          eq(inventoryBasisRecords.orgId, orgId),
          eq(inventoryBasisRecords.kind, kind),
          eq(inventoryBasisRecords.id, id)
        )
      )
    if (!record) {
      return fail(404, "record_not_found", "Record not found.")
    }
    if (record.retiredAt) {
      return
    }
    await assertNoLandedDependencies(tx, orgId, id)
    const dependents = await tx
      .select({ id: inventoryBasisRecords.id })
      .from(inventoryBasisRecords)
      .where(
        and(
          eq(inventoryBasisRecords.orgId, orgId),
          eq(inventoryBasisRecords.purchaseId, id),
          isNull(inventoryBasisRecords.retiredAt)
        )
      )
      .limit(1)
    if (dependents.length) {
      return fail(409, "receipts_depend_on_purchase", "Retire the linked receipts before retiring this purchase cost.")
    }
    await tx
      .update(inventoryBasisRecords)
      .set({ retiredAt: new Date(), retiredBy: userId })
      .where(eq(inventoryBasisRecords.id, id))
  })
}
