import { describe, expect, it } from "vitest"
import { formatPhone, phoneHref, phoneSchema } from "../src/lib/phone"

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
    expect(formatPhone("+442071838750")).toBe("+44 20 7183 8750")
    expect(formatPhone("+1 (530) 704-08448")).toBe("+1 (530) 704-08448")
    expect(formatPhone("4252602501")).toBe("4252602501")
  })

  it("uses the address country for national numbers and honors explicit country codes", () => {
    expect(formatPhone("4252602501", "US")).toBe("+1 (425) 260-2501")
    expect(formatPhone("020 7183 8750", "GB")).toBe("+44 20 7183 8750")
    expect(formatPhone("+442071838750", "US")).toBe("+44 20 7183 8750")
    expect(formatPhone("（0755）8654-3210", "CN")).toBe("+86 755 8654 3210")
    expect(formatPhone("123", "US")).toBe("123")
    expect(formatPhone("", "US")).toBe("")
  })
})

describe("phoneHref", () => {
  it("keeps only dialable characters", () => {
    expect(phoneHref("+1 (425) 260-2501")).toBe("tel:+14252602501")
  })
})

describe("phoneSchema", () => {
  const message = (value: string) => phoneSchema.safeParse(value).error?.issues[0]?.message

  it("takes numbers as people write them, with an extension, or nothing", () => {
    for (const value of [
      "+1 (425) 260-2501",
      "+86 188 6161 3263",
      "0755-8654 3210",
      "425.260.2501",
      "+1 425 260 2501 ext. 12",
      "425-260-2501 x12",
      ""
    ]) {
      expect(phoneSchema.parse(value)).toBe(value)
    }
    expect(phoneSchema.parse("  +86 188 6161 3263 ")).toBe("+86 188 6161 3263")
  })

  it("saves full-width digits and brackets from a Chinese keyboard as plain ones", () => {
    expect(phoneSchema.parse("（0755）8654-3210")).toBe("(0755)8654-3210")
    expect(phoneSchema.parse("０７５５ ８６５４ ３２１０")).toBe("0755 8654 3210")
  })

  it("turns down words, email addresses and part of a number", () => {
    for (const value of ["call me", "12345", "WeChat 13800000000", "Tel: 425-260-2501", "123456789@qq.com"]) {
      expect(message(value)).toBe("partners.phone.invalid")
    }
    expect(phoneSchema.safeParse("1".repeat(31)).success).toBe(false)
  })
})
