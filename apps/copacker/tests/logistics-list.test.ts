import { describe, expect, it } from "vitest"
import {
  filterRows,
  inView,
  isFiltered,
  listColumns,
  listReducer,
  type LogisticsRow,
  type RowText,
  routeText,
  shownViews,
  sortRows,
  startList
} from "@/lib/logistics-list"

const row = (id: string, overrides: Partial<LogisticsRow> = {}): LogisticsRow => ({
  id,
  href: `/shipments/${id}`,
  reference: `PO-${id}`,
  partner: "Lotus Manufacturing",
  forwarder: null,
  destination: "Amazon FBA",
  status: "packing",
  stage: "active",
  waiting: "supplier",
  source: "order",
  ...overrides
})
// The rows' words as an English list writes them.
const text: RowText = {
  reference: (shipment) =>
    shipment.number ? `${shipment.reference}, shipment ${shipment.number}` : shipment.reference,
  value: (shipment, key) => {
    switch (key) {
      case "forwarder":
        return shipment.forwarder ?? "Direct"
      case "source":
        return shipment.source
      case "partner":
        return shipment.partner ?? ""
      default:
        return shipment[key]
    }
  }
}
const rows = [
  row("1042", { number: 1, ready: "2026-09-28", forwarder: "Bayline Freight", partner: "Cedar Works" }),
  row("1045", { number: 2, ready: "2026-10-12", detail: "FBA17ABC", waiting: "buyer" }),
  row("1046", { ready: null, stage: "closed", source: "amazon", partner: null })
]
const criteria = { ...startList, query: "", from: "", to: "" }
const ids = (list: LogisticsRow[]) => list.map((shipment) => shipment.id)

describe("logistics list rows", () => {
  it("searches the reference as shown, the partner and the detail", () => {
    expect(ids(filterRows(rows, { ...criteria, query: "shipment 2" }, text))).toEqual(["1045"])
    expect(ids(filterRows(rows, { ...criteria, query: " cedar " }, text))).toEqual(["1042"])
    expect(ids(filterRows(rows, { ...criteria, query: "fba17" }, text))).toEqual(["1045"])
  })

  it("matches each filter by the value the list shows", () => {
    const filters = { ...criteria.filters, forwarder: "Direct" }
    expect(ids(filterRows(rows, { ...criteria, filters }, text))).toEqual(["1045", "1046"])
    expect(ids(filterRows(rows, { ...criteria, filters: { ...filters, source: "amazon" } }, text))).toEqual(["1046"])
  })

  it("keeps the ready dates in range, leaving out rows without one", () => {
    expect(ids(filterRows(rows, { ...criteria, from: "2026-10-01" }, text))).toEqual(["1045"])
    expect(ids(filterRows(rows, { ...criteria, to: "2026-10-01" }, text))).toEqual(["1042"])
    expect(ids(filterRows(rows, criteria, text))).toEqual(["1042", "1045", "1046"])
  })

  it("sorts shipments by ready date, latest first, and either list by partner", () => {
    expect(ids(sortRows(rows, "default", "shipments"))).toEqual(["1045", "1042", "1046"])
    expect(ids(sortRows(rows, "default", "orders"))).toEqual(["1042", "1045", "1046"])
    expect(ids(sortRows(rows, "partner", "orders"))).toEqual(["1046", "1042", "1045"])
  })

  it("words the route through the forwarder", () => {
    const t = (_key: "route", values: { forwarder: string; destination: string }) =>
      `${values.forwarder} to ${values.destination}`
    expect(routeText(rows[0]!, t)).toBe("Bayline Freight to Amazon FBA")
    expect(routeText(rows[1]!, t)).toBe("Amazon FBA")
  })

  it("shows each viewer its views and a purchase order's total only when a row has one", () => {
    expect(shownViews("orders", "buyer")).toEqual(["needsYou", "draft", "active", "closed", "all"])
    expect(shownViews("orders", "forwarder")).toEqual(["active", "closed", "all"])
    expect(shownViews("shipments", "supplier")).toEqual(["needsYou", "active", "received", "all"])
    expect(rows.filter((shipment) => inView(shipment, "needsYou", "buyer")).map((shipment) => shipment.id)).toEqual([
      "1045"
    ])
    expect(rows.filter((shipment) => inView(shipment, "received", "buyer")).map((shipment) => shipment.id)).toEqual([
      "1046"
    ])
    expect(listColumns("orders", rows)).not.toContain("total")
    expect(listColumns("orders", [row("1", { total: "$1.00" })])).toContain("total")
  })
})

describe("logistics list state", () => {
  const onPage3 = { ...startList, page: 3, selected: ["1042"] }

  it("goes back to the first page when the rows are narrowed or reordered", () => {
    expect(listReducer(onPage3, { type: "search", query: "PO" })).toMatchObject({ query: "PO", page: 1 })
    expect(listReducer(onPage3, { type: "filter", key: "status", value: "Packing" })).toMatchObject({
      filters: { status: "Packing", partner: "" },
      page: 1
    })
    expect(listReducer(onPage3, { type: "ready", from: "2026-10-01" })).toMatchObject({
      from: "2026-10-01",
      to: "",
      page: 1
    })
    expect(listReducer(onPage3, { type: "sort", sort: "partner" })).toMatchObject({ sort: "partner", page: 1 })
    // The selection stays while the rows are narrowed.
    expect(listReducer(onPage3, { type: "search", query: "PO" }).selected).toEqual(["1042"])
  })

  it("clears the search and filters but keeps the order, and another view clears the selection", () => {
    const narrowed = { ...onPage3, query: "PO", from: "2026-10-01", sort: "partner" as const }
    expect(isFiltered(narrowed)).toBe(true)
    const cleared = listReducer(narrowed, { type: "clear" })
    expect(isFiltered(cleared)).toBe(false)
    expect(cleared).toMatchObject({ sort: "partner", page: 1, selected: ["1042"] })
    expect(listReducer(onPage3, { type: "view" })).toMatchObject({ page: 1, selected: [] })
  })

  it("moves between pages, and keeps the page while rows are selected", () => {
    expect(listReducer(onPage3, { type: "page", page: 2 }).page).toBe(2)
    expect(listReducer(onPage3, { type: "select", selected: [] })).toMatchObject({ page: 3, selected: [] })
  })
})
