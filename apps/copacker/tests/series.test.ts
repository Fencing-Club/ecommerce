import { describe, expect, it } from "vitest"
import { buckets, seriesStep } from "../src/lib/series"
import { addDays } from "../src/lib/time-zone"

const days = (from: string, count: number) => Array.from({ length: count }, (_, index) => addDays(from, index))
const sizes = (ranges: { start: number; end: number }[]) => ranges.map(({ start, end }) => end - start)

describe("series", () => {
  it("draws by day up to 92 days, by week up to 400 and by calendar month beyond", () => {
    expect(seriesStep(1)).toBe("day")
    expect(seriesStep(92)).toBe("day")
    expect(seriesStep(93)).toBe("week")
    expect(seriesStep(400)).toBe("week")
    expect(seriesStep(401)).toBe("month")
  })

  it("sums a day, seven days from the period's first, or a calendar month", () => {
    const period = days("2026-01-15", 50)
    const same = (day: string) => day
    expect(sizes(buckets(period, "day", same))).toEqual(Array.from({ length: 50 }, () => 1))
    expect(sizes(buckets(period, "week", same))).toEqual([7, 7, 7, 7, 7, 7, 7, 1])
    // January's last 17 days, February's 28, then March's first 5.
    expect(sizes(buckets(period, "month", same))).toEqual([17, 28, 5])
    expect(buckets([], "month", same)).toEqual([])
  })

  it("reads each row's day", () => {
    const rows = days("2026-03-30", 4).map((date) => ({ date }))
    expect(buckets(rows, "month", (row) => row.date)).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 }
    ])
  })
})
