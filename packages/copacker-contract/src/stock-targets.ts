import { z } from "zod"

const identity = z.string().min(1).max(255)

// Connector-owned identities, not display names or enums of today's supported warehouses.
export const inventoryLocationRefSchema = z.strictObject({
  provider: identity,
  accountId: identity,
  scope: identity,
  externalId: identity
})
export type InventoryLocationRef = z.infer<typeof inventoryLocationRefSchema>

export function inventoryLocationKey(location: InventoryLocationRef) {
  return JSON.stringify([location.provider, location.accountId, location.scope, location.externalId])
}

export const inventoryLocationSchema = z.strictObject({
  ref: inventoryLocationRefSchema,
  name: z.string().min(1).max(255),
  role: z.enum(["authoritative", "mirror", "excluded", "unresolved"]),
  available: z.boolean()
})
export type TargetLocation = z.infer<typeof inventoryLocationSchema>

export const locationGroupSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().trim().min(1).max(100),
  locations: z.array(inventoryLocationRefSchema).min(1).max(100)
})
export type LocationGroup = z.infer<typeof locationGroupSchema>

export const variantStockTargetSchema = z.strictObject({
  id: z.uuid(),
  quantity: z.number().int().min(0).max(1000000),
  destination: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("location"), location: inventoryLocationRefSchema }),
    z.strictObject({ kind: z.literal("group"), groupId: z.uuid() })
  ])
})
export type VariantStockTarget = z.infer<typeof variantStockTargetSchema>

export const variantStockTargetsSchema = z.array(variantStockTargetSchema).max(100)

export type StockTargetIssue = {
  code: "duplicate_target" | "missing_group" | "duplicate_location" | "ineligible_location" | "overlap"
  targetId: string
  locationKey: string | null
}

// Resolve the complete variant before filtering a report. Otherwise filters could conceal an overlapping target.
// Call this again on reads: connector classification and availability can change after a valid save.
export function resolveStockTargets(
  targets: readonly VariantStockTarget[],
  groups: readonly LocationGroup[],
  locations: readonly TargetLocation[]
) {
  const available = new Map(locations.map((location) => [inventoryLocationKey(location.ref), location]))
  const byGroup = new Map(groups.map((group) => [group.id, group]))
  const owners = new Map<string, string>()
  const seen = new Set<string>()
  const issues: StockTargetIssue[] = []
  const resolved = targets.map((target) => {
    if (seen.has(target.id)) {
      issues.push({ code: "duplicate_target", targetId: target.id, locationKey: null })
    }
    seen.add(target.id)
    const destination = target.destination
    const group = destination.kind === "group" ? byGroup.get(destination.groupId) : null
    const members = destination.kind === "location" ? [destination.location] : (group?.locations ?? [])
    if (destination.kind === "group" && !group) {
      issues.push({ code: "missing_group", targetId: target.id, locationKey: null })
    }
    const memberKeys = new Set<string>()
    for (const member of members) {
      const key = inventoryLocationKey(member)
      if (memberKeys.has(key)) {
        issues.push({ code: "duplicate_location", targetId: target.id, locationKey: key })
      }
      memberKeys.add(key)
      const location = available.get(key)
      if (!location || location.role !== "authoritative" || !location.available) {
        issues.push({ code: "ineligible_location", targetId: target.id, locationKey: key })
      }
      const owner = owners.get(key)
      if (owner && owner !== target.id) {
        issues.push({ code: "overlap", targetId: target.id, locationKey: key })
        issues.push({ code: "overlap", targetId: owner, locationKey: key })
      }
      owners.set(key, target.id)
    }
    return { ...target, name: group?.name ?? available.get([...memberKeys][0] ?? "")?.name ?? null, members }
  })
  return {
    targets: resolved.map((target) => ({ ...target, issues: issues.filter((issue) => issue.targetId === target.id) })),
    issues
  }
}
