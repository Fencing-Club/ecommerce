import { describe, expect, it } from "vitest"
import {
  cartonGroupLabel,
  defaultDocumentSettings,
  documentDirection,
  documentIssues,
  documentSettingsForLocale,
  groupProductRequirements,
  groupShippingCartons,
  packingRecordIssues,
  shippingPdfFilename,
  shippingTotals
} from "../src/shipping-model"
import { forwarder, palletFreight, parcelShipment as data } from "./shipping-fixtures"

const carton = data.cartons[0]!
// Forty identical cartons of the first product, each with its Amazon label.
const identical = (carrierLabels: boolean) => ({
  ...data,
  transport: { ...data.transport, carrierLabels },
  cartons: Array.from({ length: 40 }, (_, index) => ({
    ...carton,
    id: `F${index + 1}`,
    amazonLabel: `BOX-${index + 1}`,
    carrierLabel: `TRACK-${index + 1}`
  }))
})

describe("shipping document contract", () => {
  it("uses ranges only for consecutive carton IDs, retaining gaps and custom identifiers", () => {
    const group = (ids: string[]) => ids.map((id) => ({ ...carton, id }))
    expect(cartonGroupLabel(group(["A1", "A2", "A3"]))).toBe("A1–A3")
    expect(cartonGroupLabel(group(["A09", "A10", "A11"]))).toBe("A09–A11")
    expect(cartonGroupLabel(group(["A1", "A3"]))).toBe("A1, A3")
    expect(cartonGroupLabel(group(["A1", "B2"]))).toBe("A1, B2")
    expect(cartonGroupLabel(group(["A3", "A2"]))).toBe("A3, A2")
    expect(cartonGroupLabel(group(["Blue", "Red"]))).toBe("Blue, Red")
    expect(cartonGroupLabel(group(["A1"]))).toBe("A1")
  })

  it("groups identical cartons without losing explicit label assignments", () => {
    const groups = groupShippingCartons(data.cartons)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.map((carton) => carton.id)).toEqual(["F1", "F2"])
    expect(groups[0]?.map((carton) => carton.carrierLabel)).toEqual(["DEMO-TRACK-01", "DEMO-TRACK-02"])
    expect(groupShippingCartons([...data.cartons, { ...carton, id: "F3", weight: 13 }])).toHaveLength(2)
    // The order a carton lists its products in doesn't matter.
    const reversed = { ...carton, id: "F3", contents: carton.contents.toReversed() }
    expect(groupShippingCartons([...data.cartons, reversed])).toHaveLength(1)
  })

  it("blocks missing or duplicate label mappings only when required by the arrangement", () => {
    expect(documentIssues(data)).toEqual([])
    expect(
      documentIssues({ ...data, cartons: data.cartons.map((carton) => ({ ...carton, carrierLabel: undefined })) })
    ).toEqual([
      { code: "missingCarrier", carton: "F1" },
      { code: "missingCarrier", carton: "F2" }
    ])
    expect(documentIssues(palletFreight("awd"))).toEqual([])
    expect(documentIssues({ ...data, cartons: [carton, carton] })).toContainEqual({ code: "duplicateId", carton: "F1" })
    // Two cartons can't share an Amazon or a carrier label.
    for (const label of ["amazonLabel", "carrierLabel"] as const) {
      const cartons = [carton, { ...data.cartons[1]!, [label]: carton[label] }]
      expect(documentIssues({ ...data, cartons })).toContainEqual({ code: "duplicateId", carton: "F2" })
    }
  })

  it("asks for Amazon's carton labels only on cartons to Amazon", () => {
    const cartons = data.cartons.map((carton) => ({ ...carton, amazonLabel: undefined }))
    expect(documentIssues({ ...data, cartons })).toContainEqual({ code: "missingAmazon", carton: "F1" })
    expect(documentIssues({ ...data, network: "warehouse", cartons })).toEqual([])
  })

  it("blocks incomplete print identity, addresses and product quantities", () => {
    expect(documentIssues({ ...data, company: "" })).toContainEqual({ code: "missingIdentity", carton: data.order })
    expect(documentIssues({ ...data, order: "", revision: 0 })).toContainEqual({
      code: "missingIdentity",
      carton: data.shipment
    })
    expect(documentIssues({ ...data, destination: { ...data.destination, address: [] } })).toContainEqual({
      code: "missingAddress",
      carton: data.destination.name
    })
    // A stop or a drop-off point needs an address too.
    expect(documentIssues({ ...data, stops: [{ name: forwarder.name, address: [" "] }] })).toContainEqual({
      code: "missingAddress",
      carton: forwarder.name
    })
    const dropoffAddress = { name: "", address: forwarder.address }
    expect(
      documentIssues({ ...data, transport: { ...data.transport, collection: "dropoff", dropoffAddress } })
    ).toContainEqual({ code: "missingAddress", carton: "" })
    expect(documentIssues({ ...data, cartons: [] })).toContainEqual({ code: "emptyPacking", carton: data.shipment })
    expect(
      documentIssues({ ...data, products: data.products.map((product) => ({ ...product, piecesPerPack: 0 })) })
    ).toContainEqual({ code: "missingProduct", carton: data.products[0]!.supplierSku })
    expect(
      documentIssues({ ...data, products: [{ ...data.products[0]!, supplierSku: "" }, data.products[1]!] })
    ).toContainEqual({ code: "missingProduct", carton: "towel" })
  })

  it("blocks cartons with no contents, impossible measurements or products the document doesn't list", () => {
    for (const change of [
      { contents: [] },
      { dimensions: [40, 0, 30] as [number, number, number] },
      { weight: Number.NaN },
      { contents: [{ productId: "towel", packs: 1.5 }] }
    ]) {
      expect(documentIssues({ ...data, cartons: [{ ...carton, ...change }] })).toContainEqual({
        code: "invalidCarton",
        carton: "F1"
      })
    }
    expect(
      documentIssues({ ...data, cartons: [{ ...carton, contents: [{ productId: "unknown", packs: 1 }] }] })
    ).toContainEqual({ code: "missingProduct", carton: "F1" })
  })

  it("derives direction from language and retains filename identity", () => {
    expect(documentDirection({ ...defaultDocumentSettings, language: "ur" })).toBe("rtl")
    expect(documentDirection({ ...defaultDocumentSettings, language: "de" })).toBe("ltr")
    expect(shippingPdfFilename(data, "reference", defaultDocumentSettings)).toBe(
      "Carton-label-reference-PO38-DEMO-FBA-01-r2-en-A4-ltr.pdf"
    )
    expect(shippingPdfFilename(data, "overview", defaultDocumentSettings)).toBe(
      "Shipment-overview-PO38-r2-en-A4-ltr.pdf"
    )
    expect(shippingPdfFilename({ ...data, order: "PO/38:A" }, "checklist", { language: "ur", paper: "LETTER" })).toBe(
      "Packing-checklist-PO-38-A-DEMO-FBA-01-r2-ur-LETTER-rtl.pdf"
    )
  })

  it("starts with the user's supported language and A4", () => {
    expect(documentSettingsForLocale("de-AT")).toEqual({ language: "de", paper: "A4" })
    expect(documentSettingsForLocale("zh-CN")).toEqual({ language: "zh-CN", paper: "A4" })
    expect(documentSettingsForLocale("ur-PK")).toEqual({ language: "ur", paper: "A4" })
    expect(documentSettingsForLocale("fr")).toEqual({ language: "en", paper: "A4" })
  })

  it("requires a country only when origin labelling is assigned", () => {
    const product = data.products[0]!
    expect(
      documentIssues({ ...data, products: [{ ...product, tasks: ["countryOfOrigin"] }, data.products[1]!] })
    ).toContainEqual({ code: "missingCountry", carton: product.supplierSku })
    expect(
      documentIssues({
        ...data,
        products: [{ ...product, tasks: ["countryOfOrigin"], countryCode: "CN" }, data.products[1]!]
      })
    ).toEqual([])
  })

  it("groups shared product tasks while omitting products with no assigned tasks", () => {
    const first = data.products[0]!
    const second = data.products[1]!
    expect(
      groupProductRequirements([
        { ...first, tasks: ["sku", "fnsku"] },
        { ...second, tasks: ["fnsku", "sku"] }
      ])
    ).toHaveLength(1)
    expect(groupProductRequirements([{ ...first, tasks: [] }])).toEqual([])
    expect(groupProductRequirements([{ ...first, tasks: [], piecesPerPack: 2 }])).toHaveLength(1)
    expect(
      groupProductRequirements([
        { ...first, tasks: ["sealedPolybag"], piecesPerPack: 2 },
        { ...second, tasks: ["sealedPolybag"], piecesPerPack: 3 }
      ])
    ).toHaveLength(2)
    expect(
      groupProductRequirements([
        { ...first, tasks: ["countryOfOrigin"], countryCode: "CN" },
        { ...second, tasks: ["countryOfOrigin"], countryCode: "US" }
      ])
    ).toHaveLength(2)
  })
})

describe("what a document can be made from", () => {
  it("blocks an oversized intact carton group instead of silently splitting its line item", () => {
    // Cartons with a carrier label beside Amazon's fit twenty to a page, others thirty-six.
    expect(groupShippingCartons(identical(true).cartons)).toHaveLength(1)
    expect(documentIssues(identical(true))).toContainEqual({ code: "oversizedGroup", carton: "F1–F40" })
    expect(documentIssues(identical(true), "reference")).toEqual([])
    expect(documentIssues({ ...identical(false), cartons: identical(false).cartons.slice(0, 36) })).toEqual([])
    expect(documentIssues(identical(false))).toContainEqual({ code: "oversizedGroup", carton: "F1–F40" })
  })

  it("makes a packing record before labels or destination addresses are assigned", () => {
    const pending = {
      ...data,
      destination: { name: "Amazon AWD", address: [] },
      cartons: data.cartons.map((carton) => ({ ...carton, amazonLabel: undefined, carrierLabel: undefined }))
    }
    expect(documentIssues(pending).map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["missingAddress", "missingAmazon", "missingCarrier"])
    )
    expect(packingRecordIssues(pending)).toEqual([])
    // The cartons and products still have to be complete.
    expect(packingRecordIssues({ ...pending, cartons: [] })).toEqual([{ code: "emptyPacking", carton: data.shipment }])
  })

  it("counts the cartons, packs, pieces and gross weight, the pallets' when they're on pallets", () => {
    const multipacks = { ...data, products: [{ ...data.products[0]!, piecesPerPack: 2 }, data.products[1]!] }
    expect(shippingTotals(multipacks)).toEqual({ cartons: 2, items: 72, pieces: 120, weight: 24.8 })
    expect(shippingTotals(palletFreight("fba"))).toMatchObject({ cartons: 12, items: 144, pieces: 144, weight: 114 })
    // A pack of a product the document doesn't list counts as one piece.
    const unlisted = { ...data, cartons: [{ ...carton, contents: [{ productId: "unknown", packs: 5 }] }] }
    expect(shippingTotals(unlisted).pieces).toBe(5)
  })
})
