import { addDays, addMonths } from "./time-zone"

// The periods the Overview reports on, like Shopify's analytics: a preset relative to today in the store's time zone, or
// any range of days. Days are "YYYY-MM-DD" keys and both ends are included. The labels here are English; pages show
// each preset and comparison by its key from the "overview" messages (overview.period), and ranges in their language.

export type DayRange = { from: string; to: string }

export const presetGroups = {
  single: [
    { key: "today", label: "Today" },
    { key: "yesterday", label: "Yesterday" }
  ],
  last: [
    { key: "last7", label: "Last 7 days" },
    { key: "last30", label: "Last 30 days" },
    { key: "last90", label: "Last 90 days" },
    { key: "last365", label: "Last 365 days" },
    { key: "lastWeek", label: "Last week" },
    { key: "lastMonth", label: "Last month" },
    { key: "lastQuarter", label: "Last quarter" },
    { key: "last12Months", label: "Last 12 months" },
    { key: "lastYear", label: "Last year" }
  ],
  toDate: [
    { key: "weekToDate", label: "Week to date" },
    { key: "monthToDate", label: "Month to date" },
    { key: "quarterToDate", label: "Quarter to date" },
    { key: "yearToDate", label: "Year to date" }
  ]
} as const

export type PresetKey = (typeof presetGroups)[keyof typeof presetGroups][number]["key"]
const presets: readonly { key: PresetKey; label: string }[] = Object.values(presetGroups).flat()
export const defaultPreset: PresetKey = "last30"

export const comparisons = [
  { key: "previousPeriod", label: "Previous period" },
  { key: "previousYear", label: "Previous year" },
  { key: "none", label: "No comparison" }
] as const
export type Comparison = (typeof comparisons)[number]["key"]

// A custom range can't reach further back than this.
const maxDays = 3 * 366

const month = (day: string) => day.slice(0, 7)
const endOfMonth = (key: string) => addDays(`${addMonths(key, 1)}-01`, -1)
const quarterStart = (day: string) => {
  const index = Number(day.slice(5, 7)) - 1
  return `${day.slice(0, 4)}-${String(index - (index % 3) + 1).padStart(2, "0")}`
}
// Weeks start on Sunday, as in Shopify's calendar.
const weekStart = (day: string) => addDays(day, -new Date(`${day}T00:00:00Z`).getUTCDay())

// The days a preset covers, ending today at the latest.
export function presetRange(key: PresetKey, today: string): DayRange {
  const yesterday = addDays(today, -1)
  const thisMonth = month(today)
  switch (key) {
    case "today":
      return { from: today, to: today }
    case "yesterday":
      return { from: yesterday, to: yesterday }
    case "last7":
      return { from: addDays(today, -7), to: yesterday }
    case "last30":
      return { from: addDays(today, -30), to: yesterday }
    case "last90":
      return { from: addDays(today, -90), to: yesterday }
    case "last365":
      return { from: addDays(today, -365), to: yesterday }
    case "lastWeek": {
      const start = addDays(weekStart(today), -7)
      return { from: start, to: addDays(start, 6) }
    }
    case "lastMonth": {
      const previous = addMonths(thisMonth, -1)
      return { from: `${previous}-01`, to: endOfMonth(previous) }
    }
    case "lastQuarter": {
      const start = addMonths(quarterStart(today), -3)
      return { from: `${start}-01`, to: endOfMonth(addMonths(start, 2)) }
    }
    case "last12Months":
      return { from: `${addMonths(thisMonth, -12)}-01`, to: endOfMonth(addMonths(thisMonth, -1)) }
    case "lastYear": {
      const year = Number(today.slice(0, 4)) - 1
      return { from: `${year}-01-01`, to: `${year}-12-31` }
    }
    case "weekToDate":
      return { from: weekStart(today), to: today }
    case "monthToDate":
      return { from: `${thisMonth}-01`, to: today }
    case "quarterToDate":
      return { from: `${quarterStart(today)}-01`, to: today }
    case "yearToDate":
      return { from: `${today.slice(0, 4)}-01-01`, to: today }
  }
}

// Days from one day to another, both included.
export function rangeDays(range: DayRange) {
  return Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86400000) + 1
}

// The same calendar day a year earlier (Feb 29 becomes Feb 28).
function yearEarlier(day: string) {
  const shifted = `${Number(day.slice(0, 4)) - 1}${day.slice(4)}`
  return shifted.endsWith("-02-29") && !isDay(shifted) ? `${shifted.slice(0, 8)}28` : shifted
}

// The range a period is compared with: as many days just before it, or the same days a year earlier.
export function comparisonRange(range: DayRange, comparison: Comparison): DayRange | null {
  if (comparison === "none") {
    return null
  }
  if (comparison === "previousYear") {
    return { from: yearEarlier(range.from), to: yearEarlier(range.to) }
  }
  const days = rangeDays(range)
  return { from: addDays(range.from, -days), to: addDays(range.from, -1) }
}

export const dayKey = /^\d{4}-\d{2}-\d{2}$/
const isDay = (value: string) =>
  dayKey.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
const validDay = (value: unknown): value is string => typeof value === "string" && isDay(value)

export type Period = {
  // The preset, or "custom" for a range of days.
  key: PresetKey | "custom"
  label: string
  range: DayRange
  comparison: Comparison
  previous: DayRange | null
}

// The period in a URL's query (`period`, or `from` and `to` for a range, and `compare`), falling back to the last 30
// days for anything missing or invalid. A range ending after today ends today.
export function readPeriod(query: Record<string, string | string[] | undefined>, today: string): Period {
  const value = (name: string) => {
    const raw = query[name]
    return Array.isArray(raw) ? raw[0] : raw
  }
  const comparison = comparisons.find((option) => option.key === value("compare"))?.key ?? "previousPeriod"
  const from = value("from"),
    to = value("to")
  if (validDay(from) && validDay(to) && from <= to && from <= today) {
    const range = { from, to: to > today ? today : to }
    if (rangeDays(range) <= maxDays) {
      return {
        key: "custom",
        label: rangeLabel(range),
        range,
        comparison,
        previous: comparisonRange(range, comparison)
      }
    }
  }
  const preset =
    presets.find((option) => option.key === value("period")) ?? presets.find((option) => option.key === defaultPreset)!
  const range = presetRange(preset.key, today)
  return { key: preset.key, label: preset.label, range, comparison, previous: comparisonRange(range, comparison) }
}

// The search that selects a period, for links: the range or the preset, leaving out the default preset and comparison.
export function periodSearch(period: Pick<Period, "key" | "range" | "comparison">): {
  period?: PresetKey
  from?: string
  to?: string
  compare?: Comparison
} {
  const compare = period.comparison === "previousPeriod" ? {} : { compare: period.comparison }
  if (period.key === "custom") {
    return { from: period.range.from, to: period.range.to, ...compare }
  }
  return period.key === defaultPreset ? compare : { period: period.key, ...compare }
}

const dayFormat = (withYear: boolean, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    ...(withYear && { year: "numeric" }),
    timeZone: "UTC"
  })

// "Sep 26, 2026", or "Aug 27 – Sep 25, 2026" (with both years when they differ), in the given language.
export function rangeLabel(range: DayRange, locale = "en-US") {
  const day = (key: string, withYear: boolean) => dayFormat(withYear, locale).format(new Date(`${key}T00:00:00Z`))
  if (range.from === range.to) {
    return day(range.from, true)
  }
  const sameYear = range.from.slice(0, 4) === range.to.slice(0, 4)
  return `${day(range.from, !sameYear)} – ${day(range.to, true)}`
}
