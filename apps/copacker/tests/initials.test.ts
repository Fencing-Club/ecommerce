import { describe, expect, it } from "vitest"
import { initials } from "../src/lib/initials"

describe("initials", () => {
  it("takes the first letter of a name's first two words", () => {
    expect(initials("Lotus Manufacturing")).toBe("LM")
    expect(initials("Juniper Textile Works")).toBe("JT")
    expect(initials("acme")).toBe("A")
    expect(initials("  ")).toBe("")
  })

  it("skips punctuation, and reads an email as a name", () => {
    expect(initials("(Acme) Co")).toBe("AC")
    expect(initials("jane.doe@lotus.com")).toBe("JD")
  })
})
