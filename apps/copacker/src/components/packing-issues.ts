import type { OrderInput } from "@repo/copacker-orders"
import type { ValidationIssue } from "@repo/copacker-packing-rules"
import { useTranslations } from "use-intl"
import type { CartonGroup, PalletValue } from "@/lib/carton-groups"
import { issueValues } from "@/lib/packing-messages"
import type { RuleSource } from "./packing-fields"

// Where a carton row shows a rule it breaks: under the row, a field, or a product by its index.
export type CartonIssuePlace = "carton" | "dimensions" | "weight" | number
export type CartonIssueError = { message: string; place: CartonIssuePlace; outlines: string[]; source?: RuleSource }

// Where the receiver states the rule an issue breaks, for its error to link to.
function ruleSource(issue: ValidationIssue): RuleSource | undefined {
  return issue.source && "values" in issue && "receiver" in issue.values
    ? { href: issue.source, receiver: issue.values.receiver }
    : undefined
}

// A packing rule as the packing form states it. The carton and pallet tables word the rules they place themselves, and
// fall back to this for the rest.
export function usePackingIssueText() {
  const t = useTranslations("orders.cartonEditor")
  const rules = useTranslations("server.readiness.packing")
  return (issue: ValidationIssue) => {
    switch (issue.code) {
      case "overQuantity":
        return t("rules.overQuantity", { ...issue.values, extra: issue.values.packed - issue.values.remaining })
      case "unknownChange":
        return t("rules.unknownChange")
      default:
        return "values" in issue ? rules(issue.code, issue.values) : rules(issue.code)
    }
  }
}

// The packing rules a carton row breaks, as the carton table words and places them: each names the field, says what's
// wrong with the row's own numbers and what to do, and sits under the field or product it names, outlining it.
export function useCartonIssueErrors() {
  const t = useTranslations("orders.cartonEditor")
  const issueText = usePackingIssueText()
  const errorOf = (
    issue: ValidationIssue,
    value: CartonGroup,
    products: OrderInput["items"]
  ): Omit<CartonIssueError, "source"> => {
    const sku = "values" in issue && "sku" in issue.values ? issue.values.sku : undefined
    const index = value.items.findIndex(
      (content) => products.find((item) => item.id === content.itemId)?.buyerSku === sku
    )
    const content = value.items[index]
    const item = products.find((product) => product.id === content?.itemId)
    // Under the product the issue names, or the row.
    const product = index >= 0 ? index : "carton"
    switch (issue.code) {
      case "unitsPerCarton":
      case "incompletePacks":
        return {
          place: product,
          outlines: index >= 0 ? [`items.${index}`] : [],
          message: t(`rules.${issue.code}`, issue.values)
        }
      case "cartonSize": {
        const side = issue.fields?.find((field) => field !== "weight") ?? "length"
        return {
          place: "dimensions",
          outlines: issue.fields ?? [],
          message: t("rules.cartonSize", { ...issue.values, side, size: value[side] })
        }
      }
      case "cartonWeight":
        return {
          place: "weight",
          outlines: ["weight"],
          message: t("rules.cartonWeight", { ...issue.values, weight: value.weight })
        }
      case "oneSku":
        return { place: "carton", outlines: [], message: t("rules.oneSku", issue.values) }
      case "packingGroups":
        return { place: "carton", outlines: [], message: t("rules.packingGroups", issueValues(issue, products)) }
      case "samePacking": {
        // Says how the SKU's other cartons are packed: their units when those differ, otherwise their size and weight.
        const sellable = content && item ? content.pieces / item.piecesPerSet : issue.values.units
        return {
          place: product,
          outlines: [],
          message: t("rules.samePacking", {
            ...issue.values,
            difference: sellable === issue.values.units ? "size" : "units"
          })
        }
      }
      case "missingAsin":
      case "missingFnsku":
        return { place: product, outlines: [], message: t(`rules.${issue.code}`, issue.values) }
      case "duplicateCarton":
        return { place: "carton", outlines: [], message: t("rules.duplicateCarton", { carton: value.cartonId }) }
      case "repeatedProduct": {
        // Under the product's second line, naming it.
        const repeated = value.items.findIndex(
          (line, position) => value.items.findIndex((other) => other.itemId === line.itemId) !== position
        )
        const listed = products.find((candidate) => candidate.id === value.items[repeated]?.itemId)
        return {
          place: repeated >= 0 ? repeated : "carton",
          outlines: [],
          message: t("rules.repeatedProduct", { sku: listed?.buyerSku ?? "" })
        }
      }
      case "mixedNetworks":
      case "unknownProduct":
        return { place: "carton", outlines: [], message: t(`rules.${issue.code}`) }
      default:
        return { place: product, outlines: [], message: issueText(issue) }
    }
  }
  return (issues: ValidationIssue[], value: CartonGroup, products: OrderInput["items"]) =>
    issues.map((issue): CartonIssueError => {
      const source = ruleSource(issue)
      return { ...errorOf(issue, value, products), ...(source && { source }) }
    })
}

// Where a pallet issue shows: under a field of the pallet's row, under the row, or below the pallets when no one
// pallet has it.
export type PalletIssuePlace = "dimensions" | "weight" | "pallet" | "pallets"
export type PalletIssueError = {
  place: PalletIssuePlace
  fields: NonNullable<ValidationIssue["fields"]>
  message: string
  source?: RuleSource
}

// The pallet issues, as the pallet table and the packing form word and place them: the rules of where the pallet goes
// under the field they name, with the pallet's own numbers, and how cartons and pallets must match under the row, or
// below the pallets.
export function usePalletIssueErrors() {
  const t = useTranslations("orders.pallets.rules")
  const issueText = usePackingIssueText()
  const errorsOf = (issue: ValidationIssue, value?: PalletValue): Omit<PalletIssueError, "fields">[] => {
    switch (issue.code) {
      case "palletFootprint":
        return value
          ? [
              {
                place: "dimensions",
                message: t(issue.code, { ...issue.values, length: value.length, width: value.width })
              }
            ]
          : []
      case "palletHeight":
      case "stackableHeight":
        return value ? [{ place: "dimensions", message: t(issue.code, { ...issue.values, height: value.height }) }] : []
      case "palletWeight":
        return value ? [{ place: "weight", message: t(issue.code, { ...issue.values, weight: value.weight }) }] : []
      case "emptyPallet":
      case "duplicatePallet":
      case "palletMixedNetworks":
      case "unknownPalletCarton":
      case "palletCartonTwice":
        return [{ place: "pallet", message: t(issue.code, issue.values) }]
      case "noPallets":
        return [{ place: "pallets", message: t(issue.code) }]
      case "cartonsOffPallets":
        return [{ place: "pallets", message: t(issue.code, issue.values) }]
      default:
        return [{ place: issue.palletId ? "pallet" : "pallets", message: issueText(issue) }]
    }
  }
  return (issues: ValidationIssue[], value?: PalletValue) =>
    issues.flatMap((issue) => {
      const source = ruleSource(issue)
      return errorsOf(issue, value).map((error) => ({
        ...error,
        fields: issue.fields ?? [],
        ...(source && { source })
      }))
    })
}
