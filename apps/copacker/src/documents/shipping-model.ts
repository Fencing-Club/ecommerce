import { z } from "zod"
import { direction } from "../i18n/locales"
import { cartonGroupLabel } from "../lib/carton-groups"
import { countries } from "../lib/countries"
import type { ProductTask } from "../lib/packing-requirements"

export const documentSettingsSchema = z.object({
  language: z.enum(["en", "de", "zh-CN", "ur"]).default("en"),
  paper: z.enum(["A4", "LETTER"]).default("A4")
})
export type DocumentSettings = z.infer<typeof documentSettingsSchema>
export const defaultDocumentSettings = documentSettingsSchema.parse({})

export function documentSettingsForLocale(locale: string): DocumentSettings {
  const language = documentSettingsSchema.shape.language
    .unwrap()
    .options.find((language) => language.split("-")[0] === locale.toLowerCase().split("-")[0])
  return { ...defaultDocumentSettings, language: language ?? defaultDocumentSettings.language }
}
export type DocumentKind = "packing" | "checklist" | "reference" | "overview"
export type DocumentLanguage = DocumentSettings["language"]
export type DocumentParty = { name: string; address: string[] }
export type ShippingProduct = {
  id: string
  supplierSku: string
  description: string
  piecesPerPack: number
  tasks: ProductTask[]
  countryCode?: string
}
export type ShippingCarton = {
  id: string
  contents: { productId: string; packs: number }[]
  dimensions: [number, number, number]
  weight: number
  amazonLabel?: string
  carrierLabel?: string
}
export type ShippingDocumentData = {
  company: string
  order: string
  revision: number
  generatedDate: string
  shipment: string
  recipient: DocumentParty
  origin: DocumentParty
  destination: DocumentParty
  stops?: DocumentParty[]
  onward?: { destination: DocumentParty; service: ShippingDocumentData["transport"]["service"] }
  network: "fba" | "awd" | "warehouse" | "forwarder"
  transport: {
    service: "parcel" | "agl" | "freight" | "supplier" | "forwarder"
    collection: "pickup" | "dropoff" | "delivery"
    carrierLabels: boolean
    palletized: boolean
    providerName?: string
    dropoffAddress?: DocumentParty
    billOfLading?: string
  }
  pallets?: { id: string; cartons: string[]; dimensions: [number, number, number]; weight: number; label: string }[]
  receiving?: { shipment: string; cartons: string[]; repack: boolean; from?: DocumentParty }
  products: ShippingProduct[]
  cartons: ShippingCarton[]
  instructions: string
}

export function documentDirection(settings: DocumentSettings): "rtl" | "ltr" {
  return direction(settings.language)
}

// Group only identical physical cartons. Assignments remain explicit, never inferred from page order.
export function groupShippingCartons(cartons: ShippingCarton[]) {
  const groups = new Map<string, ShippingCarton[]>()
  for (const carton of cartons) {
    const key = JSON.stringify({
      contents: carton.contents.toSorted((a, b) => a.productId.localeCompare(b.productId)),
      dimensions: carton.dimensions,
      weight: carton.weight
    })
    const group = groups.get(key)
    if (group) {
      group.push(carton)
    } else {
      groups.set(key, [carton])
    }
  }
  return [...groups.values()]
}

export function groupProductRequirements(products: ShippingProduct[]) {
  const groups = new Map<string, ShippingProduct[]>()
  for (const product of products.filter((product) => product.tasks.length > 0 || product.piecesPerPack > 1)) {
    const key = JSON.stringify([
      product.tasks.toSorted(),
      product.piecesPerPack,
      product.tasks.includes("countryOfOrigin") ? product.countryCode : null
    ])
    const group = groups.get(key)
    if (group) {
      group.push(product)
    } else {
      groups.set(key, [product])
    }
  }
  return [...groups.values()]
}

// These are print-release checks. Packing-rule validation remains the shipment's responsibility.
export function documentIssues(data: ShippingDocumentData, kind: DocumentKind = "packing") {
  const issues: {
    code:
      | "missingAmazon"
      | "missingCarrier"
      | "duplicateId"
      | "invalidCarton"
      | "missingProduct"
      | "missingCountry"
      | "oversizedGroup"
      | "missingIdentity"
      | "missingAddress"
      | "emptyPacking"
    carton: string
  }[] = []
  if (
    ![data.company, data.order, data.shipment, data.recipient.name].every((value) => value.trim()) ||
    !Number.isSafeInteger(data.revision) ||
    data.revision < 1
  ) {
    issues.push({ code: "missingIdentity", carton: data.order || data.shipment })
  }
  for (const party of [
    data.origin,
    data.destination,
    ...(data.stops ?? []),
    ...(data.transport.dropoffAddress ? [data.transport.dropoffAddress] : [])
  ]) {
    if (!party.name.trim() || !party.address.some((line) => line.trim())) {
      issues.push({ code: "missingAddress", carton: party.name })
    }
  }
  if (!data.cartons.length) {
    issues.push({ code: "emptyPacking", carton: data.shipment })
  }
  const ids = new Set<string>()
  const amazon = new Set<string>()
  const carrier = new Set<string>()
  // Keep a complete carton group on one page at readable type sizes on both supported papers.
  // Oversized groups need layout review; do not silently turn them into separate groups.
  if (kind === "packing") {
    const paired = (data.network === "awd" || data.network === "fba") && data.transport.carrierLabels
    for (const group of groupShippingCartons(data.cartons)) {
      if (group.length > (paired ? 20 : 36)) {
        issues.push({ code: "oversizedGroup", carton: cartonGroupLabel(group) })
      }
    }
  }
  for (const product of data.products) {
    if (
      !product.id.trim() ||
      !product.supplierSku.trim() ||
      !product.description.trim() ||
      !Number.isSafeInteger(product.piecesPerPack) ||
      product.piecesPerPack < 1
    ) {
      issues.push({ code: "missingProduct", carton: product.supplierSku || product.id })
    }
    if (
      product.tasks.includes("countryOfOrigin") &&
      !countries.some((country) => country.value === product.countryCode)
    ) {
      issues.push({ code: "missingCountry", carton: product.supplierSku })
    }
  }
  for (const carton of data.cartons) {
    if (
      ids.has(carton.id) ||
      (carton.amazonLabel && amazon.has(carton.amazonLabel)) ||
      (carton.carrierLabel && carrier.has(carton.carrierLabel))
    ) {
      issues.push({ code: "duplicateId", carton: carton.id })
    }
    ids.add(carton.id)
    if (carton.amazonLabel) {
      amazon.add(carton.amazonLabel)
    }
    if (carton.carrierLabel) {
      carrier.add(carton.carrierLabel)
    }
    if ((data.network === "fba" || data.network === "awd") && !carton.amazonLabel?.trim()) {
      issues.push({ code: "missingAmazon", carton: carton.id })
    }
    if (data.transport.carrierLabels && !carton.carrierLabel?.trim()) {
      issues.push({ code: "missingCarrier", carton: carton.id })
    }
    if (
      !carton.id.trim() ||
      !carton.contents.length ||
      carton.dimensions.some((value) => !Number.isFinite(value) || value <= 0) ||
      !Number.isFinite(carton.weight) ||
      carton.weight <= 0 ||
      carton.contents.some((item) => !Number.isSafeInteger(item.packs) || item.packs <= 0)
    ) {
      issues.push({ code: "invalidCarton", carton: carton.id })
    }
    if (carton.contents.some((item) => !data.products.some((product) => product.id === item.productId))) {
      issues.push({ code: "missingProduct", carton: carton.id })
    }
  }
  return issues
}

export function shippingTotals(data: ShippingDocumentData) {
  return {
    cartons: data.cartons.length,
    items: data.cartons.reduce(
      (sum, carton) => sum + carton.contents.reduce((count, item) => count + item.packs, 0),
      0
    ),
    pieces: data.cartons.reduce(
      (sum, carton) =>
        sum +
        carton.contents.reduce(
          (count, content) =>
            count +
            content.packs * (data.products.find((product) => product.id === content.productId)?.piecesPerPack ?? 1),
          0
        ),
      0
    ),
    weight: data.pallets?.length
      ? data.pallets.reduce((sum, pallet) => sum + pallet.weight, 0)
      : data.cartons.reduce((sum, carton) => sum + carton.weight, 0)
  }
}

export function shippingPdfFilename(data: ShippingDocumentData, kind: DocumentKind, settings: DocumentSettings) {
  const purpose = {
    packing: "Packing-list",
    checklist: "Packing-checklist",
    reference: "Carton-label-reference",
    overview: "Shipment-overview"
  }[kind]
  const parts = [
    purpose,
    data.order,
    ...(kind === "overview" ? [] : [data.shipment]),
    `r${data.revision}`,
    settings.language,
    settings.paper,
    documentDirection(settings)
  ]
  return `${parts.join("-").replace(/[<>:"/\\|?*\p{Cc}]/gu, "-")}.pdf`
}
