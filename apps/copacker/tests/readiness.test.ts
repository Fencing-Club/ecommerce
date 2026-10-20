import { describe, expect, it } from "vitest"
import { releaseIssues } from "../src/server/readiness"
import { documentRow, orderRecords, packingFor, shipmentRow } from "../src/stories/fixtures/logistics"

describe("releasing a shipment packed on pallets", () => {
  const order = orderRecords.amazon.data
  const packing = packingFor(order, {
    palletized: true,
    pallets: [
      { palletId: "1", length: 120, width: 100, height: 120, weight: 62, stackable: true, cartonIds: ["C1", "C2"] }
    ]
  })
  const labels = ["C1", "C2"].map((cartonId, index) => ({
    cartonId,
    labelNumber: `FBA18ABCD123U00000${index + 1}`,
    destinationCode: "ONT8",
    amazonShipmentId: "FBA18ABCD123"
  }))
  const cartonLabels = ["C1", "C2"].map((cartonId) => documentRow("carton_label", `${cartonId}.pdf`, { cartonId }))
  const codes = (amazonNetwork: "fba" | "awd_us", docs: ReturnType<typeof documentRow>[]) =>
    releaseIssues(shipmentRow({ status: "waiting_labels", packing, snapshot: order, amazonNetwork, labels }), docs).map(
      (issue) => issue.code
    )

  it("waits for Amazon's pallet labels on FBA only", () => {
    expect(codes("fba", cartonLabels)).toContain("missing_pallet_label")
    expect(codes("fba", [...cartonLabels, documentRow("pallet_label", "Pallet labels.pdf")])).not.toContain(
      "missing_pallet_label"
    )
    // An outdated file from an earlier revision doesn't count.
    expect(
      codes("fba", [...cartonLabels, documentRow("pallet_label", "Pallet labels.pdf", { shipmentRevision: 2 })])
    ).toContain("missing_pallet_label")
    expect(codes("awd_us", cartonLabels)).not.toContain("missing_pallet_label")
  })
})
