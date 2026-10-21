import type { PackingItem } from "./index"
import type { AmazonNetwork } from "./receivers"

// A rule a receiver sets for its cartons, as data. A policy is the list of rules one receiver's cartons follow, such as
// FBA's or AWD's, and each rule type has one evaluator (checkCarton), so a new receiver, such as GWD or a 3PL, is a new
// policy, and only a new kind of limit needs code. Limits are in the units the receiver states them in. Each rule
// describes itself, as the receiver states it, and `source` is the page where it does, which its errors link to.
export type CartonRule =
  // The largest carton, as its three sides from longest to shortest. A carton may fit it in any orientation.
  (
    | { type: "maxSize"; sides: readonly [number, number, number]; unit: "cm" | "in"; exceptOneUnit?: boolean }
    | { type: "maxWeight"; weight: number; unit: "kg" | "lb"; exceptOneUnit?: boolean }
    // Sellable units of one product in a carton.
    | { type: "maxUnits"; units: number }
    | { type: "oneSku" }
    // Every carton of a SKU holds the same units and has the same size and weight as its first.
    | { type: "samePacking" }
    // Every product has its ASIN, and every product has its FNSKU: two rules, so each error names its field.
    | { type: "asin" }
    | { type: "fnsku" }
    // Products of one of the packing groups Amazon sets when it plans an FBA shipment, by SKU. Checked once Amazon has set
    // them; until then nothing breaks it.
    | { type: "packingGroups" }
  ) & { description: string; source?: string }

export type CartonPolicy = {
  // Who receives the cartons, as messages name it, such as "AWD allows up to 63.5 cm".
  receiver: string
  // In the order checklists list them.
  rules: readonly CartonRule[]
}

// The Seller Central help pages that state Amazon's packing rules, in the form that opens without signing in.
const amazonHelp = (page: string) => `https://sellercentral.amazon.com/help/hub/reference/external/${page}`
export const amazonSources = {
  // Shipping and routing requirements: FBA's box size and weight.
  fbaShipping: amazonHelp("G200141510"),
  // AWD shipping requirements: AWD's box size and weight.
  awdShipping: amazonHelp("GVEPW8A7PZ3YGPJE"),
  // Send shipments to AWD, Choose inventory to send: one SKU a box, 150 units, one packing template a SKU.
  awdInventory: amazonHelp("GZLL7RYU2FJRN9BU"),
  // Seller requirements for LTL, FTL and FCL deliveries: pallets, for FBA and AWD.
  freight: amazonHelp("G200978400"),
  // Fulfillment Inbound API, Create an inbound shipment: packing groups, the SKUs that can share a box.
  packingGroups: "https://developer-docs.amazon.com/sp-api/docs/create-an-inbound-shipment"
}

const asin = { type: "asin", description: "Every product has its ASIN, which Amazon receives it by." } as const
const fnsku = {
  type: "fnsku",
  description: "Every product has its FNSKU, the barcode Amazon labels it with."
} as const

// Amazon's US carton rules for each network, checked October 19, 2026 (see the package's docs/carton-rules.md). Every FBA carton is
// treated as individual units: copacker doesn't send case packs. No one page states that products need their ASIN and
// FNSKU; Amazon can't receive a product without them.
export const cartonPolicies: Record<AmazonNetwork, CartonPolicy> = {
  fba: {
    receiver: "FBA",
    rules: [
      {
        type: "maxSize",
        sides: [36, 25, 25],
        unit: "in",
        exceptOneUnit: true,
        description:
          "A box may be up to 36 in long, 25 in wide and 25 in high. Only a box of one oversize unit may be larger.",
        source: amazonSources.fbaShipping
      },
      {
        type: "maxWeight",
        weight: 50,
        unit: "lb",
        exceptOneUnit: true,
        description: "A box may weigh up to 50 lb. Only a box of one unit over 50 lb may weigh more.",
        source: amazonSources.fbaShipping
      },
      {
        type: "packingGroups",
        description:
          "A box holds products of one packing group. Amazon sets the groups when it plans the shipment, keeping apart products it receives separately, such as dangerous goods.",
        source: amazonSources.packingGroups
      },
      asin,
      fnsku
    ]
  },
  awd_us: {
    receiver: "AWD",
    rules: [
      {
        type: "oneSku",
        description: "Each box holds one SKU. Boxes of mixed SKUs aren't accepted.",
        source: amazonSources.awdInventory
      },
      {
        type: "maxUnits",
        units: 150,
        description: "Each box holds at most 150 units of its SKU.",
        source: amazonSources.awdInventory
      },
      {
        type: "samePacking",
        description:
          "Each SKU uses one packing template in a shipment: every box of it holds the same units and has the same size and weight.",
        source: amazonSources.awdInventory
      },
      {
        type: "maxSize",
        sides: [25, 25, 25],
        unit: "in",
        description: "A box may be at most 25 in on any side.",
        source: amazonSources.awdShipping
      },
      {
        type: "maxWeight",
        weight: 50,
        unit: "lb",
        description: "A box may weigh at most 50 lb.",
        source: amazonSources.awdShipping
      },
      asin,
      fnsku
    ]
  }
}

const centimetresPerInch = 2.54
const kilogramsPerPound = 0.45359237
// Drops floating-point noise from a conversion, so 36 in is 91.44 cm, not 91.44000000000001.
const exact = (value: number) => Number(value.toPrecision(12))
// Rounds a converted limit down to the hundredth, so the limit shown is one a carton can meet: 50 lb is 22.6796185 kg,
// shown as 22.67 kg, since 22.68 kg is over 50 lb.
const hundredthsDown = (value: number) => Math.floor(exact(value * 100)) / 100

// A size limit in both units, longest side first, and whether every side is the same, as messages put it.
export function sizeLimit(rule: Pick<Extract<CartonRule, { type: "maxSize" }>, "sides" | "unit">) {
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

// A weight limit in both units, the converted one rounded down to the hundredth. Cartons are checked against the
// kilograms shown.
export function weightLimit(rule: Pick<Extract<CartonRule, { type: "maxWeight" }>, "weight" | "unit">) {
  return {
    maxKg: rule.unit === "kg" ? rule.weight : hundredthsDown(rule.weight * kilogramsPerPound),
    maxLb: rule.unit === "lb" ? rule.weight : hundredthsDown(rule.weight / kilogramsPerPound)
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

type Exception = "oneUnit" | "none"
const exception = (rule: { exceptOneUnit?: boolean }): Exception => (rule.exceptOneUnit ? "oneUnit" : "none")

// A rule a carton breaks, as a code and the values its message names.
export type CartonRuleIssue =
  // `exception` is "oneUnit" when a carton holding a single unit may break the limit, as messages select on it.
  | { code: "cartonSize"; values: { receiver: string; exception: Exception } & ReturnType<typeof sizeLimit> }
  | { code: "cartonWeight"; values: { receiver: string; exception: Exception } & ReturnType<typeof weightLimit> }
  | { code: "unitsPerCarton"; values: { receiver: string; sku: string; units: number; max: number } }
  | { code: "oneSku"; values: { receiver: string } }
  // The SKU's first carton, which every other carton of it must match.
  | {
      code: "samePacking"
      values: {
        receiver: string
        sku: string
        units: number
        length: number
        width: number
        height: number
        weight: number
      }
    }
  | { code: "missingAsin" | "missingFnsku"; values: { receiver: string; sku: string } }
  // Two of the carton's products the receiver put in different packing groups.
  | { code: "packingGroups"; values: { receiver: string; sku: string; other: string } }

export type CartonField = "length" | "width" | "height" | "weight"

// A carton as its policy checks it: its size and weight, and each product's PO line, pieces and sellable units.
export type PolicyCarton = {
  length: number
  width: number
  height: number
  weight: number
  contents: Array<{ item: PackingItem; pieces: number; units: number }>
}

type Finding = { issue: CartonRuleIssue; fields?: CartonField[]; source?: string }

// The rules of a policy a carton breaks, with the fields each names and the page that states the rule. `earlier` are
// the cartons checked under the same policy before this one, for rules across cartons, and `groups` the receiver's
// packing groups by SKU, once it has set them.
export function checkCarton(
  policy: CartonPolicy,
  carton: PolicyCarton,
  earlier: readonly PolicyCarton[],
  groups?: Readonly<Record<string, string>>
): Finding[] {
  // A carton holding one unit is excepted from limits that allow for a single oversize unit.
  const oneUnit = carton.contents.length === 1 && carton.contents[0]!.units === 1
  const { receiver } = policy
  const broken = (rule: CartonRule): Finding[] => {
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
                issue: {
                  code: "cartonSize",
                  values: { receiver, exception: exception(rule), ...limit }
                },
                fields: (["length", "width", "height"] as const).filter((side) => over.includes(side))
              }
            ]
          : []
      }
      case "maxWeight": {
        const limit = weightLimit(rule)
        return carton.weight > limit.maxKg && !(rule.exceptOneUnit && oneUnit)
          ? [
              {
                issue: {
                  code: "cartonWeight",
                  values: { receiver, exception: exception(rule), ...limit }
                },
                fields: ["weight"]
              }
            ]
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
          return same
            ? []
            : [{ issue: { code: "samePacking", values: { receiver, sku: content.item.buyerSku, ...template } } }]
        })
      case "asin":
        return carton.contents
          .filter((content) => !content.item.asin)
          .map((content) => ({ issue: { code: "missingAsin", values: { receiver, sku: content.item.buyerSku } } }))
      case "fnsku":
        return carton.contents
          .filter((content) => !content.item.fnsku)
          .map((content) => ({ issue: { code: "missingFnsku", values: { receiver, sku: content.item.buyerSku } } }))
      case "packingGroups": {
        // The carton's first product with a group, and the first in another group.
        const grouped = carton.contents.flatMap(({ item }) => {
          const group = groups?.[item.buyerSku]
          return group ? [{ sku: item.buyerSku, group }] : []
        })
        const [first] = grouped
        const other = grouped.find((entry) => entry.group !== first?.group)
        return first && other
          ? [{ issue: { code: "packingGroups", values: { receiver, sku: first.sku, other: other.sku } } }]
          : []
      }
    }
  }
  return policy.rules.flatMap((rule) =>
    broken(rule).map((finding) => (rule.source ? { ...finding, source: rule.source } : finding))
  )
}
