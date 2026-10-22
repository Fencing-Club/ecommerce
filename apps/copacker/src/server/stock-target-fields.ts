import { randomUUID } from "node:crypto"
import {
  resolveStockTargets,
  type LocationGroup,
  type UnassignedStockTarget,
  type VariantStockTarget
} from "@repo/copacker-contract"
import { and, eq } from "drizzle-orm"
import { type Executor } from "@/db"
import { variantStockTargetSets } from "@/db/schema"
import { StatusError } from "./errors"
import { stockTargetContext } from "./stock-targets"

type TargetSet = Pick<typeof variantStockTargetSets.$inferSelect, "targets" | "unassigned">
const fields = ["amazonStockTarget", "storeStockTarget"] as const
type Fields = Record<(typeof fields)[number], number | null>

function candidates(set: TargetSet, groups: readonly LocationGroup[], field: keyof Fields) {
  const provider = field === "amazonStockTarget" ? "amazon" : "shopify"
  return resolveStockTargets(set.targets, groups, []).targets.filter(
    (target) => target.members.length > 0 && target.members.every((member) => member.provider === provider)
  )
}

// Existing field responses retain their shape. Multiple independent targets have no single editable scalar.
export function stockTargetFields(set: TargetSet, groups: readonly LocationGroup[]): Fields {
  const value = (field: keyof Fields) => {
    const targets = candidates(set, groups, field)
    const source = field === "amazonStockTarget" ? "amazon" : "store"
    if (targets.length === 1) {
      return targets[0]!.quantity
    }
    if (targets.length) {
      return null
    }
    return set.unassigned.find((value) => value.source === source)?.quantity ?? null
  }
  return { amazonStockTarget: value("amazonStockTarget"), storeStockTarget: value("storeStockTarget") }
}

// Save through the existing product form without replacing memberships or overwriting unrelated targets.
// A scalar with no unambiguous destination is retained for assignment, never cloned across locations.
export async function writeStockTargetFields(
  orgId: string,
  domain: string,
  variantId: string,
  input: Partial<Fields>,
  previous: Fields,
  executor: Executor
) {
  if (fields.every((field) => input[field] === undefined || input[field] === previous[field])) {
    return
  }
  const context = await stockTargetContext(orgId, executor)
  const where = and(
    eq(variantStockTargetSets.orgId, orgId),
    eq(variantStockTargetSets.shopifyDomain, domain),
    eq(variantStockTargetSets.variantId, variantId)
  )
  const [saved] = await executor.select().from(variantStockTargetSets).where(where)
  let targets: VariantStockTarget[] = [...(saved?.targets ?? [])]
  let unassigned: UnassignedStockTarget[] = [...(saved?.unassigned ?? [])]
  for (const field of fields) {
    const quantity = input[field]
    if (quantity === undefined || quantity === previous[field]) {
      continue
    }
    const source = field === "amazonStockTarget" ? "amazon" : "store"
    const existing = candidates({ targets, unassigned }, context.groups, field)
    if (existing.length > 1) {
      throw new StatusError("checkValues", 409)
    }
    const match = existing[0]
    unassigned = unassigned.filter((value) => value.source !== source)
    if (match) {
      targets = targets.flatMap((target) => {
        if (target.id !== match.id) {
          return [target]
        }
        if (quantity === null) {
          return []
        }
        return [{ ...target, quantity, ...(source === "amazon" && { stocked: quantity !== 0 }) }]
      })
    } else if (quantity !== null) {
      const locations = context.locations.filter(
        (location) =>
          location.ref.provider === (source === "amazon" ? "amazon" : "shopify") &&
          location.role === "authoritative" &&
          location.available
      )
      if ((source === "amazon" && locations.length === 2) || (source === "store" && locations.length === 1)) {
        const target: VariantStockTarget = {
          id: randomUUID(),
          quantity,
          ...(source === "amazon" && { stocked: quantity !== 0 }),
          destination: { kind: "pool", locations: locations.map((location) => location.ref) }
        }
        const proposed = [...targets, target]
        if (resolveStockTargets(proposed, context.groups, context.locations).issues.length) {
          throw new StatusError("checkValues", 409)
        }
        targets = proposed
      } else {
        unassigned.push({ source, quantity })
      }
    }
  }
  await executor
    .insert(variantStockTargetSets)
    .values({ orgId, shopifyDomain: domain, variantId, targets, unassigned, revision: (saved?.revision ?? 0) + 1 })
    .onConflictDoUpdate({
      target: [variantStockTargetSets.orgId, variantStockTargetSets.shopifyDomain, variantStockTargetSets.variantId],
      set: { targets, unassigned, revision: (saved?.revision ?? 0) + 1 }
    })
}
