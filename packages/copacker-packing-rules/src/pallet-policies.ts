import { amazonSources, type CartonField, weightLimit } from "./carton-policies"
import type { AmazonNetwork } from "./receivers"
import { centimetresPerInch } from "./units"

// A rule a receiver sets for its pallets, as data, as carton-policies.ts keeps carton rules. A policy is the list of
// rules one receiver's pallets follow. Rules on what the pallet editor measures have one evaluator each (checkPallet);
// the rest say how to build the pallet, which the supplier's checklist states and nothing measures. So a 3PL, or an
// arrangement with its own limits such as AWD's West Coast palletizable region, is a new policy, and only a new kind of
// rule needs code. Limits are in the units the receiver states them in. Each rule describes itself, as the receiver
// states it, and `source` is the page where it does, which its errors link to.
export type PalletRule =
  // The pallet's footprint, longer side first, which the load may not overhang, and the grade of wooden pallet with
  // four-way entry the receiver asks for, if any.
  (
    | { type: "footprint"; sides: readonly [number, number]; unit: "cm" | "in"; gmaGrade?: string }
    // Cartons stacked flush and stable, heaviest at the bottom, labels facing out.
    | { type: "stacking" }
    // The tallest pallet, including the pallet itself, and the tallest one another pallet may stand on.
    | { type: "maxHeight"; height: number; stackable?: number; unit: "cm" | "in" }
    // The heaviest pallet, including the pallet itself.
    | { type: "maxWeight"; weight: number; unit: "kg" | "lb" }
    // Clear stretch wrap, marked for the carrier not to break it.
    | { type: "stretchWrap" }
    // The receiver's four pallet labels, one on each side.
    | { type: "palletLabels" }
  ) & { description: string; source?: string }

export type PalletPolicy = {
  // Who receives the pallets, as messages name it, such as "FBA pallets may be up to 182.9 cm tall".
  receiver: string
  // In the order checklists list them.
  rules: readonly PalletRule[]
}

// Amazon's US rules for pallets on LTL and FTL deliveries, checked October 20, 2026 (see the package's
// docs/pallet-rules.md). AWD's shipping requirements send sellers to the same rules; it asks for pallet labels only on
// Amazon's partnered carriers, which copacker doesn't book.
const source = amazonSources.freight
const amazonPallet = [
  {
    type: "footprint",
    sides: [48, 40],
    unit: "in",
    gmaGrade: "B",
    description:
      "Use 48 × 40 in wooden pallets with four-way entry, GMA grade B or better. Nothing may hang over the edges.",
    source
  },
  {
    type: "stacking",
    description: "Stack the cartons flush and stable, heaviest at the bottom, with their labels facing out.",
    source
  },
  {
    type: "maxHeight",
    height: 72,
    stackable: 50,
    unit: "in",
    description: "A pallet may be up to 72 in tall, including the pallet. A pallet another may stand on, up to 50 in.",
    source
  },
  {
    type: "maxWeight",
    weight: 1500,
    unit: "lb",
    description: "A pallet may weigh up to 1,500 lb, including the pallet.",
    source
  },
  {
    type: "stretchWrap",
    description: "Wrap the load in clear stretch wrap, marked “Do not break stretch wrap”.",
    source
  }
] as const satisfies readonly PalletRule[]
export const palletPolicies: Record<AmazonNetwork, PalletPolicy> = {
  fba: {
    receiver: "FBA",
    rules: [
      ...amazonPallet,
      {
        type: "palletLabels",
        description:
          "Put one of each pallet's four labels on each side, at the top center, outside the stretch wrap. Each carton keeps its own label.",
        source
      }
    ]
  },
  awd_us: { receiver: "AWD", rules: amazonPallet }
}

// Drops floating-point noise from a conversion, and keeps a tenth of a centimetre: 48 in is 121.9 cm.
const centimetres = (value: number, unit: "cm" | "in") =>
  Number((unit === "cm" ? value : value * centimetresPerInch).toFixed(1))
const inches = (value: number, unit: "cm" | "in") =>
  Number((unit === "in" ? value : value / centimetresPerInch).toFixed(1))

// A footprint in both units, longer side first.
export function footprintLimit(rule: Pick<Extract<PalletRule, { type: "footprint" }>, "sides" | "unit">) {
  return {
    lengthCm: centimetres(rule.sides[0], rule.unit),
    widthCm: centimetres(rule.sides[1], rule.unit),
    lengthIn: inches(rule.sides[0], rule.unit),
    widthIn: inches(rule.sides[1], rule.unit)
  }
}

// A height limit in both units, and the stackable pallet's when the rule sets one.
export function heightLimit(rule: Pick<Extract<PalletRule, { type: "maxHeight" }>, "height" | "stackable" | "unit">) {
  return {
    maxCm: centimetres(rule.height, rule.unit),
    maxIn: inches(rule.height, rule.unit),
    stackable:
      rule.stackable === undefined
        ? null
        : { maxCm: centimetres(rule.stackable, rule.unit), maxIn: inches(rule.stackable, rule.unit) }
  }
}

// A pallet's weight limit in both units, rounded to whole kilograms: 1,500 lb is 680 kg.
export function palletWeightLimit(rule: Pick<Extract<PalletRule, { type: "maxWeight" }>, "weight" | "unit">) {
  const { maxKg, maxLb } = weightLimit(rule)
  return { maxKg: Math.round(maxKg), maxLb: Math.round(maxLb) }
}

// A rule a pallet breaks, as a code and the values its message names.
export type PalletRuleIssue =
  | { code: "palletFootprint"; values: { receiver: string; pallet: string } & ReturnType<typeof footprintLimit> }
  | {
      code: "palletHeight" | "stackableHeight"
      values: { receiver: string; pallet: string; maxCm: number; maxIn: number }
    }
  | { code: "palletWeight"; values: { receiver: string; pallet: string } & ReturnType<typeof palletWeightLimit> }

export const palletRuleCodes = ["palletFootprint", "palletHeight", "stackableHeight", "palletWeight"] as const

// A pallet as its policy checks it: its ID, size, gross weight, and whether another pallet may stand on it. Sides the
// editor hasn't filled in yet are NaN, which breaks no limit.
export type PolicyPallet = {
  palletId: string
  length: number
  width: number
  height: number
  weight: number
  stackable: boolean
}

type Finding = { issue: PalletRuleIssue; fields: CartonField[]; source?: string }

// The rules of a policy a pallet breaks, with the fields each names and the page that states the rule.
export function checkPallet(policy: PalletPolicy, pallet: PolicyPallet): Finding[] {
  const values = { receiver: policy.receiver, pallet: pallet.palletId }
  const broken = (rule: PalletRule): Finding[] => {
    switch (rule.type) {
      case "footprint": {
        // The pallet fits the footprint either way round: its longer side against the longer limit.
        const limit = footprintLimit(rule)
        const [longer, shorter] = (["length", "width"] as const).toSorted((a, b) => pallet[b] - pallet[a])
        const over = [pallet[longer] > limit.lengthCm && longer, pallet[shorter] > limit.widthCm && shorter].filter(
          (field) => field !== false
        )
        return over.length
          ? [
              {
                issue: { code: "palletFootprint", values: { ...values, ...limit } },
                fields: (["length", "width"] as const).filter((side) => over.includes(side))
              }
            ]
          : []
      }
      case "maxHeight": {
        const limit = heightLimit(rule)
        if (pallet.height > limit.maxCm) {
          return [
            {
              issue: { code: "palletHeight", values: { ...values, maxCm: limit.maxCm, maxIn: limit.maxIn } },
              fields: ["height"]
            }
          ]
        }
        return limit.stackable && pallet.stackable && pallet.height > limit.stackable.maxCm
          ? [{ issue: { code: "stackableHeight", values: { ...values, ...limit.stackable } }, fields: ["height"] }]
          : []
      }
      case "maxWeight": {
        const limit = palletWeightLimit(rule)
        const exact = weightLimit(rule).maxKg
        return pallet.weight > exact
          ? [{ issue: { code: "palletWeight", values: { ...values, ...limit } }, fields: ["weight"] }]
          : []
      }
      case "stacking":
      case "stretchWrap":
      case "palletLabels":
        return []
    }
  }
  return policy.rules.flatMap((rule) =>
    broken(rule).map((finding) => (rule.source ? { ...finding, source: rule.source } : finding))
  )
}
