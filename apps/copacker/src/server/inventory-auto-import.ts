import { createHash, randomUUID } from "node:crypto"
import { and, eq, gt, gte, isNull, sql, desc } from "drizzle-orm"
import { z } from "zod"
import { db, type Transaction } from "@/db"
import {
  organizations,
  connections,
  salesOrders,
  amazonFulfillmentShipments,
  inventoryBasisRecords,
  inventoryUnitMappings,
  inventoryImportCursors,
  inventoryImportResults
} from "@/db/schema"
import type { InventoryBasisInput } from "@/lib/inventory-basis"
import { AnalyticsProblem, analyticsPagination } from "./analytics-contract"
import { analyticsSnapshot } from "./analytics-snapshot"
import { saveInventoryBasisInTransaction } from "./inventory-basis"
import { resolveSaleEvidence } from "./inventory-sale-evidence"
type Source = "amazon" | "shopify"
type Depletion = Extract<InventoryBasisInput, { kind: "depletion" }>
type Candidate = {
  eventId: string
  productId: string | null
  occurredAt: string | null
  units: number | null
  location: string | null
  sale: NonNullable<Depletion["sale"]>
}
const actor = "system:inventory-depletion-import"
function blocked(code: string): never {
  throw new AnalyticsProblem(422, code, "Automatic import requires additional evidence.")
}
async function candidates(tx: Transaction, order: typeof salesOrders.$inferSelect): Promise<Candidate[]> {
  if (order.source === "shopify" && "lines" in order.data) {
    const sale = order.data
    return sale.fulfillments
      .filter((f) => f.status === "SUCCESS")
      .flatMap((f) =>
        f.lines.map((line) => ({
          eventId: JSON.stringify([f.id, line.id]),
          productId: sale.lines.find((item) => item.id === line.lineItem.id)?.variant?.id ?? null,
          occurredAt: f.inTransitAt ?? null,
          units: line.quantity,
          location: f.location ? `shopify:${order.externalAccountId}:${f.location.id}` : null,
          sale: { source: "shopify", salesOrderId: order.id, fulfillmentId: f.id, fulfillmentLineId: line.id }
        }))
      )
  }
  if (order.source === "amazon" && "orderItems" in order.data) {
    const rows = await tx
      .select()
      .from(amazonFulfillmentShipments)
      .where(
        and(
          eq(amazonFulfillmentShipments.orgId, order.orgId),
          eq(amazonFulfillmentShipments.externalAccountId, order.externalAccountId),
          eq(amazonFulfillmentShipments.orderId, order.orderId)
        )
      )
      .limit(2001)
    return rows.map((row) => ({
      eventId: JSON.stringify([row.shipmentId, row.shipmentItemId]),
      productId: row.sku,
      occurredAt: row.shippedAt.toISOString(),
      units: row.quantity,
      location: `amazon:${order.externalAccountId}:US:FBA`,
      sale: {
        source: "amazon",
        salesOrderId: order.id,
        orderItemId: row.orderItemId ?? "",
        shipmentReference: row.shipmentId,
        shipmentItemId: row.shipmentItemId,
        units: row.quantity
      }
    }))
  }
  return []
}
async function importCandidate(tx: Transaction, orgId: string, source: Source, account: string, candidate: Candidate) {
  if (!candidate.occurredAt) {
    blocked("shipment_date_required")
  }
  if (!candidate.productId) {
    blocked("product_unresolved")
  }
  if (!candidate.location) {
    blocked("location_unresolved")
  }
  if (!candidate.units || !Number.isSafeInteger(candidate.units)) {
    blocked("quantity_unresolved")
  }
  const mappings = await tx
    .select()
    .from(inventoryUnitMappings)
    .where(
      and(
        eq(inventoryUnitMappings.orgId, orgId),
        eq(inventoryUnitMappings.source, source),
        eq(inventoryUnitMappings.externalAccountId, account),
        eq(inventoryUnitMappings.sourceProductId, candidate.productId),
        isNull(inventoryUnitMappings.retiredAt)
      )
    )
  const current = mappings.filter(
    (m) => m.validFrom <= new Date(candidate.occurredAt!) && new Date(candidate.occurredAt!) < m.validTo
  )
  if (current.length !== 1 || !current[0]!.automatic) {
    blocked("automatic_conversion_required")
  }
  const mapping = current[0]!
  if (
    !Number.isSafeInteger(candidate.units * mapping.piecesPerUnit) ||
    candidate.units * mapping.piecesPerUnit > 1000000000
  ) {
    blocked("quantity_out_of_range")
  }
  const [opening] = await tx
    .select()
    .from(inventoryBasisRecords)
    .where(
      and(
        eq(inventoryBasisRecords.orgId, orgId),
        eq(inventoryBasisRecords.kind, "opening"),
        eq(inventoryBasisRecords.shopifyDomain, mapping.shopifyDomain),
        eq(inventoryBasisRecords.variantId, mapping.variantId),
        eq(inventoryBasisRecords.location, candidate.location),
        isNull(inventoryBasisRecords.retiredAt)
      )
    )
  if (!opening) {
    blocked("opening_required")
  }
  if (opening.occurredAt > new Date(candidate.occurredAt)) {
    blocked("before_opening_cutover")
  }
  const [manual] = await tx
    .select({ id: inventoryBasisRecords.id })
    .from(inventoryBasisRecords)
    .where(
      and(
        eq(inventoryBasisRecords.orgId, orgId),
        eq(inventoryBasisRecords.kind, "depletion"),
        eq(inventoryBasisRecords.shopifyDomain, mapping.shopifyDomain),
        eq(inventoryBasisRecords.variantId, mapping.variantId),
        eq(inventoryBasisRecords.location, candidate.location),
        isNull(inventoryBasisRecords.retiredAt),
        gte(inventoryBasisRecords.occurredAt, opening.occurredAt),
        sql`${inventoryBasisRecords.data}->'input'->'sale' is null`
      )
    )
    .limit(1)
  if (manual) {
    blocked("manual_depletion_reconciliation_required")
  }
  const input: Depletion = {
    kind: "depletion",
    sourceReference: "automatic-sales-import",
    sourceLine: createHash("sha256").update(candidate.eventId).digest("hex"),
    evidence: `Provider shipment evidence and dated unit mapping ${mapping.id}`,
    occurredAt: candidate.occurredAt,
    shopifyDomain: mapping.shopifyDomain,
    variantId: mapping.variantId,
    piecesPerUnit: mapping.piecesPerUnit,
    quantity: candidate.units * mapping.piecesPerUnit,
    location: candidate.location,
    sale: candidate.sale,
    unitMappingId: mapping.id
  }
  const resolved = await resolveSaleEvidence(tx, orgId, input)
  if (!resolved) {
    blocked("sale_unresolved")
  }
  const sourceKey = createHash("sha256").update(resolved.sourceKey).digest("hex")
  const history = await tx
    .select()
    .from(inventoryBasisRecords)
    .where(
      and(
        eq(inventoryBasisRecords.orgId, orgId),
        eq(inventoryBasisRecords.kind, "depletion"),
        eq(inventoryBasisRecords.sourceKey, sourceKey)
      )
    )
    .orderBy(desc(inventoryBasisRecords.createdAt))
  const active = history.find((row) => !row.retiredAt)
  if (!active && history.length) {
    blocked("retired_depletion_requires_review")
  }
  if (active) {
    if (active.createdBy !== actor) {
      const prior = active.data.input
      if (prior.kind !== "depletion") {
        blocked("existing_depletion_conflict")
      }
      const evidence = await resolveSaleEvidence(tx, orgId, prior)
      if (evidence?.evidence.fingerprint !== active.data.saleEvidence?.fingerprint) {
        blocked("manual_depletion_changed")
      }
      return { created: false, recordId: active.id }
    }
    if (
      active.data.saleEvidence?.fingerprint === resolved.evidence.fingerprint &&
      active.quantity === input.quantity &&
      active.location === input.location &&
      active.shopifyDomain === input.shopifyDomain &&
      active.variantId === input.variantId &&
      active.occurredAt.getTime() === Date.parse(candidate.occurredAt)
    ) {
      return { created: false, recordId: active.id }
    }
    input.supersedes = active.id
  }
  const result = await saveInventoryBasisInTransaction(tx, orgId, actor, randomUUID(), input)
  return { created: true, recordId: result.record.id }
}
// Each order is an atomic checkpoint. Concurrent runs serialize on the workspace; a crash replays only unfinished work.
export async function syncAutomaticDepletions(
  orgId: string,
  source: Source,
  account: string,
  assertOwned: () => Promise<void> = () => Promise.resolve()
) {
  let processed = 0
  for (let index = 0; index < 100; index++) {
    await assertOwned()
    const advanced = await db().transaction(async (tx) => {
      await tx.select().from(organizations).where(eq(organizations.id, orgId)).for("update")
      const [connected] = await tx
        .select()
        .from(connections)
        .where(and(eq(connections.orgId, orgId), eq(connections.provider, source), eq(connections.externalId, account)))
        .for("share")
      if (!connected) {
        return false
      }
      const [enabled] = await tx
        .select({ id: inventoryUnitMappings.id })
        .from(inventoryUnitMappings)
        .where(
          and(
            eq(inventoryUnitMappings.orgId, orgId),
            eq(inventoryUnitMappings.source, source),
            eq(inventoryUnitMappings.externalAccountId, account),
            eq(inventoryUnitMappings.automatic, true),
            isNull(inventoryUnitMappings.retiredAt)
          )
        )
        .limit(1)
      if (!enabled) {
        return false
      }
      const scope = and(
        eq(inventoryImportCursors.orgId, orgId),
        eq(inventoryImportCursors.source, source),
        eq(inventoryImportCursors.externalAccountId, account)
      )
      const [cursor] = await tx.select().from(inventoryImportCursors).where(scope)
      const [order] = await tx
        .select()
        .from(salesOrders)
        .where(
          and(
            eq(salesOrders.orgId, orgId),
            eq(salesOrders.source, source),
            eq(salesOrders.externalAccountId, account),
            cursor?.afterOrderId ? gt(salesOrders.orderId, cursor.afterOrderId) : undefined
          )
        )
        .orderBy(salesOrders.orderId)
        .limit(1)
        .for("share")
      const checkpoint = {
        orgId,
        source,
        externalAccountId: account,
        afterOrderId: order?.orderId ?? null,
        checkedAt: new Date()
      }
      if (!order) {
        await tx
          .insert(inventoryImportCursors)
          .values(checkpoint)
          .onConflictDoUpdate({
            target: [
              inventoryImportCursors.orgId,
              inventoryImportCursors.source,
              inventoryImportCursors.externalAccountId
            ],
            set: checkpoint
          })
        return false
      }
      const events = await candidates(tx, order)
      const gaps: { code: string; eventId: string }[] = []
      let createdCount = 0,
        unchangedCount = 0
      const seenRecords = new Set<string>()
      if (events.length > 2000) {
        gaps.push({ code: "order_event_limit", eventId: order.orderId })
      } else {
        if (!events.length) {
          gaps.push({ code: "no_confirmed_shipment_events", eventId: order.orderId })
        }
        for (const event of events) {
          try {
            const result = await tx.transaction((nested) => importCandidate(nested, orgId, source, account, event))
            if (result.created) {
              createdCount++
            } else {
              unchangedCount++
            }
            seenRecords.add(result.recordId)
          } catch (error) {
            if (!(error instanceof AnalyticsProblem) && !(error instanceof z.ZodError)) {
              throw error
            }
            if (gaps.length < 100) {
              gaps.push({
                code: error instanceof AnalyticsProblem ? error.code : "invalid_depletion_data",
                eventId: event.eventId
              })
            }
          }
        }
      }
      const existing = await tx
        .select({ id: inventoryBasisRecords.id })
        .from(inventoryBasisRecords)
        .where(
          and(
            eq(inventoryBasisRecords.orgId, orgId),
            eq(inventoryBasisRecords.kind, "depletion"),
            eq(inventoryBasisRecords.createdBy, actor),
            isNull(inventoryBasisRecords.retiredAt),
            sql`${inventoryBasisRecords.data}->'saleEvidence'->>'salesOrderId'=${order.id}`
          )
        )
      if (existing.some((row) => !seenRecords.has(row.id)) && gaps.length < 100) {
        gaps.push({ code: "existing_depletion_requires_review", eventId: order.orderId })
      }
      const result = {
        orgId,
        source,
        externalAccountId: account,
        orderId: order.orderId,
        status: gaps.length ? ("blocked" as const) : ("processed" as const),
        createdCount,
        unchangedCount,
        gaps,
        checkedAt: new Date()
      }
      await tx
        .insert(inventoryImportResults)
        .values(result)
        .onConflictDoUpdate({
          target: [
            inventoryImportResults.orgId,
            inventoryImportResults.source,
            inventoryImportResults.externalAccountId,
            inventoryImportResults.orderId
          ],
          set: result
        })
      await tx
        .insert(inventoryImportCursors)
        .values(checkpoint)
        .onConflictDoUpdate({
          target: [
            inventoryImportCursors.orgId,
            inventoryImportCursors.source,
            inventoryImportCursors.externalAccountId
          ],
          set: checkpoint
        })
      return true
    })
    if (!advanced) {
      break
    }
    processed++
  }
  return { processedOrders: processed, limit: 100 }
}
export const importResultQuery = z.object({
  ...analyticsPagination,
  source: z.enum(["amazon", "shopify"]),
  externalAccountId: z.string().min(1).max(200)
})
export async function listImportResults(orgId: string, input: z.infer<typeof importResultQuery>) {
  return db().transaction(
    async (tx) => {
      const snapshot = await analyticsSnapshot(
        tx,
        orgId,
        input,
        JSON.stringify(["depletion-imports", input.source, input.externalAccountId])
      )
      const rows = await tx
        .select()
        .from(inventoryImportResults)
        .where(
          and(
            eq(inventoryImportResults.orgId, orgId),
            eq(inventoryImportResults.source, input.source),
            eq(inventoryImportResults.externalAccountId, input.externalAccountId)
          )
        )
        .orderBy(desc(inventoryImportResults.checkedAt), inventoryImportResults.orderId)
        .limit(101)
        .offset(input.page * 100)
      const [cursor] = await tx
        .select()
        .from(inventoryImportCursors)
        .where(
          and(
            eq(inventoryImportCursors.orgId, orgId),
            eq(inventoryImportCursors.source, input.source),
            eq(inventoryImportCursors.externalAccountId, input.externalAccountId)
          )
        )
      return {
        results: rows.slice(0, 100),
        hasMore: rows.length > 100,
        page: input.page,
        snapshot,
        cursor: cursor ?? null,
        notes: [
          "Processed describes recorded events only, not complete shipment coverage.",
          "Gap details are limited to 100 per order; blocked orders are revisited on subsequent scan cycles."
        ]
      }
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  )
}
