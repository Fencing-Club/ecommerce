// How the Overview draws a period's daily figures, in its charts and its KPI tiles' trends alike: by day up to about
// three months, by week up to about a year, and by calendar month beyond. A long period then reads as a trend rather
// than noise, and a month's point covers exactly the month its label names.
export type SeriesStep = "day" | "week" | "month"

export function seriesStep(days: number): SeriesStep {
  if (days <= 92) {
    return "day"
  }
  return days <= 400 ? "week" : "month"
}

// The daily rows each point sums, as [start, end) indexes into `rows`: one day, seven days counted from the period's
// first, or a calendar month (partial at either end of the period). `day` reads a row's "YYYY-MM-DD" day.
export function buckets<T>(rows: readonly T[], step: SeriesStep, day: (row: T) => string) {
  const result: { start: number; end: number }[] = []
  for (let start = 0; start < rows.length;) {
    let end = start + 1
    if (step === "week") {
      end = Math.min(rows.length, start + 7)
    } else if (step === "month") {
      const month = day(rows[start]!).slice(0, 7)
      while (end < rows.length && day(rows[end]!).slice(0, 7) === month) {
        end++
      }
    }
    result.push({ start, end })
    start = end
  }
  return result
}
