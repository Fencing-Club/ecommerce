import type { ShopifyLocationKind } from "@repo/aisle/shopify"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { connections, inventoryLocationMappings, stockSnapshots } from "@/db/schema"
import type { Session } from "./auth"
import { automaticClassification, locationClassifications, locationMappingSchema } from "./inventory-locations"

export class LocationSettingsError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 403 | 409
  ) {
    super(message)
  }
}

export async function readLocationMappings(s: Session) {
  if (s.org.kind !== "buyer") {
    throw new LocationSettingsError("A buyer workspace is required", 403)
  }
  return db().transaction(
    async (tx) => {
      const [account] = await tx
        .select({ domain: connections.externalId })
        .from(connections)
        .where(and(eq(connections.orgId, s.org.id), eq(connections.provider, "shopify")))
      if (!account) {
        return { shopifyDomain: null, snapshotId: null, observedAt: null, locations: [], unobservedLocationIds: [] }
      }
      const [stock] = await tx
        .select()
        .from(stockSnapshots)
        .where(
          and(
            eq(stockSnapshots.orgId, s.org.id),
            eq(stockSnapshots.source, "shopify"),
            eq(stockSnapshots.externalAccountId, account.domain),
            eq(stockSnapshots.scopeKey, "store")
          )
        )
      const settings = await tx
        .select()
        .from(inventoryLocationMappings)
        .where(
          and(
            eq(inventoryLocationMappings.orgId, s.org.id),
            eq(inventoryLocationMappings.shopifyDomain, account.domain)
          )
        )
      const names = new Map<string, string>(),
        kinds = new Map<string, ShopifyLocationKind | undefined>()
      if (stock?.data?.source === "shopify") {
        for (const row of stock.data.rows) {
          for (const level of row.levels) {
            names.set(level.locationId, level.locationName)
            kinds.set(level.locationId, level.locationKind)
          }
        }
      }
      const saved = new Map(settings.map((setting) => [setting.locationId, setting]))
      return {
        shopifyDomain: account.domain,
        snapshotId: stock?.snapshotId ?? null,
        observedAt: stock?.data?.observedAt ?? null,
        locations: [...names]
          .map(([locationId, name]) => {
            const automatic = automaticClassification(kinds.get(locationId))
            return {
              locationId,
              name,
              kind: kinds.get(locationId) ?? null,
              // The saved choice when there is one; automatic says what applies without it.
              classification: saved.get(locationId)?.classification ?? automatic,
              automatic,
              saved: saved.has(locationId),
              revision: saved.get(locationId)?.revision ?? 0
            }
          })
          .sort((a, b) => a.locationId.localeCompare(b.locationId)),
        unobservedLocationIds: settings
          .filter((setting) => !names.has(setting.locationId))
          .map((setting) => setting.locationId)
          .sort()
      }
    },
    { isolationLevel: "repeatable read" }
  )
}

const inputSchema = locationMappingSchema
  .pick({ locationId: true, classification: true })
  .extend({
    snapshotId: z.uuid(),
    expectedRevision: z.number().int().nonnegative()
  })
  .strict()

export async function saveLocationMapping(s: Session, input: unknown) {
  if (s.org.kind !== "buyer") {
    throw new LocationSettingsError("A buyer workspace is required", 403)
  }
  const data = inputSchema.parse(input)
  return db().transaction(async (tx) => {
    // Serialize mapping saves and reconnects on the tenant's existing connection.
    const [account] = await tx
      .select()
      .from(connections)
      .where(and(eq(connections.orgId, s.org.id), eq(connections.provider, "shopify")))
      .for("update")
    if (!account) {
      throw new LocationSettingsError("Connect Shopify before assigning inventory locations", 409)
    }
    const [stock] = await tx
      .select()
      .from(stockSnapshots)
      .where(
        and(
          eq(stockSnapshots.orgId, s.org.id),
          eq(stockSnapshots.source, "shopify"),
          eq(stockSnapshots.externalAccountId, account.externalId),
          eq(stockSnapshots.scopeKey, "store")
        )
      )
      .for("update")
    if (!stock || stock.snapshotId !== data.snapshotId || stock.data?.source !== "shopify") {
      throw new LocationSettingsError("Inventory changed; reload before assigning locations", 409)
    }
    if (!stock.data.rows.some((row) => row.levels.some((level) => level.locationId === data.locationId))) {
      throw new LocationSettingsError("Location is not present in this store's inventory", 400)
    }
    const scope = and(
      eq(inventoryLocationMappings.orgId, s.org.id),
      eq(inventoryLocationMappings.shopifyDomain, account.externalId),
      eq(inventoryLocationMappings.locationId, data.locationId)
    )
    const [previous] = await tx.select().from(inventoryLocationMappings).where(scope)
    if ((previous?.revision ?? 0) !== data.expectedRevision) {
      throw new LocationSettingsError("Location settings changed; reload before saving", 409)
    }
    const value = {
      orgId: s.org.id,
      shopifyDomain: account.externalId,
      locationId: data.locationId,
      classification: data.classification,
      revision: data.expectedRevision + 1
    }
    await tx
      .insert(inventoryLocationMappings)
      .values(value)
      .onConflictDoUpdate({
        target: [
          inventoryLocationMappings.orgId,
          inventoryLocationMappings.shopifyDomain,
          inventoryLocationMappings.locationId
        ],
        set: { classification: value.classification, revision: value.revision }
      })
    return value
  })
}

// The classification of every location in the store's latest stock snapshot, for inventory and sales.
export async function effectiveLocationClassifications(orgId: string, shopifyDomain: string) {
  const [stock] = await db()
    .select({ data: stockSnapshots.data })
    .from(stockSnapshots)
    .where(
      and(
        eq(stockSnapshots.orgId, orgId),
        eq(stockSnapshots.source, "shopify"),
        eq(stockSnapshots.externalAccountId, shopifyDomain),
        eq(stockSnapshots.scopeKey, "store")
      )
    )
  const saved = await db()
    .select()
    .from(inventoryLocationMappings)
    .where(and(eq(inventoryLocationMappings.orgId, orgId), eq(inventoryLocationMappings.shopifyDomain, shopifyDomain)))
  return locationClassifications(stock?.data?.source === "shopify" ? stock.data : null, saved)
}
