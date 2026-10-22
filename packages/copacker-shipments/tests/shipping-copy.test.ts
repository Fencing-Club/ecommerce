import { describe, expect, it } from "vitest"
import { shippingCopy, shippingMessage } from "../src/shipping-copy"

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).toSorted()

describe("shipping document copy", () => {
  it("fills in a message's values, with numbers as the document's language writes them", () => {
    expect(shippingMessage("en", "weightLimitText", { kg: 22.67, lb: 50 })).toBe(
      "Each packed carton must weigh no more than 22.67 kg (50 lb)."
    )
    expect(shippingMessage("de", "weightLimitText", { kg: 22.67, lb: 50 })).toBe(
      "Jeder gepackte Karton darf höchstens 22,67 kg (50 lb) wiegen."
    )
    expect(shippingMessage("en", "countryOfOriginText", { country: "China" })).toBe(
      "Label each sellable unit with its country of origin: China."
    )
    expect(shippingMessage("en", "ready")).toBe("Pickup")
  })

  it("translates every message, with the same values as the English", () => {
    const english: Record<string, string> = shippingCopy.en
    for (const [language, copy] of Object.entries(shippingCopy)) {
      for (const [key, text] of Object.entries(copy)) {
        expect(text.trim(), `${language} ${key}`).not.toBe("")
        expect(placeholders(text), `${language} ${key}`).toEqual(placeholders(english[key] ?? ""))
      }
    }
  })
})
