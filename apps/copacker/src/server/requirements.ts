import { cartonLimits, cartonPolicies } from "@repo/copacker-packing-rules/carton-policies"
import type { AmazonNetwork } from "@repo/copacker-shipments"
import { amazonNetworkNames, type PrepCategory } from "@repo/copacker-shipments"
import type { Requirement } from "@repo/copacker-shipments/requirements"
import { match, P } from "ts-pattern"
import { createFormatter, createTranslator } from "use-intl"
import { localization } from "@/server/localization"

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
  const config = await localization()
  const t = createTranslator({ ...config, namespace: "shipments.requirements" })
  const packing = createTranslator({ ...config, namespace: "orders.builder" })
  const format = createFormatter(config)
  const names = (networks: AmazonNetwork[]) => format.list(networks.map((network) => amazonNetworkNames[network]))
  return {
    requirement(requirement: Requirement) {
      return match(requirement)
        .with({ code: "productTask" }, ({ task, countryCode }) => {
          const keys = {
            polybag: "polybag",
            sealedPolybag: "sealedPolybag",
            sku: "skuLabel",
            fnsku: "fnskuLabel",
            suffocation: "suffocationWarning",
            choking: "chokingHazard",
            countryOfOrigin: "countryOfOriginLabel"
          } as const
          return packing(keys[task]) + (task === "countryOfOrigin" ? `: ${countryCode}` : "")
        })
        .with({ code: "prep" }, ({ prep }) => t(`prep.${prepKeys[prep]}`))
        .with({ code: "cartons" }, ({ network }) => {
          const { size, weight, maxUnits } = cartonLimits(cartonPolicies[network])
          return t(network === "fba" ? "fbaCartons" : "awdUsCartons", { ...size, ...weight, units: maxUnits ?? 0 })
        })
        .with({ code: "separateCartons" }, ({ networks }) => t("separateCartons", { networks: names(networks) }))
        .with({ code: "packFor" }, ({ network }) => t("packFor", { network: amazonNetworkNames[network] }))
        .with({ code: "bundle" }, ({ units }) => t("bundle", { count: units }))
        .with({ code: "fnskuLabel" }, ({ fnsku }) => t("fnskuLabel", { fnsku }))
        .with({ code: "instruction" }, ({ text }) => text)
        .with({ code: P.union("unitLabels", "suffocationWarnings", "multiPacks", "suffocationLabel") }, ({ code }) =>
          t(code)
        )
        .exhaustive()
    },
    // A PO to Amazon's destination, such as "Amazon FBA and AWD US".
    amazon: (networks: AmazonNetwork[]) =>
      networks.length ? t("amazonDestination", { networks: names(networks) }) : "Amazon"
  }
}
