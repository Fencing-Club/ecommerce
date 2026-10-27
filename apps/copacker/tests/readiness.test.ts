import type { ShipmentState } from "@repo/copacker-shipments/states"
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
    releaseIssues(
      {
        ...shipmentRow({ status: "waiting_labels", packing, snapshot: order, amazonNetwork, labels }),
        transport: null
      },
      docs
    ).map((issue) => issue.code)

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
        .issues.filter((issue) => issue.message.includes("in one carton"))
        .map(({ cartonId, message }) => ({ cartonId, message }))
    expect(issues([first, cancelled, draft])).toEqual([
      {
        cartonId: "C2",
        // By the supplier SKUs the carton lists, not the buyer's.
        message: `FBA can’t take ${order.items[0]!.supplierSku} and ${order.items[1]!.supplierSku} in one carton: Amazon handles them differently, for example for dangerous goods, prep or labels`
      }
    ])
    expect(issues([first, draft])).toEqual([])
    expect(issues([draft])).toEqual([])
  })
})

const warehouseOrder = orderRecords.warehouse.data

// The ready-date issues finishing packing on `readyDate` would meet at `now`.
function readyDateIssues(readyDate: string, now: string, status: ShipmentState = "packing") {
  const { issues } = packingReadiness(
    warehouseOrder,
    shipmentRow({ status }),
    packingFor(warehouseOrder, { readyDate }),
    [],
    1,
    undefined,
    Date.parse(now)
  )
  return issues.filter((issue) => issue.field === "readyDate")
}

describe("a packing list's ready date", () => {
  it("can be today or later", () => {
    expect(readyDateIssues("2026-10-20", "2026-10-20T13:00:00Z")).toEqual([])
    expect(readyDateIssues("2026-11-02", "2026-10-20T13:00:00Z")).toEqual([])
  })

  it("can't be a day that has ended everywhere", () => {
    // At 13:00 UTC it's already the 20th even at UTC−12.
    expect(readyDateIssues("2026-10-19", "2026-10-20T13:00:00Z")).toEqual([
      { code: "ready_date_passed", field: "readyDate", message: "Choose a ready date of today or later" }
    ])
    expect(readyDateIssues("2026-10-19", "2026-10-20T13:00:00Z", "correction")).toHaveLength(1)
  })

  it("can be today for a supplier behind UTC, after UTC's day has moved on", () => {
    // 20:00 on the 19th in Los Angeles is 03:00 on the 20th in UTC.
    expect(readyDateIssues("2026-10-19", "2026-10-20T03:00:00Z")).toEqual([])
    // Until midnight at UTC−12, noon on the 20th in UTC.
    expect(readyDateIssues("2026-10-19", "2026-10-20T11:59:00Z")).toEqual([])
    expect(readyDateIssues("2026-10-19", "2026-10-20T12:00:00Z")).toHaveLength(1)
  })

  it("stays as the supplier gave it once packing is finished", () => {
    expect(readyDateIssues("2026-10-05", "2026-10-20T13:00:00Z", "packed")).toEqual([])
  })
})
