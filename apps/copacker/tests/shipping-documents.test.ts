import { fileURLToPath } from "node:url"
import { PDFDocument } from "pdf-lib"
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
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
import { renderShippingDocument, ShippingPdf } from "../src/documents/shipping-pdf"
import { renderSupplierPacket } from "../src/documents/supplier-packet"
import { cartonGroupLabel } from "../src/lib/carton-groups"
import { shippingOverview, shippingScenarios } from "../src/stories/fixtures/shipping-documents"

const data = shippingOverview[0]!
const fontBase = fileURLToPath(new URL("../public/document-fonts", import.meta.url))
async function renderToBuffer(document: Parameters<typeof renderShippingDocument>[0]) {
  return new Uint8Array(await (await renderShippingDocument(document, fontBase)).arrayBuffer())
}

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

describe("rendered shipping PDFs", () => {
  it("orders the supplier packet, keeping each label file's page size", async () => {
    const label = async (size: [number, number]) => {
      const pdf = await PDFDocument.create()
      pdf.addPage(size)
      return pdf.save()
    }
    const bytes = await renderSupplierPacket(
      data,
      defaultDocumentSettings,
      {
        product: [await label([144, 72])],
        carton: [await label([288, 432])],
        carrier: [await label([288, 430])],
        pallet: [await label([612, 792])]
      },
      fontBase
    )
    const sizes = (await PDFDocument.load(bytes)).getPages().map((page) => page.getSize())
    // Packing list, checklist, carton label reference, carton labels, carrier labels, pallet labels, product labels.
    expect(sizes.map(({ width, height }) => [Math.round(width), Math.round(height)])).toEqual([
      [595, 842],
      [595, 842],
      [595, 842],
      [288, 432],
      [288, 430],
      [612, 792],
      [144, 72]
    ])
    const task = getDocument({ data: Uint8Array.from(bytes) })
    try {
      const doc = await task.promise
      const title = async (page: number) =>
        (await (await doc.getPage(page)).getTextContent()).items.flatMap((item) => ("str" in item ? [item.str] : []))
      expect(await title(1)).toContain("Packing list")
      expect(await title(2)).toContain("Packing checklist")
      expect(await title(3)).toContain("Carton label reference")
    } finally {
      await task.destroy()
    }
  })
  it("preserves punctuation and word boundaries across successive and overlapping document requests", async () => {
    const awd = shippingScenarios.find((scenario) => scenario.id === "agl-awd")!.data
    const files = await Promise.all(
      ["packing", "checklist", "checklist"].map((kind) =>
        renderToBuffer(
          ShippingPdf({
            data: awd,
            kind: kind === "packing" ? "packing" : "checklist",
            settings: defaultDocumentSettings
          })
        )
      )
    )
    for (const bytes of files.slice(1)) {
      const task = getDocument({ data: Uint8Array.from(bytes) })
      try {
        const doc = await task.promise
        const content = await (await doc.getPage(1)).getTextContent()
        const text = content.items
          .flatMap((item) => ("str" in item ? [item.str] : []))
          .join(" ")
          .replace(/\s+/g, " ")
        expect(text).toContain("Record each carton’s weight, dimensions, and quantity of each SKU in the packing list.")
        expect(text).toContain("63.5 × 63.5 × 63.5")
      } finally {
        await task.destroy()
      }
    }
  })
  it("leaves the label numbers to the carton label reference", async () => {
    const dropoff = shippingScenarios.find((scenario) => scenario.id === "parcel-dropoff")!.data
    const bytes = await renderToBuffer(
      ShippingPdf({ data: dropoff, kind: "packing", settings: defaultDocumentSettings })
    )
    const task = getDocument({ data: Uint8Array.from(bytes) })
    try {
      const doc = await task.promise
      const text = (await (await doc.getPage(1)).getTextContent()).items.flatMap((item) =>
        "str" in item ? [item.str] : []
      )
      expect(text).toContain("Waffle bath towel")
      for (const label of ["Carton label", "Carrier label", ...dropoff.cartons.map((carton) => carton.amazonLabel)]) {
        expect(text).not.toContain(label)
      }
    } finally {
      await task.destroy()
    }
  })
  it.each(["A4", "LETTER"] as const)(
    "pairs both labels on the same carton row of the reference on %s",
    async (paper) => {
      const dropoff = shippingScenarios.find((scenario) => scenario.id === "parcel-dropoff")!.data
      const bytes = await renderToBuffer(
        ShippingPdf({ data: dropoff, kind: "reference", settings: { ...defaultDocumentSettings, paper } })
      )
      const task = getDocument({ data: Uint8Array.from(bytes) })
      try {
        const doc = await task.promise
        const content = await (await doc.getPage(1)).getTextContent()
        const items = content.items.filter((item) => "str" in item)
        expect(items.map((item) => item.str)).toContain("Carton label")
        for (const carton of dropoff.cartons) {
          const id = items.find((item) => item.str === carton.id)!
          const amazon = items.find((item) => item.str === carton.amazonLabel)!
          const carrier = items.find((item) => item.str === carton.carrierLabel)!
          // The larger, centred carton ID sits within a point or two of the label baseline.
          expect(Math.abs(id.transform[5]! - amazon.transform[5]!)).toBeLessThan(2)
          expect(amazon.transform[5]).toBeCloseTo(carrier.transform[5], 1)
          expect(id.transform[4]).toBeLessThan(amazon.transform[4]!)
          expect(amazon.transform[4]).toBeLessThan(carrier.transform[4]!)
        }
      } finally {
        await task.destroy()
      }
    }
  )
  it("shows multipack quantities and their piece totals", async () => {
    const awd = shippingScenarios.find((scenario) => scenario.id === "agl-awd")!.data
    const bytes = await renderToBuffer(ShippingPdf({ data: awd, kind: "packing", settings: defaultDocumentSettings }))
    const task = getDocument({ data: Uint8Array.from(bytes) })
    try {
      const doc = await task.promise
      const content = await (await doc.getPage(1)).getTextContent()
      const text = content.items
        .flatMap((item) => ("str" in item ? [item.str] : []))
        .join(" ")
        .replace(/\s+/g, " ")
      for (const value of ["A1–A4", "60 packs, 2 each", "120 units", "240 packs, 2 each", "480 units"]) {
        expect(text).toContain(value)
      }
    } finally {
      await task.destroy()
    }
  })
  it("blocks an oversized intact carton group instead of silently splitting its line item", () => {
    const large = shippingScenarios.find((scenario) => scenario.id === "identical-cartons")!.data
    expect(groupShippingCartons(large.cartons)).toHaveLength(1)
    expect(documentIssues(large)).toContainEqual({ code: "oversizedGroup", carton: "F1–F40" })
    expect(documentIssues(large, "reference")).toEqual([])
    expect(() => ShippingPdf({ data: large, kind: "packing", settings: defaultDocumentSettings })).toThrow(/oversized/)
  })
  it.each(["A4", "LETTER"] as const)(
    "keeps carton groups together and repeats headers on %s",
    async (paper) => {
      const long = shippingScenarios.find((scenario) => scenario.id === "long-order")!
      for (const kind of ["packing", "reference"] as const) {
        const bytes = await renderToBuffer(
          ShippingPdf({ data: long.data, kind, settings: { ...defaultDocumentSettings, paper } })
        )
        const pdf = await PDFDocument.load(bytes)
        expect(pdf.getPage(0).getWidth()).toBeCloseTo(paper === "A4" ? 595.28 : 612, 1)
        const task = getDocument({ data: Uint8Array.from(bytes), useSystemFonts: true })
        try {
          const doc = await task.promise
          expect(doc.numPages).toBeGreaterThan(1)
          const pages: string[][] = []
          for (let index = 1; index <= doc.numPages; index++) {
            const page = await doc.getPage(index)
            const content = await page.getTextContent()
            const text = content.items.flatMap((item) => ("str" in item ? [item.str] : []))
            pages.push(text)
            expect(text.join(" ")).toContain("HARBOR GOODS")
            expect(text.join(" ")).toContain("DEMO-FBA-01")
            expect(text.join(" ")).toContain(kind === "packing" ? "Per carton" : "Carrier label")
            expect(text.join(" ")).toContain(`Page ${index} of ${doc.numPages}`)
          }
          // The packing list keeps each carton group whole on one page; the reference lists each label once.
          const markers =
            kind === "packing"
              ? groupShippingCartons(long.data.cartons).map(cartonGroupLabel)
              : long.data.cartons.map((carton) => carton.amazonLabel)
          for (const marker of markers) {
            expect(pages.filter((page) => marker !== undefined && page.includes(marker))).toHaveLength(1)
          }
        } finally {
          await task.destroy()
        }
      }
    },
    60000
  )
  // CJK font embedding/extraction runs in the Chinese Storybook play test through the customer download path.
  it.each(["de", "ur"] as const)(
    "embeds international text and preserves identifiers for %s",
    async (language) => {
      const bytes = await renderToBuffer(
        ShippingPdf({ data, kind: "packing", settings: { ...defaultDocumentSettings, language } })
      )
      const task = getDocument({ data: Uint8Array.from(bytes) })
      try {
        const doc = await task.promise
        const page = await doc.getPage(1)
        const content = await page.getTextContent()
        const text = content.items.flatMap((item) => ("str" in item ? [item.str] : [])).join(" ")
        expect(text).toContain("NT-WBT-NAT")
        expect(text).toContain("NT-CDB-SAG")
        expect(text).not.toContain("\uFFFD")
        expect(doc.numPages).toBe(1)
      } finally {
        await task.destroy()
      }
    },
    60000
  )
})

describe("pallet labels", () => {
  const fba = shippingScenarios.find((scenario) => scenario.id === "fba-freight")!.data
  const awd = shippingScenarios.find((scenario) => scenario.id === "awd-freight")!.data
  async function pageText(document: Parameters<typeof renderShippingDocument>[0]) {
    const task = getDocument({ data: await renderToBuffer(document) })
    try {
      const pdf = await task.promise
      const content = await (await pdf.getPage(1)).getTextContent()
      return content.items.flatMap((item) => ("str" in item ? [item.str] : [])).join(" ")
    } finally {
      await task.destroy()
    }
  }

  it("puts one of the four labels on each side of an FBA pallet, and none on AWD's", async () => {
    const checklist = await pageText(ShippingPdf({ data: fba, kind: "checklist", settings: defaultDocumentSettings }))
    expect(checklist).toContain("Pallet labels")
    expect(checklist).toMatch(/four\s+labels\s+on\s+each\s+side/)
    expect(checklist).toMatch(/outside\s+the\s+stretch\s+wrap/)
    const awdChecklist = await pageText(
      ShippingPdf({ data: awd, kind: "checklist", settings: defaultDocumentSettings })
    )
    expect(awdChecklist).toContain("Secure the load")
    expect(awdChecklist).not.toContain("Pallet labels")
  })

  it("gives Amazon's pallet type, height, weight and wrap for FBA and AWD pallets, before the handoff", async () => {
    const checklist = await pageText(ShippingPdf({ data: fba, kind: "checklist", settings: defaultDocumentSettings }))
    for (const value of [
      "Pallet type",
      "121.9 × 101.6 cm (48 × 40 in)",
      "Height",
      "182.9 cm (72 in)",
      "680 kg (1,500 lb)"
    ]) {
      expect(checklist).toContain(value)
    }
    expect(checklist).toMatch(/Do\s+not\s+break\s+stretch\s+wrap/)
    expect(checklist.indexOf("Pallet type")).toBeLessThan(checklist.indexOf("Handoff"))
    expect(checklist.indexOf("Handoff")).toBeLessThan(checklist.indexOf("Bill of lading"))
    const awdChecklist = await pageText(
      ShippingPdf({ data: awd, kind: "checklist", settings: defaultDocumentSettings })
    )
    // AWD's shipping requirements send sellers to the same LTL and FTL pallet rules.
    for (const value of ["Pallet type", "182.9 cm (72 in)", "680 kg (1,500 lb)"]) {
      expect(awdChecklist).toContain(value)
    }
  })

  it("lists each pallet's dimensions, weight and stacking in the packing list, and its label in the label reference", async () => {
    const settings = defaultDocumentSettings
    const packing = await pageText(ShippingPdf({ data: fba, kind: "packing", settings }))
    for (const value of ["Pallet", "Dimensions", "Gross weight", "Stackable", "F1–F12", "121.9 × 101.6 × 85 cm"]) {
      expect(packing).toContain(value)
    }
    // The totals start with the pallet count.
    expect(packing.indexOf("Pallet")).toBeLessThan(packing.indexOf("Cartons"))
    expect(packing).not.toContain("DEMO-FBA-03 1/1")
    expect(packing).not.toContain("DEMO-BOL-01")
    const reference = await pageText(ShippingPdf({ data: fba, kind: "reference", settings }))
    expect(reference).toContain("Pallet label")
    expect(reference).toContain("DEMO-FBA-03 1/1")
    const awdReference = await pageText(ShippingPdf({ data: awd, kind: "reference", settings }))
    expect(awdReference).not.toContain("Pallet label")
  })

  it("lists the pallets in the packing record too", async () => {
    const record = (data: typeof fba) => ({
      ...data,
      destination: { name: data.destination.name, address: [] },
      cartons: data.cartons.map((carton) => ({ ...carton, amazonLabel: undefined })),
      pallets: data.pallets?.map(({ label: _label, ...pallet }) => pallet)
    })
    const settings = defaultDocumentSettings
    const text = await pageText(ShippingPdf({ data: record(fba), kind: "packing", settings, packingRecord: true }))
    expect(text).toContain("Stackable")
    expect(text).toContain("F1–F12")
    const awdText = await pageText(ShippingPdf({ data: record(awd), kind: "packing", settings, packingRecord: true }))
    expect(awdText).toContain("Stackable")
  })
})

it("prints a completed packing record before labels or destination addresses are assigned", async () => {
  const pending = {
    ...data,
    destination: { name: "Amazon AWD", address: [] },
    cartons: data.cartons.map((carton) => ({ ...carton, amazonLabel: undefined, carrierLabel: undefined }))
  }
  expect(() => ShippingPdf({ data: pending, kind: "packing", settings: defaultDocumentSettings })).toThrow(
    /Complete document details/
  )
  const bytes = await renderToBuffer(
    ShippingPdf({ data: pending, kind: "packing", settings: defaultDocumentSettings, packingRecord: true })
  )
  const task = getDocument({ data: Uint8Array.from(bytes) })
  try {
    const pdf = await task.promise
    const content = await (await pdf.getPage(1)).getTextContent()
    const text = content.items.flatMap((item) => ("str" in item ? [item.str] : [])).join(" ")
    expect(text).toContain("Packing list")
    expect(text).toContain(pending.products[0]!.supplierSku)
    expect(text).not.toContain("Carton labels")
    expect(text).not.toContain("Carrier label numbers")
  } finally {
    await task.destroy()
  }
})
