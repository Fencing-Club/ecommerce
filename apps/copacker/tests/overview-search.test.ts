import { describe, expect, it } from "vitest"
import { overviewHref, overviewSearch, selectOverviewChannel, selectOverviewPeriod } from "../src/lib/overview-search"

describe("overview search navigation", () => {
  it("replaces a custom range atomically, preserving channel and unrelated repeated keys", () => {
    const query = {
      from: "2026-01-01",
      to: "2026-01-10",
      compare: "previousYear",
      channel: "shopify:42",
      keep: ["a", "b"]
    }
    const selected = selectOverviewPeriod(query, {
      key: "today",
      range: { from: "2026-10-15", to: "2026-10-15" },
      comparison: "previousPeriod"
    })
    expect(selected).toEqual({ channel: "shopify:42", keep: ["a", "b"], period: "today" })
    expect(overviewHref(selected)).toBe("/overview?channel=shopify%3A42&keep=a&keep=b&period=today")
    expect(query.from).toBe("2026-01-01")
  })
  it("removes a default period and channel without a trailing question mark", () => {
    const query = selectOverviewPeriod(
      { period: "today", channel: "amazon" },
      { key: "last30", range: { from: "2026-09-15", to: "2026-10-14" }, comparison: "previousPeriod" }
    )
    expect(overviewHref(selectOverviewChannel(query, null))).toBe("/overview")
  })
  it("keeps the period when changing channels and rejects structured search values", () => {
    expect(selectOverviewChannel({ period: "last90", keep: "stock" }, "amazon")).toEqual({
      period: "last90",
      keep: "stock",
      channel: "amazon"
    })
    expect(overviewSearch.safeParse({ channel: { orgId: "other" } }).success).toBe(false)
    expect(overviewSearch.parse({ keep: true, count: 2, repeated: ["stock", 3] })).toEqual({
      keep: "true",
      count: "2",
      repeated: ["stock", "3"]
    })
  })
})
