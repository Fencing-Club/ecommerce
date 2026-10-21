import { describe, expect, it } from "vitest"
import {
  defaultDocumentSettings,
  documentDirection,
  documentIssues,
  documentSettingsForLocale,
  groupShippingCartons,
  groupProductRequirements,
  shippingPdfFilename
} from "../src/documents/shipping-model"
import { ShippingPdf } from "../src/documents/shipping-pdf"
import { cartonGroupLabel } from "../src/lib/carton-groups"
import { shippingOverview, shippingScenarios } from "../src/stories/fixtures/shipping-documents"

const data = shippingOverview[0]!

describe("shipping document contract", () => {
  it("uses ranges only for consecutive carton IDs, retaining gaps and custom identifiers", () => {
    const group = (ids: string[]) => ids.map((id) => ({ ...data.cartons[0]!, id }))
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
    expect(groupShippingCartons([...data.cartons, { ...data.cartons[0]!, id: "F3", weight: 13 }])).toHaveLength(2)
  })
  it("blocks missing or duplicate label mappings only when required by the arrangement", () => {
    expect(documentIssues(data)).toEqual([])
    expect(
      documentIssues({ ...data, cartons: data.cartons.map((carton) => ({ ...carton, carrierLabel: undefined })) })
    ).toEqual([
      { code: "missingCarrier", carton: "F1" },
      { code: "missingCarrier", carton: "F2" }
    ])
    expect(documentIssues(shippingOverview[1]!)).toEqual([])
    expect(documentIssues({ ...data, cartons: [data.cartons[0]!, data.cartons[0]!] })).toContainEqual({
      code: "duplicateId",
      carton: "F1"
    })
  })
  it("blocks incomplete print identity, addresses and product quantities", () => {
    expect(documentIssues({ ...data, company: "" })).toContainEqual({ code: "missingIdentity", carton: data.order })
    expect(documentIssues({ ...data, destination: { ...data.destination, address: [] } })).toContainEqual({
      code: "missingAddress",
      carton: data.destination.name
    })
    expect(documentIssues({ ...data, cartons: [] })).toContainEqual({ code: "emptyPacking", carton: data.shipment })
    expect(
      documentIssues({ ...data, products: data.products.map((product) => ({ ...product, piecesPerPack: 0 })) })
    ).toContainEqual({ code: "missingProduct", carton: data.products[0]!.supplierSku })
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
    const large = shippingScenarios.find((scenario) => scenario.id === "identical-cartons")!.data
    expect(groupShippingCartons(large.cartons)).toHaveLength(1)
    expect(documentIssues(large)).toContainEqual({ code: "oversizedGroup", carton: "F1–F40" })
    expect(documentIssues(large, "reference")).toEqual([])
    expect(() => ShippingPdf({ data: large, kind: "packing", settings: defaultDocumentSettings })).toThrow(/oversized/)
  })

  it("makes a completed packing record before labels or destination addresses are assigned", () => {
    const pending = {
      ...data,
      destination: { name: "Amazon AWD", address: [] },
      cartons: data.cartons.map((carton) => ({ ...carton, amazonLabel: undefined, carrierLabel: undefined }))
    }
    expect(() => ShippingPdf({ data: pending, kind: "packing", settings: defaultDocumentSettings })).toThrow(
      /Complete document details/
    )
    expect(() =>
      ShippingPdf({ data: pending, kind: "packing", settings: defaultDocumentSettings, packingRecord: true })
    ).not.toThrow()
  })
})
