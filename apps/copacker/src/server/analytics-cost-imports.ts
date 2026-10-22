import { and, eq, isNull } from "drizzle-orm"
import { z } from "zod"
import { db, type Transaction } from "@/db"
import { analyticsCostImports, operatingCosts, organizations, salesOrders, variantFields } from "@/db/schema"
import { inventoryBasisInput } from "@/lib/inventory-basis"
import { landedChargeInput } from "@/lib/landed-allocation"
import { operatingCostInput } from "@/lib/operating-cost"
import { AnalyticsProblem } from "./analytics-contract"
import { saveInventoryBasisInTransaction } from "./inventory-basis"
import { saveLandedChargeInTransaction } from "./inventory-landed-costs"
const item = z.discriminatedUnion("kind", [
  z.strictObject({ id: z.uuid(), kind: z.literal("inventory"), data: inventoryBasisInput }),
  z.strictObject({ id: z.uuid(), kind: z.literal("landed"), data: landedChargeInput }),
  z.strictObject({ id: z.uuid(), kind: z.literal("expense"), data: operatingCostInput })
])
// A cost import's rows, as the request sends them.
export const costImportBatch = z
  .strictObject({ rows: z.array(item).min(1).max(100) })
  .refine((v) => new Set(v.rows.map((r) => r.id)).size === v.rows.length)
async function saveExpense(
  tx: Transaction,
  orgId: string,
  userId: string,
  id: string,
  data: z.infer<typeof operatingCostInput>
) {
  if (Date.parse(data.occurredAt) > Date.now()) {
    throw new AnalyticsProblem(422, "future_event", "Costs must have occurred.")
  }
  const [existing] = await tx.select().from(operatingCosts).where(eq(operatingCosts.id, id))
  if (existing) {
    throw new AnalyticsProblem(409, "record_exists", "Use a new row ID for a new import.")
  }
  const a = data.attribution
  if (a.kind === "order") {
    const [order] = await tx
      .select({ id: salesOrders.id })
      .from(salesOrders)
      .where(and(eq(salesOrders.orgId, orgId), eq(salesOrders.id, a.salesOrderId)))
    if (!order) {
      throw new AnalyticsProblem(422, "order_not_found", "Select an order in this workspace.")
    }
  } else if (a.kind === "product") {
    const [product] = await tx
      .select({ id: variantFields.variantId })
      .from(variantFields)
      .where(
        and(
          eq(variantFields.orgId, orgId),
          eq(variantFields.shopifyDomain, a.shopifyDomain),
          eq(variantFields.variantId, a.variantId)
        )
      )
    if (!product) {
      throw new AnalyticsProblem(422, "product_not_found", "Select a product in this workspace.")
    }
  }
  if (data.supersedes) {
    const [old] = await tx
      .select()
      .from(operatingCosts)
      .where(
        and(eq(operatingCosts.orgId, orgId), eq(operatingCosts.id, data.supersedes), isNull(operatingCosts.retiredAt))
      )
    if (!old) {
      throw new AnalyticsProblem(409, "record_changed", "Refresh before correcting this cost.")
    }
    await tx
      .update(operatingCosts)
      .set({ retiredAt: new Date(), retiredBy: userId })
      .where(eq(operatingCosts.id, old.id))
  }
  const [duplicate] = await tx
    .select({ id: operatingCosts.id })
    .from(operatingCosts)
    .where(
      and(
        eq(operatingCosts.orgId, orgId),
        eq(operatingCosts.sourceReference, data.sourceReference),
        eq(operatingCosts.sourceLine, data.sourceLine),
        isNull(operatingCosts.retiredAt)
      )
    )
  if (duplicate) {
    throw new AnalyticsProblem(409, "duplicate_source", "This bill line is already recorded.")
  }
  await tx
    .insert(operatingCosts)
    .values({ id, orgId, sourceReference: data.sourceReference, sourceLine: data.sourceLine, data, createdBy: userId })
}
async function lockWorkspace(tx: Transaction, orgId: string) {
  const [org] = await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .for("update")
  if (!org) {
    throw new AnalyticsProblem(403, "workspace_unavailable", "Workspace unavailable.")
  }
}
async function saveRows(tx: Transaction, orgId: string, userId: string, input: z.infer<typeof costImportBatch>) {
  for (const row of input.rows) {
    if (row.kind === "inventory") {
      await saveInventoryBasisInTransaction(tx, orgId, userId, row.id, row.data)
    } else if (row.kind === "landed") {
      await saveLandedChargeInTransaction(tx, orgId, userId, row.id, row.data)
    } else {
      await saveExpense(tx, orgId, userId, row.id, row.data)
    }
  }
}
// Throwing through the transaction boundary rolls back inserts and corrections alike.
// Use an invocation-specific sentinel so database and validation errors cannot become successes.
export async function previewAnalyticsCosts(orgId: string, userId: string, raw: unknown) {
  const input = costImportBatch.parse(raw)
  const rollback = new Error("Cost import preview rollback")
  try {
    await db().transaction(async (tx) => {
      await lockWorkspace(tx, orgId)
      await saveRows(tx, orgId, userId, input)
      throw rollback
    })
  } catch (error) {
    if (error !== rollback) {
      throw error
    }
    return { rows: input.rows, count: input.rows.length }
  }
  throw new Error("Cost import preview did not roll back")
}
export async function importAnalyticsCosts(orgId: string, userId: string, key: string, raw: unknown) {
  const input = costImportBatch.parse(raw)
  return db().transaction(async (tx) => {
    await lockWorkspace(tx, orgId)
    const [prior] = await tx.select().from(analyticsCostImports).where(eq(analyticsCostImports.id, key))
    if (prior) {
      if (
        prior.orgId !== orgId ||
        prior.createdBy !== userId ||
        JSON.stringify(costImportBatch.parse(prior.request)) !== JSON.stringify(input)
      ) {
        throw new AnalyticsProblem(409, "idempotency_key_reused", "This key belongs to another import.")
      }
      return { record: prior, replayed: true }
    }
    await saveRows(tx, orgId, userId, input)
    const [record] = await tx
      .insert(analyticsCostImports)
      .values({
        id: key,
        orgId,
        createdBy: userId,
        request: input,
        results: input.rows.map(({ id, kind }) => ({ id, kind }))
      })
      .returning()
    return { record: record!, replayed: false }
  })
}
export async function getCostImport(orgId: string, id: string) {
  const [record] = await db()
    .select()
    .from(analyticsCostImports)
    .where(and(eq(analyticsCostImports.orgId, orgId), eq(analyticsCostImports.id, id)))
  if (!record) {
    throw new AnalyticsProblem(404, "import_not_found", "Import not found.")
  }
  return record
}
