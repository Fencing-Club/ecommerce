import { describe, expect, it } from "vitest"
import { shipmentDocumentFilename } from "../src/server/document-filenames"

describe("shipment download names", () => {
  const identity = { orderReference: "PO36", shipmentReference: "STAR-123", revision: 2 }
  it("distinguishes the shipment, revision and label type", () => {
    expect(shipmentDocumentFilename("carton_label", identity)).toBe(
      "Amazon carton labels - PO36 - STAR-123 - rev 2.pdf"
    )
    expect(shipmentDocumentFilename("shipping_label", { ...identity, cartonId: "A1" })).toBe(
      "Carrier labels - PO36 - STAR-123 - rev 2 - A1.pdf"
    )
  })
  it("keeps user references safe as filenames", () => {
    expect(shipmentDocumentFilename("packing_list", { ...identity, orderReference: 'PO/36\r\n"test"' })).not.toMatch(
      /[\r\n"/]/
    )
  })
})
