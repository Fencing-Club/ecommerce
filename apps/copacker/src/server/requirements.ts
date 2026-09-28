import { type AmazonNetwork, amazonNetworkNames, type PrepCategory } from "@repo/aisle"
import type { Requirement } from "@repo/aisle/requirements"
import { getFormatter, getTranslations } from "next-intl/server"

// Each preparation's instruction, under shipments.requirements.prep.
const prepKeys = {
  POLYBAGGING: "polybag",
  NO_PREP: "noPrep",
  BUBBLEWRAPPING: "bubbleWrap",
  TAPING: "tape",
  BLACK_SHRINKWRAPPING: "blackShrinkWrap",
  HANG_GARMENT: "hanger",
  LABELING: "label"
} as const satisfies Record<PrepCategory, string>

// What the supplier must do, and where a PO to Amazon goes, in the request's language. The product's own instructions
// show as the buyer wrote them.
export async function requirementTranslator() {
  const [t, format] = await Promise.all([getTranslations("shipments.requirements"), getFormatter()])
  const names = (networks: AmazonNetwork[]) => format.list(networks.map((network) => amazonNetworkNames[network]))
  return {
    requirement(requirement: Requirement) {
      switch (requirement.code) {
        case "prep":
          return t(`prep.${prepKeys[requirement.prep]}`)
        case "cartons":
          return t(requirement.network === "fba" ? "fbaCartons" : "awdUsCartons")
        case "separateCartons":
          return t("separateCartons", { networks: names(requirement.networks) })
        case "packFor":
          return t("packFor", { network: amazonNetworkNames[requirement.network] })
        case "bundle":
          return t("bundle", { count: requirement.units })
        case "fnskuLabel":
          return t("fnskuLabel", { fnsku: requirement.fnsku })
        case "instruction":
          return requirement.text
        default:
          return t(requirement.code)
      }
    },
    // A PO to Amazon's destination, such as "Amazon FBA and AWD US".
    amazon: (networks: AmazonNetwork[]) =>
      networks.length ? t("amazonDestination", { networks: names(networks) }) : "Amazon"
  }
}
