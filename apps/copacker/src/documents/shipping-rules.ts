import { amazonCartonPolicies, type AmazonNetwork } from "@repo/aisle"
import type { ShippingCopyKey } from "./shipping-copy"
import type { ShippingDocumentData } from "./shipping-model"

export type ShippingCheck = {
  title: ShippingCopyKey
  detail: ShippingCopyKey
  values?: Record<string, number | string>
}
function cartonLimits(network: AmazonNetwork) {
  const policy = amazonCartonPolicies[network]
  return {
    sideCm: policy.maxSideCm,
    sideIn: policy.maxSideIn,
    kg: Math.round(policy.maxWeightKg * 100) / 100,
    lb: policy.maxWeightLb
  }
}

// Composable policies, not a template per shipping permutation. Receiving rules are independent of transport.
const receivingChecks: Record<ShippingDocumentData["network"], ShippingCheck[]> = {
  fba: [
    { title: "dimensions", detail: "fbaDimensionsText", values: cartonLimits("fba") },
    { title: "weightLimit", detail: "fbaWeightText", values: cartonLimits("fba") }
  ],
  awd: [
    { title: "singleSku", detail: "singleSkuText" },
    { title: "unitLimit", detail: "unitLimitText", values: { units: amazonCartonPolicies.awd_us.maxUnits } },
    { title: "sameQuantity", detail: "sameQuantityText" },
    { title: "dimensions", detail: "dimensionsText", values: cartonLimits("awd_us") },
    { title: "weightLimit", detail: "weightLimitText", values: cartonLimits("awd_us") }
  ],
  warehouse: [],
  forwarder: []
}
// Amazon's rules for FBA pallets on LTL and FTL deliveries: 40 × 48 in pallets, 72 in and 1,500 lb at most, and
// 50 in for a pallet another stands on. Amazon labels FBA pallets only, four to a pallet; AWD takes the cartons as cases.
const fbaPalletLimits = {
  lengthCm: 121.9,
  widthCm: 101.6,
  lengthIn: 48,
  widthIn: 40,
  heightCm: 182.9,
  heightIn: 72,
  stackCm: 127,
  stackIn: 50,
  kg: 680,
  lb: 1500
}
const palletChecks: Record<"fba" | "other", ShippingCheck[]> = {
  fba: [
    { title: "palletType", detail: "fbaPalletTypeText", values: fbaPalletLimits },
    { title: "pallet", detail: "fbaPalletText" },
    { title: "palletHeight", detail: "fbaPalletHeightText", values: fbaPalletLimits },
    { title: "weightLimit", detail: "fbaPalletWeightText", values: fbaPalletLimits },
    { title: "secure", detail: "fbaSecureText" },
    { title: "palletLabel", detail: "palletLabelText" }
  ],
  other: [
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
    pallets.push(...palletChecks[data.network === "fba" ? "fba" : "other"])
    handoff.push({ title: "bol", detail: "bolText" })
  }
  handoff.push(handoffChecks[data.transport.collection])
  if (data.network === "forwarder") {
    handoff.push({ title: "handoff", detail: "confirmReceiptText" })
  }
  return { cartons, pallets, handoff }
}
