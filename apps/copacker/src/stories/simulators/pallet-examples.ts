import type { AmazonNetwork } from "@repo/aisle"
import { packingRuleDescriptions } from "@repo/copacker-packing-rules"
import {
  footprintLimit,
  heightLimit,
  type PalletPolicy,
  type PalletRule,
  palletPolicies,
  palletWeightLimit
} from "@repo/copacker-packing-rules/pallet-policies"
import { useLocale } from "use-intl"
import { shippingMessage } from "@/documents/shipping-copy"
import { documentSettingsForLocale } from "@/documents/shipping-model"
import { palletPolicyChecks } from "@/documents/shipping-rules"
import { expandCartonGroups, type PalletValue } from "@/lib/carton-groups"
import { cartonGroup, pallet, palletCartonSet, type PalletDataSet, type Receiver } from "./data"

const allCartons = expandCartonGroups(palletCartonSet).map((carton) => carton.cartonId)
// One pallet holding every carton, within every limit, which each example changes in one way.
const fine = pallet("1", [100, 80, 100], 200, false, allCartons)

// One way to break each kind of pallet rule, from the rule's own limits. Each rule type needs a case, or this stops type
// checking. Rules on how to build the pallet, which nothing measures, have no error to show.
function breakRule(rule: PalletRule): PalletValue[][] {
  switch (rule.type) {
    case "footprint": {
      const { lengthCm, widthCm } = footprintLimit(rule)
      return [[{ ...fine, length: lengthCm + 10, width: widthCm }]]
    }
    case "maxHeight": {
      const { maxCm, stackable } = heightLimit(rule)
      return [
        [{ ...fine, height: maxCm + 10 }],
        ...(stackable ? [[{ ...fine, height: stackable.maxCm + 10, stackable: true }]] : [])
      ]
    }
    case "maxWeight":
      return [[{ ...fine, weight: palletWeightLimit(rule).maxKg + 10 }]]
    case "stacking":
    case "stretchWrap":
    case "palletLabels":
      return []
  }
}

// An example: whose rule it breaks, the rule as @repo/copacker-packing-rules describes it, and the supplier's checklist line for
// it, when there is one.
type Example = PalletDataSet & { id: string; group: string; rule: string; checklist?: string }

export const everyReceiver = "Every receiver"

// How the cartons and pallets must match, which validatePacking checks wherever they go. A pallet mixing networks needs
// cartons of both, so that example adds B1, tea towels, which go to AWD while the bags go to FBA.
const everywhere: {
  code: keyof typeof packingRuleDescriptions
  pallets: PalletValue[]
  receiver?: Receiver
  cartons?: PalletDataSet["cartons"]
}[] = [
  { code: "noPallets", pallets: [] },
  {
    code: "emptyPallet",
    pallets: [fine, pallet("2", [100, 80, 100], 25, false, [])]
  },
  {
    code: "duplicatePallet",
    pallets: [
      { ...fine, cartonIds: allCartons.slice(0, 6) },
      { ...fine, cartonIds: allCartons.slice(6) }
    ]
  },
  {
    code: "unknownPalletCarton",
    pallets: [{ ...fine, cartonIds: [...allCartons, "Z9"] }]
  },
  {
    code: "palletCartonTwice",
    pallets: [fine, pallet("2", [100, 80, 100], 25, false, allCartons.slice(0, 1))]
  },
  {
    code: "cartonsOffPallets",
    pallets: [{ ...fine, cartonIds: allCartons.slice(2) }]
  },
  {
    code: "palletMixedNetworks",
    receiver: "mixed",
    cartons: [...palletCartonSet, cartonGroup(["B1"], [60, 40, 40], 10, [["stripe", 40]])],
    pallets: [{ ...fine, cartonIds: [...allCartons, "B1"] }]
  }
]

// An example for every pallet error: each rule of each pallet policy in @repo/aisle broken on its own, by its
// receiver, then how cartons and pallets must match. Each is a simulator data set, by an ID a link can name, such as
// "fba-maxHeight-2", so a new policy or rule adds its own.
export function usePalletExamples(): Example[] {
  const language = documentSettingsForLocale(useLocale()).language
  // The supplier's checklist line for a rule, in the reader's language, when it has one.
  const checklist = (policy: PalletPolicy, rule: PalletRule) => {
    const [check] = palletPolicyChecks({ ...policy, rules: [rule] })
    return check && shippingMessage(language, check.detail, check.values)
  }
  const policies = Object.entries(palletPolicies) as [AmazonNetwork, PalletPolicy][]
  const examples = [
    ...policies.flatMap(([network, policy]) =>
      policy.rules.flatMap((rule) =>
        breakRule(rule).map((pallets, index) => ({
          id: index ? `${network}-${rule.type}-${index + 1}` : `${network}-${rule.type}`,
          group: policy.receiver,
          rule: rule.description,
          checklist: checklist(policy, rule),
          receiver: network,
          pallets
        }))
      )
    ),
    ...everywhere.map(({ code, pallets, receiver = "fba", cartons }) => ({
      id: `every-${code}`,
      group: everyReceiver,
      rule: packingRuleDescriptions[code],
      receiver,
      pallets,
      ...(cartons && { cartons })
    }))
  ]
  return examples.map((example) => ({
    ...example,
    plenty: true,
    name: `${example.group}: ${example.rule}`,
    note: "An example from Every pallet error, which breaks this one rule."
  }))
}
