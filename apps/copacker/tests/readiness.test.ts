import { describe, expect, it } from "vitest"
import { knownPackingGroups, packingReadiness, releaseIssues } from "../src/server/readiness"
import { documentRow, orderRecords, packingFor, shipmentRow } from "../src/stories/fixtures/logistics"
import { daysAgo } from "../src/stories/fixtures/orders"

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

describe("Amazon's packing groups", () => {
  const order = orderRecords.amazon.data
  const [tote, apron] = order.items.map((item) => item.buyerSku)
  const groups = { [tote!]: "pg-tote", [apron!]: "pg-apron" }
  // The PO's first FBA shipment, planned months ago, one Amazon planned since and cancelled, and the draft packed again.
  const first = shipmentRow({
    id: "c0ffee00-1234-4abc-9def-000000000101",
    status: "received",
    amazonNetwork: "fba",
    packingGroups: { [tote!]: "pg-all", [apron!]: "pg-all" },
    createdAt: daysAgo(90)
  })
  const cancelled = shipmentRow({
    id: "c0ffee00-1234-4abc-9def-000000000102",
    status: "cancelled",
    amazonNetwork: "fba",
    packingGroups: groups,
    createdAt: daysAgo(4)
  })
  const draft = shipmentRow({ id: "c0ffee00-1234-4abc-9def-000000000103", amazonNetwork: "fba", createdAt: daysAgo(1) })

  it("are the shipment's own, or the latest Amazon set for the PO", () => {
    expect(knownPackingGroups([first, cancelled, draft], draft)).toEqual(groups)
    expect(knownPackingGroups([cancelled, first, draft], first)).toEqual(first.packingGroups)
    expect(knownPackingGroups([draft], draft)).toBeUndefined()
  })

  it("keep each FBA carton to one group before it's sent", () => {
    // C2 holds both products.
    const issues = (rows: ReturnType<typeof shipmentRow>[]) =>
      packingReadiness(order, draft, packingFor(order), rows, draft.orderRevision)
        .issues.filter((issue) => issue.message.includes("separate cartons"))
        .map(({ cartonId, message }) => ({ cartonId, message }))
    expect(issues([first, cancelled, draft])).toEqual([
      {
        cartonId: "C2",
        // By the supplier SKUs the carton lists, not the buyer's.
        message: `FBA needs ${order.items[0]!.supplierSku} and ${order.items[1]!.supplierSku} in separate cartons`
      }
    ])
    expect(issues([first, draft])).toEqual([])
    expect(issues([draft])).toEqual([])
  })
})
