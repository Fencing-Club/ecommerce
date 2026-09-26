import { describe, expect, it } from "vitest"
import { addDays, addMonths, isTimeZone, timeZoneLabel, timeZones, zonedDay, zonedStart } from "../src/lib/time-zone"

describe("time zones", () => {
  it("names the day an instant falls on in a zone", () => {
    const instant = new Date("2026-09-25T05:30:00Z")
    expect(zonedDay(instant, "UTC")).toBe("2026-09-25")
    expect(zonedDay(instant, "America/Los_Angeles")).toBe("2026-09-24")
    expect(zonedDay(instant, "Asia/Tokyo")).toBe("2026-09-25")
  })

  it("starts days at local midnight, across daylight saving changes", () => {
    expect(zonedStart("2026-09-25", "UTC").toISOString()).toBe("2026-09-25T00:00:00.000Z")
    expect(zonedStart("2026-09-25", "America/Los_Angeles").toISOString()).toBe("2026-09-25T07:00:00.000Z")
    expect(zonedStart("2026-01-15", "America/Los_Angeles").toISOString()).toBe("2026-01-15T08:00:00.000Z")
    // Clocks go forward on March 8, 2026, so that day is 23 hours long.
    const start = zonedStart("2026-03-08", "America/New_York").getTime()
    const next = zonedStart("2026-03-09", "America/New_York").getTime()
    expect((next - start) / 3600000).toBe(23)
    expect(zonedStart("2026-09", "Asia/Tokyo").toISOString()).toBe("2026-08-31T15:00:00.000Z")
  })

  it("counts calendar days and months", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01")
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31")
    expect(addMonths("2026-09", -11)).toBe("2025-10")
    expect(addMonths("2026-12", 1)).toBe("2027-01")
  })

  it("accepts only zones the runtime knows", () => {
    expect(isTimeZone("America/Los_Angeles")).toBe(true)
    expect(isTimeZone("Mars/Olympus")).toBe(false)
    expect(timeZones()[0]).toBe("UTC")
    expect(timeZones()).toContain("Europe/London")
  })

  it("labels a zone with its offset from UTC at a given time", () => {
    const summer = new Date("2026-07-01T12:00:00Z")
    expect(timeZoneLabel("America/Los_Angeles", summer)).toBe("America/Los Angeles (UTC−07:00)")
    expect(timeZoneLabel("America/Los_Angeles", new Date("2026-01-15T12:00:00Z"))).toBe(
      "America/Los Angeles (UTC−08:00)"
    )
    expect(timeZoneLabel("Asia/Kolkata", summer)).toBe("Asia/Kolkata (UTC+05:30)")
    expect(timeZoneLabel("Africa/Abidjan", summer)).toBe("Africa/Abidjan (UTC+00:00)")
    expect(timeZoneLabel("UTC", summer)).toBe("UTC")
  })
})
