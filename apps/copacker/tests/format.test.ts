import { describe, expect, it } from "vitest"
import { formatDate } from "../src/lib/format"

describe("formatDate", () => {
  // 11:22 pm in Los Angeles is already the next day in UTC, where a server may run.
  const lateEvening = "2026-09-29T06:22:00Z"

  it("writes the day in the given time zone, whatever the computer's", () => {
    expect(formatDate(lateEvening, "en-US", "America/Los_Angeles")).toBe("Sep 28, 2026")
    expect(formatDate(lateEvening, "en-US", "UTC")).toBe("Sep 29, 2026")
  })
})
