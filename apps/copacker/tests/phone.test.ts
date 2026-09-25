import { describe, expect, it } from "vitest"
import { formatPhone, phoneHref } from "../src/lib/phone"

describe("formatPhone", () => {
  it("formats North American numbers", () => {
    expect(formatPhone("+14252602501")).toBe("+1 (425) 260-2501")
  })

  it("formats Chinese mobile numbers", () => {
    expect(formatPhone("+8618861613263")).toBe("+86 188 6161 3263")
  })

  it("normalizes spacing before formatting", () => {
    expect(formatPhone(" +1 425.260.2501 ")).toBe("+1 (425) 260-2501")
  })

  it("leaves unrecognized and local numbers as saved", () => {
    expect(formatPhone("+442071838750")).toBe("+442071838750")
    expect(formatPhone("+1 (530) 704-08448")).toBe("+1 (530) 704-08448")
    expect(formatPhone("4252602501")).toBe("4252602501")
  })
})

describe("phoneHref", () => {
  it("keeps only dialable characters", () => {
    expect(phoneHref("+1 (425) 260-2501")).toBe("tel:+14252602501")
  })
})
