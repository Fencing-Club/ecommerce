import { describe, expect, it } from "vitest"
import type { ShipmentState } from "../src/db/schema"
import { packingReadiness } from "../src/server/readiness"
import { orderRecords, packingFor, shipmentRow } from "../src/stories/fixtures/logistics"

const order = orderRecords.warehouse.data

// The ready-date issues finishing packing on `readyDate` would meet at `now`.
function readyDateIssues(readyDate: string, now: string, status: ShipmentState = "packing") {
  const { issues } = packingReadiness(
    order,
    shipmentRow({ status }),
    packingFor(order, { readyDate }),
    {},
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
