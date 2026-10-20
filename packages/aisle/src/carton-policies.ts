import type { AmazonNetwork, OrderItem } from "./index"

// A rule a receiver sets for its cartons, as data. A policy is the list of rules one receiver's cartons follow, such as
// FBA's or AWD's, and each rule type has one evaluator (checkCarton), so a new receiver, such as GWD or a 3PL, is a new
// policy, and only a new kind of limit needs code. Limits are in the units the receiver states them in.
export type CartonRule =
  // The largest carton, as its three sides from longest to shortest. A carton may fit it in any orientation.
  | { type: "maxSize"; sides: readonly [number, number, number]; unit: "cm" | "in"; exceptOneUnit?: boolean }
  | { type: "maxWeight"; weight: number; unit: "kg" | "lb"; exceptOneUnit?: boolean }
  // Sellable units of one product in a carton.
  | { type: "maxUnits"; units: number }
  | { type: "oneSku" }
  // Every carton of a SKU holds the same units and has the same size and weight as its first.
  | { type: "samePacking" }
  // Every product has its ASIN and FNSKU.
  | { type: "amazonIds" }

export type CartonPolicy = {
  // Who receives the cartons, as messages name it, such as "AWD allows up to 63.5 cm".
  receiver: string
  // In the order checklists list them.
  rules: readonly CartonRule[]
}

// Amazon's US carton rules for each network, checked October 19, 2026 (see the package's docs/carton-rules.md). Every FBA carton is
// treated as individual units: copacker doesn't send case packs.
export const cartonPolicies: Record<AmazonNetwork, CartonPolicy> = {
  fba: {
    receiver: "FBA",
    rules: [
      { type: "maxSize", sides: [36, 25, 25], unit: "in", exceptOneUnit: true },
      { type: "maxWeight", weight: 50, unit: "lb", exceptOneUnit: true },
      { type: "amazonIds" }
    ]
  },
  awd_us: {
    receiver: "AWD",
    rules: [
      { type: "oneSku" },
      { type: "maxUnits", units: 150 },
      { type: "samePacking" },
      { type: "maxSize", sides: [25, 25, 25], unit: "in" },
      { type: "maxWeight", weight: 50, unit: "lb" },
      { type: "amazonIds" }
    ]
  }
}

const centimetresPerInch = 2.54
const kilogramsPerPound = 0.45359237
// Drops floating-point noise from a conversion, so 36 in is 91.44 cm, not 91.44000000000001.
const exact = (value: number) => Number(value.toPrecision(12))

// A size limit in both units, longest side first, and whether every side is the same, as messages put it.
export function sizeLimit(rule: Extract<CartonRule, { type: "maxSize" }>) {
  const cm = rule.sides.map((side) => exact(rule.unit === "cm" ? side : side * centimetresPerInch))
  const inches = rule.sides.map((side) => exact(rule.unit === "in" ? side : side / centimetresPerInch))
  return {
    shape: cm.every((side) => side === cm[0]) ? ("cube" as const) : ("box" as const),
    lengthCm: cm[0]!,
    widthCm: cm[1]!,
    heightCm: cm[2]!,
    lengthIn: inches[0]!,
    widthIn: inches[1]!,
    heightIn: inches[2]!
  }
}

// A weight limit in both units.
export function weightLimit(rule: Extract<CartonRule, { type: "maxWeight" }>) {
  return {
    maxKg: exact(rule.unit === "kg" ? rule.weight : rule.weight * kilogramsPerPound),
    maxLb: exact(rule.unit === "lb" ? rule.weight : rule.weight / kilogramsPerPound)
  }
}

// What a policy allows, for copy that states its rules: its size and weight limits in both units, the units of one
// product a carton may hold, whether a carton holds one SKU and every carton of a SKU is packed the same way, and whether
// a carton holding one unit may be larger.
export function cartonLimits(policy: CartonPolicy) {
  const rule = <T extends CartonRule["type"]>(type: T) =>
    policy.rules.find((candidate): candidate is Extract<CartonRule, { type: T }> => candidate.type === type)
  const size = rule("maxSize")
  const weight = rule("maxWeight")
  return {
    size: size ? sizeLimit(size) : null,
    weight: weight ? weightLimit(weight) : null,
    maxUnits: rule("maxUnits")?.units ?? null,
    oneSku: Boolean(rule("oneSku")),
    samePacking: Boolean(rule("samePacking")),
    exceptOneUnit: Boolean(size?.exceptOneUnit || weight?.exceptOneUnit)
  }
}

// A rule a carton breaks, as a code and the values its message names.
export type CartonRuleIssue =
  | { code: "cartonSize"; values: { receiver: string } & ReturnType<typeof sizeLimit> }
  | { code: "cartonWeight"; values: { receiver: string } & ReturnType<typeof weightLimit> }
  | { code: "unitsPerCarton"; values: { receiver: string; sku: string; units: number; max: number } }
  | { code: "oneSku"; values: { receiver: string } }
  // The SKU's first carton, which every other carton of it must match.
  | {
      code: "samePacking"
      values: { sku: string; units: number; length: number; width: number; height: number; weight: number }
    }
  | { code: "missingAmazonIds"; values: { sku: string } }

export type CartonField = "length" | "width" | "height" | "weight"

// A carton as its policy checks it: its size and weight, and each product's PO line, pieces and sellable units.
export type PolicyCarton = {
  length: number
  width: number
  height: number
  weight: number
  contents: Array<{ item: OrderItem; pieces: number; units: number }>
}

type Finding = { issue: CartonRuleIssue; fields?: CartonField[] }

// The rules of a policy a carton breaks, with the fields each names. `earlier` are the cartons checked under the same
// policy before this one, for rules across cartons.
export function checkCarton(policy: CartonPolicy, carton: PolicyCarton, earlier: readonly PolicyCarton[]) {
  // A carton holding one unit is excepted from limits that allow for a single oversize unit.
  const oneUnit = carton.contents.length === 1 && carton.contents[0]!.units === 1
  const { receiver } = policy
  return policy.rules.flatMap((rule): Finding[] => {
    switch (rule.type) {
      case "maxSize": {
        if (rule.exceptOneUnit && oneUnit) {
          return []
        }
        const limit = sizeLimit(rule)
        const sides = (["length", "width", "height"] as const).toSorted((a, b) => carton[b] - carton[a])
        const max = [limit.lengthCm, limit.widthCm, limit.heightCm]
        const over = sides.filter((side, index) => carton[side] > max[index]!)
        return over.length
          ? [
              {
                issue: { code: "cartonSize", values: { receiver, ...limit } },
                fields: (["length", "width", "height"] as const).filter((side) => over.includes(side))
              }
            ]
          : []
      }
      case "maxWeight": {
        const limit = weightLimit(rule)
        return carton.weight > limit.maxKg && !(rule.exceptOneUnit && oneUnit)
          ? [{ issue: { code: "cartonWeight", values: { receiver, ...limit } }, fields: ["weight"] }]
          : []
      }
      case "maxUnits":
        return carton.contents
          .filter((content) => content.units > rule.units)
          .map((content) => ({
            issue: {
              code: "unitsPerCarton",
              values: { receiver, sku: content.item.buyerSku, units: content.units, max: rule.units }
            }
          }))
      case "oneSku":
        return new Set(carton.contents.map((content) => content.item.id)).size > 1
          ? [{ issue: { code: "oneSku", values: { receiver } } }]
          : []
      case "samePacking":
        // Every carton of a SKU matches the SKU's first, which the issue names so the app can say what to match.
        return carton.contents.flatMap((content) => {
          const first = earlier.find((other) => other.contents.some((c) => c.item.id === content.item.id))
          if (!first) {
            return []
          }
          const { length, width, height, weight } = first
          const template = {
            units: first.contents.find((c) => c.item.id === content.item.id)!.units,
            length,
            width,
            height,
            weight
          }
          const same =
            template.units === content.units &&
            length === carton.length &&
            width === carton.width &&
            height === carton.height &&
            weight === carton.weight
          return same ? [] : [{ issue: { code: "samePacking", values: { sku: content.item.buyerSku, ...template } } }]
        })
      case "amazonIds":
        return carton.contents
          .filter((content) => !content.item.asin || !content.item.fnsku)
          .map((content) => ({ issue: { code: "missingAmazonIds", values: { sku: content.item.buyerSku } } }))
    }
  })
}
