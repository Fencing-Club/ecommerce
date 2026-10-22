import { defaultDocumentSettings } from "@repo/copacker-shipments/shipping-model"
import { describe, expect, it } from "vitest"
import { ShippingPdf } from "../src/documents/shipping-pdf"
import { shippingOverview, shippingScenarios } from "../src/stories/fixtures/shipping-documents"

// What ShippingPdf builds a document from. The document data's rules are copacker-shipments' and tested there.
const data = shippingOverview[0]!
const settings = defaultDocumentSettings

describe("what a document can be made from", () => {
  it("refuses an oversized intact carton group instead of silently splitting its line item", () => {
    const large = shippingScenarios.find((scenario) => scenario.id === "identical-cartons")!.data
    expect(() => ShippingPdf({ data: large, kind: "packing", settings })).toThrow(/oversized/)
  })

  it("makes a completed packing record before labels or destination addresses are assigned", () => {
    const pending = {
      ...data,
      destination: { name: "Amazon AWD", address: [] },
      cartons: data.cartons.map((carton) => ({ ...carton, amazonLabel: undefined, carrierLabel: undefined }))
    }
    expect(() => ShippingPdf({ data: pending, kind: "packing", settings })).toThrow(/Complete document details/)
    expect(() => ShippingPdf({ data: pending, kind: "packing", settings, packingRecord: true })).not.toThrow()
  })

  it("makes the packing list, label reference and packing record for pallets", () => {
    const fba = shippingScenarios.find((scenario) => scenario.id === "fba-freight")!.data
    const awd = shippingScenarios.find((scenario) => scenario.id === "awd-freight")!.data
    for (const kind of ["packing", "reference"] as const) {
      expect(() => ShippingPdf({ data: fba, kind, settings })).not.toThrow()
    }
    for (const shipment of [fba, awd]) {
      const record = {
        ...shipment,
        destination: { name: shipment.destination.name, address: [] },
        cartons: shipment.cartons.map((carton) => ({ ...carton, amazonLabel: undefined })),
        pallets: shipment.pallets?.map(({ label: _label, ...pallet }) => pallet)
      }
      expect(() => ShippingPdf({ data: record, kind: "packing", settings, packingRecord: true })).not.toThrow()
    }
  })
})
