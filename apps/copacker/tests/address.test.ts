import { describe, expect, it } from "vitest"
import { addressLine, addressLines } from "../src/lib/address"

const factory = {
  addressLine1: "1000 Siji Road",
  addressLine2: "Building 3",
  city: "Yiwu",
  stateOrRegion: "Zhejiang",
  postalCode: "322000",
  countryCode: "CN"
}

describe("addressLines", () => {
  it("puts the region and postal code after the city, as a label prints them", () => {
    expect(addressLines(factory)).toEqual(["1000 Siji Road", "Building 3", "Yiwu, Zhejiang 322000", "CN"])
  })

  it("leaves out what isn't known", () => {
    expect(
      addressLines({ addressLine1: "2400 NW Front Ave", addressLine2: "", city: "Portland", countryCode: "US" })
    ).toEqual(["2400 NW Front Ave", "Portland", "US"])
    expect(addressLines({ postalCode: "97209" })).toEqual(["97209"])
    expect(addressLines({})).toEqual([])
  })
})

describe("addressLine", () => {
  it("joins the lines with commas", () => {
    expect(addressLine(factory)).toBe("1000 Siji Road, Building 3, Yiwu, Zhejiang 322000, CN")
  })
})
