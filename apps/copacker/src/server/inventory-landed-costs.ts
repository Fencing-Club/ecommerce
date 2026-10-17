import { createHash } from "node:crypto"
import { and, eq, isNull, inArray, sql, desc } from "drizzle-orm"
import { z } from "zod"
import { db, type Transaction } from "@/db"
import { inventoryBasisRecords, inventoryLandedCharges, organizations, landedCosts, orders } from "@/db/schema"
import { inventoryMicros } from "@/lib/inventory-money"
import { allocateLandedCharge, landedChargeInput, type LandedAllocation } from "@/lib/landed-allocation"
import { AnalyticsProblem, analyticsPagination } from "./analytics-contract"
import { analyticsSnapshot } from "./analytics-snapshot"
type Reader = Pick<ReturnType<typeof db>, "select" | "execute">
function problem(status: number, code: string, detail: string): never {
  throw new AnalyticsProblem(status, code, detail)
}
export async function assertNoLandedDependencies(
  tx: Pick<ReturnType<typeof db>, "select">,
  orgId: string,
  purchaseId: string
) {
  const rows = await tx
    .select({ id: inventoryLandedCharges.id })
    .from(inventoryLandedCharges)
    .where(
      and(
        eq(inventoryLandedCharges.orgId, orgId),
        isNull(inventoryLandedCharges.retiredAt),
        sql`${inventoryLandedCharges.allocations} @> ${JSON.stringify([{ purchaseId }])}::jsonb`
      )
    )
    .limit(1)
  if (rows.length) {
    problem(
      409,
      "landed_charges_depend_on_purchase",
      "Retire or reallocate the linked landed charges before replacing this purchase."
    )
  }
}
async function validateValues(tx: Reader, orgId: string, old: LandedAllocation[], next: LandedAllocation[]) {
  const ids = [...new Set([...old, ...next].map((row) => row.purchaseId))]
  if (!ids.length) {
    return
  }
  const purchases = await tx
    .select()
    .from(inventoryBasisRecords)
    .where(
      and(
        eq(inventoryBasisRecords.orgId, orgId),
        inArray(inventoryBasisRecords.id, ids),
        eq(inventoryBasisRecords.kind, "purchase"),
        isNull(inventoryBasisRecords.retiredAt)
      )
    )
  const result = await tx.execute(
    sql`select a->>'purchaseId' as id, sum((a->>'amount')::numeric)::text as amount from inventory_landed_charges c cross join lateral jsonb_array_elements(c.allocations) a where c."orgId"=${orgId} and c."retiredAt" is null group by a->>'purchaseId'`
  )
  const totals = new Map(
    z
      .array(z.object({ id: z.string(), amount: z.string() }))
      .parse(result.rows)
      .map((row) => [row.id, inventoryMicros(row.amount)])
  )
  for (const purchase of purchases) {
    const base = purchase.data.totalCost
    if (!base) {
      problem(422, "missing_purchase_value", "Purchase cost is missing.")
    }
    const value =
      inventoryMicros(base.amount) +
      (totals.get(purchase.id) ?? 0n) -
      old.filter((row) => row.purchaseId === purchase.id).reduce((sum, row) => sum + inventoryMicros(row.amount), 0n) +
      next.filter((row) => row.purchaseId === purchase.id).reduce((sum, row) => sum + inventoryMicros(row.amount), 0n)
    if (value < 0n) {
      problem(422, "negative_landed_value", "Credits cannot make a purchase's landed value negative.")
    }
  }
}
export async function saveLandedCharge(orgId: string, userId: string, key: string, raw: unknown) {
  return db().transaction((tx) => saveLandedChargeInTransaction(tx, orgId, userId, key, raw))
}
export async function saveLandedChargeInTransaction(
  tx: Transaction,
  orgId: string,
  userId: string,
  key: string,
  raw: unknown
) {
  const input = landedChargeInput.parse(raw)
  const [org] = await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .for("update")
  if (!org) {
    return problem(403, "workspace_unavailable", "Workspace unavailable.")
  }
  const [replay] = await tx.select().from(inventoryLandedCharges).where(eq(inventoryLandedCharges.id, key))
  if (replay) {
    if (
      replay.orgId !== orgId ||
      replay.createdBy !== userId ||
      JSON.stringify(landedChargeInput.parse(replay.data)) !== JSON.stringify(input)
    ) {
      return problem(409, "idempotency_key_reused", "This request key belongs to another write.")
    }
    return { charge: replay, replayed: true }
  }
  if (Date.parse(input.occurredAt) > Date.now()) {
    return problem(422, "future_event", "Record a bill that has already occurred.")
  }
  const scope = eq(inventoryLandedCharges.orgId, orgId)
  let old: typeof inventoryLandedCharges.$inferSelect | undefined
  if (input.supersedes) {
    ;[old] = await tx
      .select()
      .from(inventoryLandedCharges)
      .where(and(scope, eq(inventoryLandedCharges.id, input.supersedes), isNull(inventoryLandedCharges.retiredAt)))
    if (!old) {
      return problem(409, "record_changed", "Refresh before correcting this bill.")
    }
  }
  let sourceIdentity = [input.sourceReference, input.sourceLine]
  let sourceOrderId: string | undefined
  if (input.poLandedCostId) {
    const [source] = await tx
      .select({ cost: landedCosts, order: orders })
      .from(landedCosts)
      .innerJoin(orders, eq(orders.id, landedCosts.orderId))
      .where(and(eq(landedCosts.id, input.poLandedCostId), eq(orders.buyerOrgId, orgId)))
    if (!source) {
      return problem(404, "landed_source_not_found", "PO landed-cost entry not found.")
    }
    if (
      inventoryMicros(input.amount) !== BigInt(source.cost.amountMinor) * 10000n ||
      input.currency !== source.order.data.currency ||
      input.category !== source.cost.kind
    ) {
      return problem(
        409,
        "landed_source_changed",
        "Amount, currency or category differs from the PO's recorded bill. Refresh before importing."
      )
    }
    sourceIdentity = ["po_landed_cost", source.cost.id]
    sourceOrderId = source.order.id
  }
  const sourceKey = createHash("sha256").update(JSON.stringify(sourceIdentity)).digest("hex")
  const duplicates = await tx
    .select({ id: inventoryLandedCharges.id })
    .from(inventoryLandedCharges)
    .where(and(scope, eq(inventoryLandedCharges.sourceKey, sourceKey), isNull(inventoryLandedCharges.retiredAt)))
  if (duplicates.some((row) => row.id !== old?.id)) {
    return problem(409, "source_already_recorded", "This bill line is already recorded.")
  }
  const purchases = await tx
    .select()
    .from(inventoryBasisRecords)
    .where(
      and(
        eq(inventoryBasisRecords.orgId, orgId),
        eq(inventoryBasisRecords.kind, "purchase"),
        isNull(inventoryBasisRecords.retiredAt),
        inArray(
          inventoryBasisRecords.id,
          input.targets.map((target) => target.purchaseId)
        )
      )
    )
  if (sourceOrderId && purchases.some((row) => row.data.purchaseOrder?.orderId !== sourceOrderId)) {
    return problem(422, "purchase_order_mismatch", "Allocate this PO bill only to purchases from that order.")
  }
  if (purchases.length !== input.targets.length) {
    return problem(404, "purchase_not_found", "An active purchase was not found.")
  }
  if (purchases.some((row) => row.data.totalCost?.currency !== input.currency)) {
    return problem(
      422,
      "currency_mismatch",
      "Allocate bills only to purchases in the same currency. Record explicit converted evidence separately."
    )
  }
  let allocations: LandedAllocation[]
  if (input.basis === "manual") {
    allocations = input.targets.map((target) => ({ purchaseId: target.purchaseId, amount: target.amount! }))
    const total = inventoryMicros(input.amount)
    if (
      allocations.reduce((sum, row) => sum + inventoryMicros(row.amount), 0n) !== total ||
      allocations.some((row) => inventoryMicros(row.amount) * total < 0n) ||
      (total === 0n && allocations.some((row) => inventoryMicros(row.amount) !== 0n))
    ) {
      return problem(
        422,
        "allocation_mismatch",
        "Manual shares must have the bill's sign and sum exactly to its amount."
      )
    }
  } else {
    const targets = purchases.map((row) => ({
      purchaseId: row.id,
      weight: input.basis === "pieces" ? BigInt(row.quantity) : inventoryMicros(row.data.totalCost!.amount)
    }))
    if (targets.every((row) => row.weight === 0n)) {
      return problem(422, "zero_allocation_basis", "Choose a positive allocation basis.")
    }
    allocations = allocateLandedCharge(input.amount, targets)
  }
  await validateValues(tx, orgId, old?.allocations ?? [], allocations)
  if (old) {
    await tx
      .update(inventoryLandedCharges)
      .set({ retiredAt: new Date(), retiredBy: userId })
      .where(eq(inventoryLandedCharges.id, old.id))
  }
  const [charge] = await tx
    .insert(inventoryLandedCharges)
    .values({
      id: key,
      orgId,
      sourceKey,
      occurredAt: new Date(input.occurredAt),
      data: input,
      allocations,
      createdBy: userId,
      supersedes: input.supersedes
    })
    .returning()
  return { charge: charge!, replayed: false }
}
export async function getLandedCharge(orgId: string, id: string) {
  const [charge] = await db()
    .select()
    .from(inventoryLandedCharges)
    .where(and(eq(inventoryLandedCharges.orgId, orgId), eq(inventoryLandedCharges.id, id)))
  if (!charge) {
    return problem(404, "record_not_found", "Bill not found.")
  }
  return charge
}
export async function retireLandedCharge(orgId: string, userId: string, id: string) {
  return db().transaction(async (tx) => {
    await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, orgId)).for("update")
    const [charge] = await tx
      .select()
      .from(inventoryLandedCharges)
      .where(and(eq(inventoryLandedCharges.orgId, orgId), eq(inventoryLandedCharges.id, id)))
    if (!charge) {
      return problem(404, "record_not_found", "Bill not found.")
    }
    if (charge.retiredAt) {
      return
    }
    await validateValues(tx, orgId, charge.allocations, [])
    await tx
      .update(inventoryLandedCharges)
      .set({ retiredAt: new Date(), retiredBy: userId })
      .where(eq(inventoryLandedCharges.id, id))
  })
}
export const landedChargeQuery = z.object(analyticsPagination)
export async function listLandedCharges(orgId: string, input: z.infer<typeof landedChargeQuery>) {
  return db().transaction(
    async (tx) => {
      const snapshot = await analyticsSnapshot(tx, orgId, input, "landed-charges")
      const rows = await tx
        .select()
        .from(inventoryLandedCharges)
        .where(eq(inventoryLandedCharges.orgId, orgId))
        .orderBy(desc(inventoryLandedCharges.occurredAt), inventoryLandedCharges.id)
        .limit(101)
        .offset(input.page * 100)
      return { charges: rows.slice(0, 100), page: input.page, hasMore: rows.length > 100, snapshot }
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  )
}
