import { type CartonPolicy, cartonPolicies, sizeLimit, weightLimit } from "@repo/copacker-packing-rules/carton-policies"
import {
  footprintLimit,
  heightLimit,
  type PalletPolicy,
  palletPolicies,
  palletWeightLimit
} from "@repo/copacker-packing-rules/pallet-policies"
import type { ShippingCopyKey } from "./shipping-copy"
import type { ShippingDocumentData } from "./shipping-model"

export type ShippingCheck = {
  title: ShippingCopyKey
  detail: ShippingCopyKey
  values?: Record<string, number | string>
}

// What the supplier checks for each of a policy's carton rules, in the policy's order. Amazon's product identifiers
// are the buyer's to add, so they have no check.
export function policyChecks(policy: CartonPolicy) {
  return policy.rules.flatMap((rule): ShippingCheck[] => {
    switch (rule.type) {
      case "oneSku":
        return [{ title: "singleSku", detail: "singleSkuText" }]
      case "maxUnits":
        return [{ title: "unitLimit", detail: "unitLimitText", values: { units: rule.units } }]
      case "samePacking":
        return [{ title: "sameQuantity", detail: "sameQuantityText" }]
      case "maxSize":
        return [
          {
            title: "dimensions",
            detail: rule.exceptOneUnit ? "oneUnitDimensionsText" : "dimensionsText",
            values: sizeLimit(rule)
          }
        ]
      case "maxWeight": {
        const { maxKg, maxLb } = weightLimit(rule)
        return [
          {
            title: "weightLimit",
            detail: rule.exceptOneUnit ? "oneUnitWeightText" : "weightLimitText",
            values: { kg: maxKg, lb: maxLb }
          }
        ]
      }
      case "asin":
      case "fnsku":
        return []
    }
  })
}

// Composable policies, not a template per shipping permutation. Receiving rules are independent of transport.
const receivingChecks: Record<ShippingDocumentData["network"], ShippingCheck[]> = {
  fba: policyChecks(cartonPolicies.fba),
  awd: policyChecks(cartonPolicies.awd_us),
  warehouse: [],
  forwarder: []
}
// What the supplier checks for each of a pallet policy's rules, in the policy's order.
export function palletPolicyChecks(policy: PalletPolicy) {
  return policy.rules.map((rule): ShippingCheck => {
    switch (rule.type) {
      case "footprint":
        return {
          title: "palletType",
          detail: rule.gmaGrade ? "gmaPalletText" : "palletSizeText",
          values: { ...footprintLimit(rule), grade: rule.gmaGrade ?? "" }
        }
      case "stacking":
        return { title: "pallet", detail: "stackingText" }
      case "maxHeight": {
        const { maxCm, maxIn, stackable } = heightLimit(rule)
        return stackable
          ? {
              title: "palletHeight",
              detail: "stackablePalletHeightText",
              values: { heightCm: maxCm, heightIn: maxIn, stackCm: stackable.maxCm, stackIn: stackable.maxIn }
            }
          : { title: "palletHeight", detail: "palletHeightText", values: { heightCm: maxCm, heightIn: maxIn } }
      }
      case "maxWeight": {
        const { maxKg, maxLb } = palletWeightLimit(rule)
        return { title: "weightLimit", detail: "palletWeightText", values: { kg: maxKg, lb: maxLb } }
      }
      case "stretchWrap":
        return { title: "secure", detail: "stretchWrapText" }
      case "palletLabels":
        return { title: "palletLabel", detail: "palletLabelText" }
    }
  })
}
// Pallets to Amazon follow its network's pallet policy; the buyer's own locations and forwarders get the general steps.
const palletChecks: Record<ShippingDocumentData["network"], ShippingCheck[]> = {
  fba: palletPolicyChecks(palletPolicies.fba),
  awd: palletPolicyChecks(palletPolicies.awd_us),
  warehouse: [
    { title: "pallet", detail: "palletText" },
    { title: "secure", detail: "secureText" }
  ],
  forwarder: [
    { title: "pallet", detail: "palletText" },
    { title: "secure", detail: "secureText" }
  ]
}
const handoffChecks: Record<ShippingDocumentData["transport"]["collection"], ShippingCheck> = {
  pickup: { title: "ready", detail: "readyText" },
  dropoff: { title: "dropoffTask", detail: "dropoffTaskText" },
  delivery: { title: "deliveryTask", detail: "deliveryTaskText" }
}

export function shipmentDocumentChecks(data: ShippingDocumentData) {
  const amazon = data.network === "fba" || data.network === "awd"
  const cartons: ShippingCheck[] =
    data.receiving && !data.receiving.repack
      ? []
      : [{ title: "record", detail: "recordText" }, ...receivingChecks[data.network]]
  if (data.receiving?.repack) {
    cartons.splice(1, 0, { title: "quantityCheck", detail: "quantityCheckText" })
  }
  const labels: ShippingCheck[] = []
  if (amazon) {
    labels.push({
      title: data.receiving?.repack ? "newCartonLabels" : "amazonLabel",
      detail: data.receiving?.repack ? "newCartonLabelsText" : "amazonLabelText"
    })
  }
  if (data.transport.carrierLabels) {
    labels.push({ title: "carrierLabel", detail: "carrierLabelText" })
  }
  if (amazon || data.transport.carrierLabels) {
    labels.push({ title: "placement", detail: "placementText" })
  }
  const handoff: ShippingCheck[] = []
  if (data.receiving) {
    if (data.receiving.repack) {
      handoff.push({ title: "oldLabels", detail: "oldLabelsText" })
    }
    handoff.push(...labels, {
      title: "record",
      detail: data.receiving.repack ? "updatedPackingText" : "outboundPackingText"
    })
  } else {
    cartons.push(...labels)
  }
  if (data.network === "forwarder") {
    cartons.push({ title: "cartonSealing", detail: "cartonSealingText" }, { title: "identify", detail: "identifyText" })
    handoff.push({ title: "record", detail: "includePackingText" })
  }
  // Loading the pallets comes before the handoff, where the bill of lading goes with them.
  const pallets: ShippingCheck[] = []
  if (data.transport.palletized) {
    pallets.push(...palletChecks[data.network])
    handoff.push({ title: "bol", detail: "bolText" })
  }
  handoff.push(handoffChecks[data.transport.collection])
  if (data.network === "forwarder") {
    handoff.push({ title: "handoff", detail: "confirmReceiptText" })
  }
  return { cartons, pallets, handoff }
}
