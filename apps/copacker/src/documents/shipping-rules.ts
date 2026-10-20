import { type CartonPolicy, cartonPolicies, sizeLimit, weightLimit } from "@repo/aisle/carton-policies"
import type { ShippingCopyKey } from "./shipping-copy"
import type { ShippingDocumentData } from "./shipping-model"

export type ShippingCheck = {
  title: ShippingCopyKey
  detail: ShippingCopyKey
  values?: Record<string, number | string>
}

// What the supplier checks for each of a policy's carton rules, in the policy's order. Amazon's product identifiers
// are the buyer's to add, so they have no check.
function policyChecks(policy: CartonPolicy) {
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
            values: { kg: Math.round(maxKg * 100) / 100, lb: maxLb }
          }
        ]
      }
      case "amazonIds":
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
  if (data.transport.palletized) {
    handoff.push(
      { title: "pallet", detail: "palletText" },
      { title: "secure", detail: "secureText" },
      { title: "palletLabel", detail: "palletLabelText" },
      { title: "bol", detail: "bolText" }
    )
  }
  handoff.push(handoffChecks[data.transport.collection])
  if (data.network === "forwarder") {
    handoff.push({ title: "handoff", detail: "confirmReceiptText" })
  }
  return { cartons, handoff }
}
