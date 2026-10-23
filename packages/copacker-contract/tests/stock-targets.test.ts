import { describe, expect, it } from "vitest"
import {
  inventoryLocationKey,
  resolveStockTargets,
  variantStockTargetSchema,
  type InventoryLocationRef,
  type LocationGroup,
  type TargetLocation,
  type VariantStockTarget
} from "../src/stock-targets.ts"

const fba: InventoryLocationRef = { provider: "amazon", accountId: "seller-1", scope: "us", externalId: "fba" }
const awd: InventoryLocationRef = { ...fba, externalId: "awd" }
const warehouse: InventoryLocationRef = { provider: "shopify", accountId: "shop-1", scope: "store", externalId: "1" }
const group: LocationGroup = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Amazon",
  locations: [fba, awd]
}
const pooled: VariantStockTarget = {
  id: "00000000-0000-4000-8000-000000000002",
  quantity: 100,
  destination: { kind: "group", groupId: group.id }
}
const single: VariantStockTarget = {
  id: "00000000-0000-4000-8000-000000000003",
  quantity: 20,
  destination: { kind: "location", location: warehouse }
}
const locations: TargetLocation[] = [fba, awd, warehouse].map((ref) => ({
  ref,
  name: ref.externalId,
  role: "authoritative",
  available: true
}))

describe("variant target membership", () => {
  it("rejects ambiguous connector locations and group identities regardless of their order", () => {
    const duplicateLocations = [...locations, { ...locations[0]!, role: "mirror" as const }]
    const duplicateGroups = [group, { ...group, locations: [warehouse] }]
    for (const values of [duplicateLocations, duplicateLocations.toReversed()]) {
      expect(() => resolveStockTargets([pooled], [group], values)).toThrow("unique identities")
    }
    for (const values of [duplicateGroups, duplicateGroups.toReversed()]) {
      expect(() => resolveStockTargets([pooled], values, locations)).toThrow("unique identities")
    }
  })
  it("allows a pooled Amazon target and a distinct warehouse target without requiring every location", () => {
    const result = resolveStockTargets([pooled, single], [group], locations)
    expect(result.issues).toEqual([])
    expect(result.targets[0]?.members).toEqual([fba, awd])
    expect(resolveStockTargets([], [group], locations).targets).toEqual([])
  })

  it("blocks both sides of overlapping single and group targets", () => {
    const result = resolveStockTargets(
      [pooled, { ...single, destination: { kind: "location", location: fba } }],
      [group],
      locations
    )
    expect(result.targets.map((target) => target.issues.map((issue) => issue.code))).toEqual([["overlap"], ["overlap"]])
  })

  it("blocks overlapping groups and duplicate members instead of counting them twice", () => {
    const other = { ...group, id: single.id, locations: [awd, warehouse] }
    expect(
      resolveStockTargets(
        [pooled, { ...single, destination: { kind: "group", groupId: other.id } }],
        [group, other],
        locations
      ).issues.map((issue) => issue.code)
    ).toEqual(["overlap", "overlap"])
    expect(resolveStockTargets([pooled], [{ ...group, locations: [fba, fba] }], locations).issues[0]?.code).toBe(
      "duplicate_location"
    )
  })

  it("does not substitute a different connected account or a missing group", () => {
    expect(resolveStockTargets([pooled], [], locations).issues[0]?.code).toBe("missing_group")
    const changed = locations.map((location) => ({ ...location, ref: { ...location.ref, accountId: "replacement" } }))
    expect(resolveStockTargets([pooled], [group], changed).issues.map((issue) => issue.code)).toEqual([
      "ineligible_location",
      "ineligible_location"
    ])
  })

  it.each(["mirror", "excluded", "unresolved"] as const)("rejects %s observations", (role) => {
    const changed = locations.map((location) => ({ ...location, role }))
    expect(resolveStockTargets([single], [], changed).issues[0]?.code).toBe("ineligible_location")
  })

  it("blocks unavailable members and duplicate target identities", () => {
    expect(
      resolveStockTargets(
        [pooled],
        [group],
        locations.map((location) => ({ ...location, available: false }))
      ).issues
    ).toHaveLength(2)
    expect(resolveStockTargets([single, single], [], locations).issues[0]?.code).toBe("duplicate_target")
  })

  it("keeps identity independent of names and unambiguous when parts contain separators", () => {
    expect(inventoryLocationKey({ ...fba, accountId: "a:b", scope: "c" })).not.toBe(
      inventoryLocationKey({ ...fba, accountId: "a", scope: "b:c" })
    )
    expect(inventoryLocationKey({ ...fba, scope: "eu" })).not.toBe(inventoryLocationKey(fba))
  })

  it("validates quantities without inventing provider-specific target fields", () => {
    expect(variantStockTargetSchema.parse({ ...single, quantity: 0 }).quantity).toBe(0)
    expect(variantStockTargetSchema.safeParse({ ...single, quantity: 1.5 }).success).toBe(false)
    expect(variantStockTargetSchema.safeParse({ ...single, quantity: -1 }).success).toBe(false)
    expect(variantStockTargetSchema.safeParse({ ...single, productId: "product" }).success).toBe(false)
  })
})
