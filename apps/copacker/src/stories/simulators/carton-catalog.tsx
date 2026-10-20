import { type AmazonNetwork, type OrderInput, palletRules, validatePacking } from "@repo/aisle"
import { type CartonPolicy, type CartonRule, cartonPolicies, sizeLimit, weightLimit } from "@repo/aisle/carton-policies"
import { useLocale, useMessages, useTranslations } from "use-intl"
import { shippingMessage } from "@/documents/shipping-copy"
import { documentSettingsForLocale } from "@/documents/shipping-model"
import { policyChecks } from "@/documents/shipping-rules"
import { type CartonGroup, expandCartonGroups } from "@/lib/carton-groups"
import { catalogOrder, cartonGroup, simulatorOrder, unknownItemId } from "./data"
import { type ErrorRow, ErrorTable } from "./error-table"

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
    case "amazonIds":
      return [cartonGroup(["I1"], [40, 30, 30], 5, [["napkin", 10]])]
  }
}

// What a rule asks for when the supplier's checklist has no line for it: the product identifiers are the buyer's to add.
const unlisted: Partial<Record<CartonRule["type"], string>> = { amazonIds: "Every product has its ASIN and FNSKU" }

type Example = {
  rule: string
  order: OrderInput
  cartons: CartonGroup[]
  changes?: { itemId: string; supplierSku: string; unitPrice: number }[]
}

// The rules that hold wherever cartons go, which validatePacking checks itself, each broken by an example of its own.
const everywhere: Example[] = [
  {
    rule: "Every carton has its own number",
    order: catalogOrder("fba"),
    cartons: [
      cartonGroup(["G1"], [40, 30, 30], 5, [["natural", 2]]),
      cartonGroup(["G1"], [40, 30, 30], 5, [["natural", 2]])
    ]
  },
  {
    rule: "A carton lists each product once",
    order: catalogOrder("fba"),
    cartons: [
      cartonGroup(["G2"], [40, 30, 30], 5, [
        ["sage", 2],
        ["sage", 2]
      ])
    ]
  },
  {
    rule: "Multi-packs are packed whole",
    order: catalogOrder("fba"),
    cartons: [cartonGroup(["G3"], [40, 30, 30], 5, [["threePack", 10]])]
  },
  {
    rule: "Cartons hold no more than the PO orders",
    order: simulatorOrder("fba"),
    cartons: [cartonGroup(["G4"], [40, 30, 30], 5, [["natural", 401]])]
  },
  {
    rule: "A carton to Amazon holds one network's products",
    order: simulatorOrder("mixed"),
    cartons: [
      cartonGroup(["G5"], [40, 30, 30], 5, [
        ["natural", 10],
        ["stripe", 10]
      ])
    ]
  },
  {
    rule: "Cartons hold only the PO's products",
    order: catalogOrder("fba"),
    cartons: [{ ...cartonGroup(["G6"], [40, 30, 30], 5, []), items: [{ itemId: unknownItemId, pieces: 2 }] }]
  },
  {
    rule: "Invoice changes name the PO's lines, once each",
    order: catalogOrder("fba"),
    cartons: [cartonGroup(["G7"], [40, 30, 30], 5, [["natural", 2]])],
    changes: [{ itemId: unknownItemId, supplierSku: "", unitPrice: 100 }]
  }
]

const palletCodes = new Set<string>(palletRules)

// Every carton error validatePacking reports, by code: each rule of each carton policy in @repo/aisle broken on its own,
// and the rules that hold everywhere. A new policy or rule adds its rows.
export function CartonCatalog() {
  const readiness = useTranslations("server.readiness.packing")
  const messages = useMessages()
  const language = documentSettingsForLocale(useLocale()).language
  const describe = (policy: CartonPolicy, rule: CartonRule) => {
    const [check] = policyChecks({ ...policy, rules: [rule] })
    const text = check ? shippingMessage(language, check.detail, check.values) : (unlisted[rule.type] ?? rule.type)
    return `${policy.receiver}: ${text}`
  }
  const rowsOf = (examples: Example[]) =>
    examples.flatMap(({ rule, order, cartons, changes }): ErrorRow[] =>
      validatePacking(order, { cartons: expandCartonGroups(cartons), changes: changes ?? [] }).issues.map((issue) => ({
        code: issue.code,
        rule,
        error: "values" in issue ? readiness(issue.code, issue.values) : readiness(issue.code)
      }))
    )
  const policyRows = rowsOf(
    (Object.entries(cartonPolicies) as [AmazonNetwork, CartonPolicy][]).flatMap(([network, policy]) =>
      policy.rules.map((rule) => ({
        rule: describe(policy, rule),
        order: catalogOrder(network),
        cartons: breakRule(rule)
      }))
    )
  )
  // An example of a rule that holds everywhere may break a policy's rule too, which the policy's rows already show.
  const policyCodes = new Set(policyRows.map((row) => row.code))
  const rows = [...policyRows, ...rowsOf(everywhere).filter((row) => !policyCodes.has(row.code))]
  const codes = Object.keys(messages.server.readiness.packing).filter((code) => !palletCodes.has(code))
  return <ErrorTable title="Every carton error" rows={rows} codes={codes} />
}
