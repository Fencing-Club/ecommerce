import { and, eq, isNull, lt, gt, desc } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { inventoryUnitMappings, organizations, connections } from "@/db/schema"
import { unitMappingInput } from "@/lib/inventory-unit-mapping"
import { AnalyticsProblem, analyticsPagination } from "./analytics-contract"
import { analyticsSnapshot } from "./analytics-snapshot"
export async function saveUnitMapping(orgId: string, userId: string, key: string, raw: unknown) {
  const input = unitMappingInput.parse(raw)
  return db().transaction(async (tx) => {
    await tx.select().from(organizations).where(eq(organizations.id, orgId)).for("update")
    const [replay] = await tx.select().from(inventoryUnitMappings).where(eq(inventoryUnitMappings.id, key))
    if (replay) {
      if (
        replay.orgId !== orgId ||
        replay.createdBy !== userId ||
        JSON.stringify(unitMappingInput.parse(replay.request)) !== JSON.stringify(input)
      ) {
        throw new AnalyticsProblem(409, "idempotency_key_reused", "This key belongs to another write.")
      }
      return { mapping: replay, replayed: true }
    }
    const [account] = await tx
      .select()
      .from(connections)
      .where(
        and(
          eq(connections.orgId, orgId),
          eq(connections.provider, input.source),
          eq(connections.externalId, input.externalAccountId)
        )
      )
    if (!account) {
      throw new AnalyticsProblem(422, "account_unavailable", "Choose the connected source account.")
    }
    if (
      input.source === "shopify" &&
      (input.shopifyDomain !== input.externalAccountId || input.variantId !== input.sourceProductId)
    ) {
      throw new AnalyticsProblem(
        422,
        "product_mismatch",
        "Shopify conversion must retain the fulfilled component variant identity."
      )
    }
    let prior: typeof inventoryUnitMappings.$inferSelect | undefined
    if (input.supersedes) {
      ;[prior] = await tx
        .select()
        .from(inventoryUnitMappings)
        .where(
          and(
            eq(inventoryUnitMappings.orgId, orgId),
            eq(inventoryUnitMappings.id, input.supersedes),
            isNull(inventoryUnitMappings.retiredAt)
          )
        )
      if (!prior) {
        throw new AnalyticsProblem(409, "mapping_changed", "Refresh before correcting this mapping.")
      }
    }
    const overlaps = await tx
      .select()
      .from(inventoryUnitMappings)
      .where(
        and(
          eq(inventoryUnitMappings.orgId, orgId),
          eq(inventoryUnitMappings.source, input.source),
          eq(inventoryUnitMappings.externalAccountId, input.externalAccountId),
          eq(inventoryUnitMappings.sourceProductId, input.sourceProductId),
          isNull(inventoryUnitMappings.retiredAt),
          lt(inventoryUnitMappings.validFrom, new Date(input.validTo)),
          gt(inventoryUnitMappings.validTo, new Date(input.validFrom))
        )
      )
    if (overlaps.some((row) => row.id !== prior?.id)) {
      throw new AnalyticsProblem(409, "mapping_overlap", "An active conversion already covers part of this period.")
    }
    if (prior) {
      await tx
        .update(inventoryUnitMappings)
        .set({ retiredAt: new Date(), retiredBy: userId })
        .where(eq(inventoryUnitMappings.id, prior.id))
    }
    const [mapping] = await tx
      .insert(inventoryUnitMappings)
      .values({
        ...input,
        id: key,
        orgId,
        createdBy: userId,
        validFrom: new Date(input.validFrom),
        validTo: new Date(input.validTo),
        request: input
      })
      .returning()
    return { mapping: mapping!, replayed: false }
  })
}
export async function getUnitMapping(orgId: string, id: string) {
  const [mapping] = await db()
    .select()
    .from(inventoryUnitMappings)
    .where(and(eq(inventoryUnitMappings.orgId, orgId), eq(inventoryUnitMappings.id, id)))
  if (!mapping) {
    throw new AnalyticsProblem(404, "mapping_not_found", "Mapping not found.")
  }
  return mapping
}
export async function retireUnitMapping(orgId: string, userId: string, id: string) {
  await db().transaction(async (tx) => {
    await tx.select().from(organizations).where(eq(organizations.id, orgId)).for("update")
    const [mapping] = await tx
      .select()
      .from(inventoryUnitMappings)
      .where(and(eq(inventoryUnitMappings.orgId, orgId), eq(inventoryUnitMappings.id, id)))
    if (!mapping) {
      throw new AnalyticsProblem(404, "mapping_not_found", "Mapping not found.")
    }
    if (!mapping.retiredAt) {
      await tx
        .update(inventoryUnitMappings)
        .set({ retiredAt: new Date(), retiredBy: userId })
        .where(eq(inventoryUnitMappings.id, id))
    }
  })
}
export const unitMappingQuery = z.object(analyticsPagination)
export async function listUnitMappings(orgId: string, input: z.infer<typeof unitMappingQuery>) {
  return db().transaction(
    async (tx) => {
      const snapshot = await analyticsSnapshot(tx, orgId, input, "unit-mappings")
      const rows = await tx
        .select()
        .from(inventoryUnitMappings)
        .where(eq(inventoryUnitMappings.orgId, orgId))
        .orderBy(desc(inventoryUnitMappings.createdAt), inventoryUnitMappings.id)
        .limit(101)
        .offset(input.page * 100)
      return { mappings: rows.slice(0, 100), page: input.page, hasMore: rows.length > 100, snapshot }
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  )
}
