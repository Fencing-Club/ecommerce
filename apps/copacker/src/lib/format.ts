// Number and money formats for summaries and charts. Money is in minor units, as Copacker stores it.

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })

export function formatNumber(value: number) {
  return whole.format(value)
}

// 1,284 stays exact; 12,900 becomes 12.9K.
export function compactNumber(value: number) {
  return Math.abs(value) < 10000 ? whole.format(value) : compact.format(value)
}

export function compactMoney(minor: number, currency: string) {
  const major = minor / 100
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: Math.abs(major) < 10000 ? "standard" : "compact",
    maximumFractionDigits: Math.abs(major) < 10000 ? 0 : 1
  }).format(major)
}

// The change from `previous` to `current` as a fraction, or null when there's nothing to compare against.
export function change(current: number, previous: number | null | undefined) {
  if (previous === null || previous === undefined || previous === 0) {
    return null
  }
  return (current - previous) / previous
}

export function formatChange(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: Math.abs(value) < 0.1 ? 1 : 0,
    signDisplay: "exceptZero"
  }).format(value)
}

// "2026-09-03" as "Sep 3", read as a UTC day.
export function shortDate(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
}

// "2026-09" as "Sep" or, with the year, "Sep 2026".
export function monthName(month: string, withYear = false) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", {
    month: withYear ? "long" : "short",
    ...(withYear && { year: "numeric" }),
    timeZone: "UTC"
  })
}
