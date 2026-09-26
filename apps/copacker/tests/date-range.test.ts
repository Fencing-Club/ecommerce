import { describe, expect, it } from "vitest"
import { comparisonRange, periodQuery, presetRange, rangeLabel, readPeriod } from "../src/lib/date-range"

// A Saturday.
const today = "2026-09-26"

describe("periods", () => {
  it("resolves presets relative to today", () => {
    expect(presetRange("today", today)).toEqual({ from: today, to: today })
    expect(presetRange("yesterday", today)).toEqual({ from: "2026-09-25", to: "2026-09-25" })
    // Full days, ending yesterday.
    expect(presetRange("last7", today)).toEqual({ from: "2026-09-19", to: "2026-09-25" })
    expect(presetRange("last30", today)).toEqual({ from: "2026-08-27", to: "2026-09-25" })
    // Weeks run Sunday to Saturday.
    expect(presetRange("lastWeek", today)).toEqual({ from: "2026-09-13", to: "2026-09-19" })
    expect(presetRange("weekToDate", today)).toEqual({ from: "2026-09-20", to: today })
    expect(presetRange("lastMonth", today)).toEqual({ from: "2026-08-01", to: "2026-08-31" })
    expect(presetRange("lastQuarter", today)).toEqual({ from: "2026-04-01", to: "2026-06-30" })
    expect(presetRange("quarterToDate", today)).toEqual({ from: "2026-07-01", to: today })
    expect(presetRange("last12Months", today)).toEqual({ from: "2025-09-01", to: "2026-08-31" })
    expect(presetRange("lastYear", today)).toEqual({ from: "2025-01-01", to: "2025-12-31" })
    expect(presetRange("yearToDate", today)).toEqual({ from: "2026-01-01", to: today })
  })

  it("compares with the days just before, the same days a year earlier, or nothing", () => {
    const range = { from: "2026-08-27", to: "2026-09-25" }
    expect(comparisonRange(range, "previousPeriod")).toEqual({ from: "2026-07-28", to: "2026-08-26" })
    expect(comparisonRange(range, "previousYear")).toEqual({ from: "2025-08-27", to: "2025-09-25" })
    expect(comparisonRange({ from: "2028-02-29", to: "2028-02-29" }, "previousYear")).toEqual({
      from: "2027-02-28",
      to: "2027-02-28"
    })
    expect(comparisonRange(range, "none")).toBeNull()
  })

  it("reads the period from the query, falling back to the last 30 days", () => {
    expect(readPeriod({}, today)).toMatchObject({ key: "last30", label: "Last 30 days", comparison: "previousPeriod" })
    expect(readPeriod({ period: "nonsense", compare: "nonsense" }, today).key).toBe("last30")
    expect(readPeriod({ period: "last7", compare: "none" }, today)).toMatchObject({ key: "last7", previous: null })
    // A range ending after today ends today; an invalid or reversed one is ignored.
    expect(readPeriod({ from: "2026-09-01", to: "2026-12-01" }, today)).toMatchObject({
      key: "custom",
      range: { from: "2026-09-01", to: today },
      label: "Sep 1 – Sep 26, 2026"
    })
    expect(readPeriod({ from: "2026-09-10", to: "2026-09-01" }, today).key).toBe("last30")
    expect(readPeriod({ from: "2026-02-30", to: "2026-03-01" }, today).key).toBe("last30")
  })

  it("writes the query back, leaving out the defaults", () => {
    expect(
      periodQuery({ key: "last30", range: presetRange("last30", today), comparison: "previousPeriod" }).toString()
    ).toBe("")
    expect(
      periodQuery({
        key: "custom",
        range: { from: "2026-09-01", to: "2026-09-10" },
        comparison: "previousYear"
      }).toString()
    ).toBe("from=2026-09-01&to=2026-09-10&compare=previousYear")
  })

  it("labels ranges", () => {
    expect(rangeLabel({ from: today, to: today })).toBe("Sep 26, 2026")
    expect(rangeLabel({ from: "2025-12-20", to: "2026-01-05" })).toBe("Dec 20, 2025 – Jan 5, 2026")
  })
})
