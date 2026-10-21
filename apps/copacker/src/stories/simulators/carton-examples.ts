import type { AmazonNetwork } from "@repo/aisle"
import { packingRuleDescriptions } from "@repo/copacker-packing-rules"
import {
  type CartonPolicy,
  type CartonRule,
  cartonPolicies,
  sizeLimit,
  weightLimit
} from "@repo/copacker-packing-rules/carton-policies"
import { useLocale } from "use-intl"
import { shippingMessage } from "@/documents/shipping-copy"
import { documentSettingsForLocale } from "@/documents/shipping-model"
import { policyChecks } from "@/documents/shipping-rules"
import type { CartonGroup } from "@/lib/carton-groups"
import { type CartonDataSet, cartonGroup, unknownItemId } from "./data"

// One way to break each kind of carton rule, from the rule's own limits. Each rule type needs a case, or this stops
// type checking, so a new kind of rule can't reach the table unbroken. Two units of one product keep the single-unit
// exception and the one-SKU rule out of the way.
function breakRule(rule: CartonRule): CartonGroup[] {
  switch (rule.type) {
    case "maxSize": {
      const { lengthCm, widthCm, heightCm } = sizeLimit(rule)
      return [cartonGroup(["S1"], [lengthCm + 10, widthCm, heightCm], 5, [["natural", 2]])]
    }
    case "maxWeight":
      return [cartonGroup(["W1"], [40, 30, 30], weightLimit(rule).maxKg + 5, [["natural", 2]])]
    case "maxUnits":
      return [cartonGroup(["U1"], [40, 30, 30], 5, [["natural", rule.units + 1]])]
    case "oneSku":
      return [
        cartonGroup(["K1"], [40, 30, 30], 5, [
          ["sage", 10],
          ["stripe", 10]
        ])
      ]
    case "samePacking":
      return [
        cartonGroup(["P1"], [40, 30, 30], 5, [["ivory", 10]]),
        cartonGroup(["P2"], [40, 30, 30], 5, [["ivory", 12]])
      ]
    case "asin":
      return [cartonGroup(["I1"], [40, 30, 30], 5, [["napkin", 10]])]
    case "fnsku":
      return [cartonGroup(["I2"], [40, 30, 30], 5, [["runner", 10]])]
    case "packingGroups":
      return [
        cartonGroup(["N1"], [40, 30, 30], 5, [
          ["sage", 10],
          ["stripe", 10]
        ])
      ]
  }
}

// Amazon's packing groups for the examples, by SKU: the Sage bags apart from the Stripe tea towels.
const packingGroups = { "DB-2030": "PG-1", "CT-3100": "PG-2" }

// An example: whose rule it breaks, the rule as @repo/copacker-packing-rules describes it, and the supplier's checklist line for
// it, when there is one.
type Example = CartonDataSet & { id: string; group: string; rule: string; checklist?: string }
type GeneralCode = keyof typeof packingRuleDescriptions

export const everyReceiver = "Every receiver"

// The rules that hold wherever cartons go, which validatePacking checks itself, each broken by an example of its own.
const everywhere: (Omit<Example, "name" | "note" | "group" | "id" | "rule"> & { code: GeneralCode })[] = [
  {
    code: "duplicateCarton",
    receiver: "fba",
    plenty: true,
    cartons: [
      cartonGroup(["G1"], [40, 30, 30], 5, [["natural", 2]]),
      cartonGroup(["G1"], [40, 30, 30], 5, [["natural", 2]])
    ]
  },
  {
    code: "repeatedProduct",
    receiver: "fba",
    plenty: true,
    cartons: [
      cartonGroup(["G2"], [40, 30, 30], 5, [
        ["sage", 2],
        ["sage", 2]
      ])
    ]
  },
  {
    code: "incompletePacks",
    receiver: "fba",
    plenty: true,
    cartons: [cartonGroup(["G3"], [40, 30, 30], 5, [["threePack", 10]])]
  },
  {
    code: "overQuantity",
    receiver: "fba",
    cartons: [cartonGroup(["G4"], [40, 30, 30], 5, [["natural", 401]])]
  },
  {
    code: "mixedNetworks",
    receiver: "mixed",
    cartons: [
      cartonGroup(["G5"], [40, 30, 30], 5, [
        ["natural", 10],
        ["stripe", 10]
      ])
    ]
  },
  {
    code: "unknownProduct",
    receiver: "fba",
    plenty: true,
    cartons: [{ ...cartonGroup(["G6"], [40, 30, 30], 5, []), items: [{ itemId: unknownItemId, pieces: 2 }] }]
  },
  {
    code: "unknownChange",
    receiver: "fba",
    plenty: true,
    cartons: [cartonGroup(["G7"], [40, 30, 30], 5, [["natural", 2]])],
    changes: [{ itemId: unknownItemId, supplierSku: "", unitPrice: 100 }]
  }
]

// An example for every carton error: each rule of each carton policy in @repo/aisle broken on its own, by its
// receiver, then the rules that hold everywhere. Each is a simulator data set, by an ID a link can name, such as
// "awd_us-oneSku" or "every-duplicateCarton", so a new policy or rule adds its own.
export function useCartonExamples(): Example[] {
  const language = documentSettingsForLocale(useLocale()).language
  // The supplier's checklist line for a rule, in the reader's language, when it has one.
  const checklist = (policy: CartonPolicy, rule: CartonRule) => {
    const [check] = policyChecks({ ...policy, rules: [rule] })
    return check && shippingMessage(language, check.detail, check.values)
  }
  const policies = Object.entries(cartonPolicies) as [AmazonNetwork, CartonPolicy][]
  const examples = [
    ...policies.flatMap(([network, policy]) =>
      policy.rules.map((rule) => ({
        id: `${network}-${rule.type}`,
        group: policy.receiver,
        rule: rule.description,
        checklist: checklist(policy, rule),
        receiver: network,
        plenty: true,
        cartons: breakRule(rule),
        ...(rule.type === "packingGroups" && { packingGroups })
      }))
    ),
    ...everywhere.map(({ code, ...example }) => ({
      ...example,
      id: `every-${code}`,
      group: everyReceiver,
      rule: packingRuleDescriptions[code]
    }))
  ]
  return examples.map((example) => ({
    ...example,
    name: `${example.group}: ${example.rule}`,
    note: "An example from Every carton error, which breaks this one rule."
  }))
}
