// Number and money formats for summaries and charts. Money is in minor units, as Copacker stores it. Each takes the
// language to write in, useLocale() or getLocale(); English is the default for code without one.

export function formatNumber(value: number, locale = "en-US") {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)
}

export function compactMoney(minor: number, currency: string, locale = "en-US") {
  const major = minor / 100
  return new Intl.NumberFormat(locale, {
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

// A calendar day such as "2026-12-01" as "Dec 1, 2026", read in UTC so it stays the same day in every time zone.
export function dayDate(day: string, locale = "en-US") {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  })
}

// A day as "Sep 27, 2026", in the given time zone. Pages pass next-intl's (useTimeZone() or getTimeZone()), the
// computer's as the browser reported it, so the server and the browser write the same day either side of midnight UTC.
export function formatDate(date: Date | string, locale = "en-US", timeZone?: string) {
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric", timeZone }).format(
    new Date(date)
  )
}
