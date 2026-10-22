import { randomUUID } from "node:crypto"
import {
  inventoryLocationKey,
  resolveStockTargets,
  stockTargetSelectionSchema,
  saveStockTargetsSchema,
  saveLocationGroupSchema,
  removeLocationGroupSchema,
  type TargetLocation,
  type UnassignedStockTarget
} from "@repo/copacker-contract"
import { variantIdSchema } from "@repo/copacker-marketplaces/shopify"
import { and, eq } from "drizzle-orm"
import type { z } from "zod"
import { db, type Executor } from "@/db"
import {
  connections,
  inventoryLocationGroups,
  inventoryLocationMappings,
  organizations,
  stockSnapshots,
  variantStockTargetSets
} from "@/db/schema"
import { can } from "@/lib/access"
import { CliError } from "./cli-auth"
import { stockScopes, inventoryLocationEnabled } from "./inventory-connectors"
import { locationClassifications } from "./inventory-locations"
import type { Session } from "./workspace-session"

function access(s: Session, edit = false) {
  if (s.org.kind !== "buyer" || !can(s, "products", edit ? "edit" : "view")) {
    throw new CliError("forbidden", "Product access is required to manage stock targets.", 403)
  }
}

// Collection capabilities, independent of target membership. Unknown connectors do not become eligible by name.
export async function stockTargetContext(orgId: string, executor: Executor = db(), includeDisabled = false) {
  const accounts = await executor
    .select({
      provider: connections.provider,
      externalId: connections.externalId,
      inventoryLocations: connections.inventoryLocations
    })
    .from(connections)
    .where(eq(connections.orgId, orgId))
  const snapshots = await executor.select().from(stockSnapshots).where(eq(stockSnapshots.orgId, orgId))
  const shopify = accounts.find((account) => account.provider === "shopify")
  const amazon = accounts.find((account) => account.provider === "amazon")
  const stock = snapshots.find(
    (snapshot) =>
      snapshot.source === "shopify" &&
      snapshot.externalAccountId === shopify?.externalId &&
      snapshot.scopeKey === stockScopes.shopify.scopeKey
  )
  const catalog = stock?.data?.source === "shopify" ? stock.data : null
  const mappings = shopify
    ? await executor
        .select()
        .from(inventoryLocationMappings)
        .where(
          and(
            eq(inventoryLocationMappings.orgId, orgId),
            eq(inventoryLocationMappings.shopifyDomain, shopify.externalId)
          )
        )
    : []
  const classifications = locationClassifications(catalog, mappings)
  const locations = new Map<string, TargetLocation>()
  for (const row of catalog?.rows ?? []) {
    for (const level of row.levels) {
      const ref = {
        provider: "shopify",
        accountId: catalog!.shopifyDomain,
        scope: "store",
        externalId: level.locationId
      }
      const classification = classifications.get(level.locationId)
      let role: TargetLocation["role"] = "unresolved"
      if (level.locationKind === "amazon_fulfillment" || classification === "amazon_mirror") {
        role = "mirror"
      } else if (classification === "merchant") {
        role = "authoritative"
      } else if (classification === "excluded") {
        role = "excluded"
      }
      locations.set(inventoryLocationKey(ref), {
        ref,
        name: level.locationName,
        role,
        available: includeDisabled || inventoryLocationEnabled(shopify?.inventoryLocations, ref)
      })
    }
  }
  if (amazon) {
    for (const source of ["fba", "awd"] as const) {
      const ref = {
        provider: "amazon",
        accountId: amazon.externalId,
        scope: stockScopes[source].scopeKey,
        externalId: source
      }
      locations.set(inventoryLocationKey(ref), {
        ref,
        name: source === "fba" ? "FBA" : "AWD US",
        role: "authoritative",
        available:
          (includeDisabled || inventoryLocationEnabled(amazon.inventoryLocations, ref)) &&
          snapshots.some(
            (snapshot) =>
              snapshot.source === source &&
              snapshot.externalAccountId === amazon.externalId &&
              snapshot.scopeKey === ref.scope &&
              snapshot.data?.source === source
          )
      })
    }
  }
  const groups = await executor.select().from(inventoryLocationGroups).where(eq(inventoryLocationGroups.orgId, orgId))
  return { accountId: shopify?.externalId ?? null, catalog, locations: [...locations.values()], groups }
}

async function currentVariant(orgId: string, input: z.infer<typeof stockTargetSelectionSchema>, executor: Executor) {
  if (!variantIdSchema.safeParse(input.variantId).success) {
    throw new CliError("invalid_input", "Choose a Shopify variation.")
  }
  const context = await stockTargetContext(orgId, executor)
  if (
    context.accountId !== input.accountId ||
    !context.catalog?.rows.some((row) => row.variantId === input.variantId)
  ) {
    throw new CliError(
      "source_changed",
      "This variation is not in the connected store's current catalog. Reload products.",
      409
    )
  }
  const where = and(
    eq(variantStockTargetSets.orgId, orgId),
    eq(variantStockTargetSets.shopifyDomain, input.accountId),
    eq(variantStockTargetSets.variantId, input.variantId)
  )
  const [saved] = await executor.select().from(variantStockTargetSets).where(where)
  return { context, saved, where }
}

export async function listLocationGroups(s: Session, executor: Executor = db()) {
  access(s)
  const context = await stockTargetContext(s.org.id, executor)
  return {
    items: context.groups.map(({ id, name, locations, revision }) => ({ id, name, locations, revision })),
    locations: context.locations
  }
}

export async function readStockTargets(s: Session, raw: unknown, executor: Executor = db()) {
  access(s)
  const input = stockTargetSelectionSchema.parse(raw)
  const { context, saved } = await currentVariant(s.org.id, input, executor)
  return {
    accountId: input.accountId,
    variantId: input.variantId,
    revision: saved?.revision ?? 0,
    targets: saved?.targets ?? [],
    unassigned: saved?.unassigned ?? [],
    locations: context.locations,
    groups: context.groups.map(({ id, name, locations, revision }) => ({ id, name, locations, revision })),
    issues: resolveStockTargets(saved?.targets ?? [], context.groups, context.locations).issues
  }
}

// One workspace lock serializes group membership and variant edits. Provider reconnect/classification writes lock
// the connection; taking those locks as well keeps eligibility stable until this transaction commits.
async function lock(orgId: string, executor: Executor) {
  await executor.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, orgId)).for("update")
  await executor
    .select({ id: connections.id })
    .from(connections)
    .where(eq(connections.orgId, orgId))
    .orderBy(connections.id)
    .for("update")
}
function valid(
  targets: Parameters<typeof resolveStockTargets>[0],
  context: Awaited<ReturnType<typeof stockTargetContext>>
) {
  const result = resolveStockTargets(targets, context.groups, context.locations)
  if (result.issues.length) {
    throw new CliError(
      "invalid_target",
      "Choose available, authoritative locations. Targets for this variation cannot overlap.",
      409
    )
  }
}

export async function saveStockTargets(s: Session, raw: unknown, executor: Executor = db()) {
  access(s, true)
  const input = saveStockTargetsSchema.parse(raw)
  return executor.transaction(async (tx) => {
    await lock(s.org.id, tx)
    const { context, saved } = await currentVariant(s.org.id, input, tx)
    if ((saved?.revision ?? 0) !== input.expectedRevision) {
      throw new CliError("revision_conflict", "Stock targets changed. Reload before saving.", 409)
    }
    valid(input.targets, context)
    const values = {
      targets: input.targets,
      unassigned: input.resolveImported ? [] : (saved?.unassigned ?? []),
      revision: input.expectedRevision + 1
    }
    await tx
      .insert(variantStockTargetSets)
      .values({ orgId: s.org.id, shopifyDomain: input.accountId, variantId: input.variantId, ...values })
      .onConflictDoUpdate({
        target: [variantStockTargetSets.orgId, variantStockTargetSets.shopifyDomain, variantStockTargetSets.variantId],
        set: values
      })
    return readStockTargets(s, { accountId: input.accountId, variantId: input.variantId }, tx)
  })
}

export async function saveLocationGroup(s: Session, raw: unknown, executor: Executor = db()) {
  access(s, true)
  const input = saveLocationGroupSchema.parse(raw)
  return executor.transaction(async (tx) => {
    await lock(s.org.id, tx)
    const context = await stockTargetContext(s.org.id, tx)
    const previous = context.groups.find((group) => group.id === input.id)
    if ((previous?.revision ?? 0) !== input.expectedRevision) {
      throw new CliError("revision_conflict", "This location group changed. Reload before saving.", 409)
    }
    const group = { id: input.id, name: input.name, locations: input.locations, revision: input.expectedRevision + 1 }
    const updated = {
      ...context,
      groups: [
        ...context.groups.filter((candidate) => candidate.id !== group.id),
        { ...group, orgId: s.org.id, updatedAt: new Date() }
      ]
    }
    valid([{ id: randomUUID(), quantity: 0, destination: { kind: "group", groupId: group.id } }], updated)
    const sets = await tx.select().from(variantStockTargetSets).where(eq(variantStockTargetSets.orgId, s.org.id))
    for (const set of sets) {
      if (
        set.targets.some((target) => target.destination.kind === "group" && target.destination.groupId === group.id)
      ) {
        const issues = resolveStockTargets(set.targets, updated.groups, updated.locations).issues
        if (issues.some((issue) => issue.code === "overlap")) {
          throw new CliError(
            "target_overlap",
            "These members overlap another target on an affected variation. Edit its targets first.",
            409
          )
        }
      }
    }
    if (previous) {
      await tx
        .update(inventoryLocationGroups)
        .set(group)
        .where(and(eq(inventoryLocationGroups.orgId, s.org.id), eq(inventoryLocationGroups.id, group.id)))
    } else {
      const [other] = await tx
        .select({ id: inventoryLocationGroups.id })
        .from(inventoryLocationGroups)
        .where(eq(inventoryLocationGroups.id, group.id))
      if (other) {
        throw new CliError("revision_conflict", "Choose a new group identity.", 409)
      }
      await tx.insert(inventoryLocationGroups).values({ ...group, orgId: s.org.id })
    }
    return group
  })
}

export async function removeLocationGroup(s: Session, raw: unknown, executor: Executor = db()) {
  access(s, true)
  const input = removeLocationGroupSchema.parse(raw)
  return executor.transaction(async (tx) => {
    await lock(s.org.id, tx)
    const where = and(eq(inventoryLocationGroups.orgId, s.org.id), eq(inventoryLocationGroups.id, input.id))
    const [group] = await tx.select().from(inventoryLocationGroups).where(where)
    if (!group || group.revision !== input.expectedRevision) {
      throw new CliError("revision_conflict", "This location group changed. Reload before removing it.", 409)
    }
    const sets = await tx.select().from(variantStockTargetSets).where(eq(variantStockTargetSets.orgId, s.org.id))
    if (
      sets.some((set) =>
        set.targets.some((target) => target.destination.kind === "group" && target.destination.groupId === input.id)
      )
    ) {
      throw new CliError("group_in_use", "Remove this group's variation targets before deleting it.", 409)
    }
    await tx.delete(inventoryLocationGroups).where(where)
    return { id: input.id }
  })
}

export async function preserveImportedStockTargets(
  orgId: string,
  accountId: string,
  values: readonly { variantId: string; amazonStockTarget: number | null; storeStockTarget: number | null }[],
  executor: Executor = db()
) {
  for (const value of values) {
    const unassigned: UnassignedStockTarget[] = []
    if (value.amazonStockTarget !== null) {
      unassigned.push({ source: "amazon", quantity: value.amazonStockTarget })
    }
    if (value.storeStockTarget !== null) {
      unassigned.push({ source: "store", quantity: value.storeStockTarget })
    }
    if (unassigned.length) {
      await executor
        .insert(variantStockTargetSets)
        .values({ orgId, shopifyDomain: accountId, variantId: value.variantId, unassigned })
        .onConflictDoNothing()
    }
  }
}
