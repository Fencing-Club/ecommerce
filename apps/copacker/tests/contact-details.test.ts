import { describe, expect, it } from "vitest"
import { z } from "zod"
import { contactDetailsSchema } from "../src/lib/contact-details"
import { formErrorMap } from "../src/lib/form-errors"
import { companySchema, websiteSchema } from "../src/lib/onboarding"

// The message a form shows for the website, as the browser's forms read it.
const message = (value: unknown) => websiteSchema.safeParse(value, { error: formErrorMap }).error?.issues[0]?.message

describe("websiteSchema", () => {
  it("reads a website typed without https:// as https", () => {
    expect(websiteSchema.parse("fencing.club")).toBe("https://fencing.club")
    expect(websiteSchema.parse(" www.fencing.club/shop ")).toBe("https://www.fencing.club/shop")
    expect(websiteSchema.parse("fencing.club:8080/shop?page=2")).toBe("https://fencing.club:8080/shop?page=2")
  })

  it("keeps a website typed with http:// or https://", () => {
    expect(websiteSchema.parse("https://fencing.club")).toBe("https://fencing.club")
    expect(websiteSchema.parse("http://fencing.club/shop")).toBe("http://fencing.club/shop")
  })

  it("leaves an empty website empty", () => {
    expect(websiteSchema.parse("")).toBe("")
    expect(websiteSchema.parse("   ")).toBe("")
  })

  it("needs a domain name, so a word, an address on this network or an email address isn't a website", () => {
    for (const value of [
      "fencing",
      "fencing club",
      "a.b",
      "https://localhost",
      "192.168.0.1",
      "ftp://fencing.club",
      "http:fencing.club",
      "https:/fencing.club",
      "sales@fencing.club",
      "https://user:secret@fencing.club",
      "mailto:sales@fencing.club"
    ]) {
      expect(message(value)).toBe("Enter a website, such as example.com")
    }
  })

  it("keeps a website to 500 characters", () => {
    expect(message(`fencing.club/${"a".repeat(488)}`)).toBe("Use 500 characters or fewer")
    expect(websiteSchema.safeParse(`fencing.club/${"a".repeat(487)}`).success).toBe(true)
  })
})

describe("company details", () => {
  it("checks the website and phone number getting started asks for", () => {
    expect(companySchema.parse({ name: "Harbor Metalworks", website: "harbor.example", phone: "" })).toEqual({
      name: "Harbor Metalworks",
      website: "https://harbor.example",
      phone: ""
    })
    const result = companySchema.safeParse({ name: "Harbor Metalworks", website: "harbor", phone: "12345" })
    expect(result.error?.issues.map((issue) => [issue.path.join("."), issue.message])).toEqual([
      ["website", "Enter a website, such as example.com"],
      ["phone", "Enter a phone number"]
    ])
  })
})

describe("contactDetailsSchema", () => {
  const blank = { contactName: "", contactEmail: "", phoneNumber: "", website: "" }

  it("takes a supplier's details, any of which can be empty", () => {
    expect(contactDetailsSchema.parse(blank)).toEqual(blank)
    expect(
      contactDetailsSchema.parse({
        contactName: " Wei Chen ",
        contactEmail: "wei@supplier.example",
        phoneNumber: "+86 188 6161 3263",
        website: "supplier.example"
      })
    ).toEqual({
      contactName: "Wei Chen",
      contactEmail: "wei@supplier.example",
      phoneNumber: "+86 188 6161 3263",
      website: "https://supplier.example"
    })
  })

  it("says what to fix on each field", () => {
    const result = contactDetailsSchema.safeParse(
      { contactName: "", contactEmail: "wei", phoneNumber: "call me", website: "supplier" },
      { error: formErrorMap }
    )
    expect(result.error?.issues.map((issue) => [issue.path.join("."), issue.message])).toEqual([
      ["contactEmail", "Enter an email address"],
      ["phoneNumber", "Enter a phone number"],
      ["website", "Enter a website, such as example.com"]
    ])
  })
})

describe("form error messages", () => {
  it("asks for an email address on an email field without its own message", () => {
    expect(z.email().safeParse("wei@", { error: formErrorMap }).error?.issues[0]?.message).toBe(
      "Enter an email address"
    )
  })
})
