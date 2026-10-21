import { describe, expect, it } from "vitest"
import { type CartonRule, cartonPolicies } from "../src/carton-policies"
import { type PalletRule, palletPolicies } from "../src/pallet-policies"

// The numbers a rule holds cartons or pallets to, as its description should state them.
function limits(rule: CartonRule | PalletRule): number[] {
  switch (rule.type) {
    case "maxSize":
    case "footprint":
      return [...rule.sides]
    case "maxWeight":
      return [rule.weight]
    case "maxUnits":
      return [rule.units]
    case "maxHeight":
      return [rule.height, ...(rule.stackable === undefined ? [] : [rule.stackable])]
    default:
      return []
  }
}

const rules = [
  ...Object.values(cartonPolicies).flatMap((policy) =>
    policy.rules.map((rule) => ({ receiver: policy.receiver, rule }))
  ),
  ...Object.values(palletPolicies).flatMap((policy) =>
    policy.rules.map((rule) => ({ receiver: policy.receiver, rule }))
  )
]

// Each rule describes itself, so the policies read as documentation; a changed limit fails here until its description
// says so too.
describe("rule descriptions", () => {
  it.each(rules)("$receiver $rule.type states its limits", ({ rule }) => {
    expect(rule.description.length).toBeGreaterThan(0)
    for (const limit of limits(rule)) {
      expect(rule.description).toContain(limit.toLocaleString("en-US"))
    }
  })
})
