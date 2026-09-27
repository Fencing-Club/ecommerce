// Calendar days and months in the store's time zone. Days are "YYYY-MM-DD" keys; the instants they start at come
// from the zone's offset, so days around daylight saving changes are 23 or 25 hours long.

const dayMs = 86400000

// The cookie the browser reports the computer's time zone in.
export const timeZoneCookie = "tz"

export function isTimeZone(value: string) {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone.length > 0
  } catch {
    return false
  }
}

// A zone as people read it, with its current offset from UTC: "America/Los Angeles (UTC−07:00)".
export function timeZoneLabel(zone: string, at: Date | number = Date.now()) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((part) => part.type === "timeZoneName")?.value
  // Intl writes "GMT-07:00", or just "GMT" when there's no offset.
  const offset = !name || name === "GMT" ? "UTC+00:00" : name.replace("GMT", "UTC").replace("-", "−")
  return zone === "UTC" ? "UTC" : `${zone.replaceAll("_", " ")} (${offset})`
}

// Every IANA time zone the runtime knows, UTC first.
export function timeZones() {
  return ["UTC", ...Intl.supportedValuesOf("timeZone").filter((zone) => zone !== "UTC")]
}

const formats = new Map<string, Intl.DateTimeFormat>()
function parts(time: number, timeZone: string) {
  let format = formats.get(timeZone)
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    })
    formats.set(timeZone, format)
  }
  const values = Object.fromEntries(format.formatToParts(time).map((part) => [part.type, part.value]))
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second)
  }
}

// How far the zone's wall clock is ahead of UTC at an instant, in milliseconds.
function offset(time: number, timeZone: string) {
  const wall = parts(time, timeZone)
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second)
  return asUtc - Math.floor(time / 1000) * 1000
}

// The day an instant falls on in the zone.
export function zonedDay(time: Date | number, timeZone: string) {
  const wall = parts(new Date(time).getTime(), timeZone)
  return `${wall.year}-${String(wall.month).padStart(2, "0")}-${String(wall.day).padStart(2, "0")}`
}

// The instant a day (or, with a "YYYY-MM" key, a month) starts in the zone.
export function zonedStart(key: string, timeZone: string) {
  const [year, month, day = 1] = key.split("-").map(Number)
  const midnight = Date.UTC(year!, month! - 1, day)
  // The offset at midnight UTC is close; checking again at the result corrects it across a daylight saving change.
  const first = midnight - offset(midnight, timeZone)
  return new Date(midnight - offset(first, timeZone))
}

// The day `count` days after another, by the calendar.
export function addDays(key: string, count: number) {
  return new Date(Date.parse(`${key}T00:00:00Z`) + count * dayMs).toISOString().slice(0, 10)
}

// The month `count` months after another, as "YYYY-MM".
export function addMonths(month: string, count: number) {
  const [year, index] = month.split("-").map(Number)
  return new Date(Date.UTC(year!, index! - 1 + count, 1)).toISOString().slice(0, 7)
}
