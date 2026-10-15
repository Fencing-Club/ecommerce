import { describe, expect, it } from "vitest"
import { placeAddress } from "../src/lib/place-address"

const part = (type: string, longText: string, shortText = longText) => ({ types: [type], longText, shortText })

describe("placeAddress", () => {
  it("maps a US address and extended postal code", () => {
    expect(
      placeAddress([
        part("street_number", "1600"),
        part("route", "Amphitheatre Parkway"),
        part("locality", "Mountain View"),
        part("administrative_area_level_1", "California", "CA"),
        part("postal_code", "94043"),
        part("postal_code_suffix", "1351"),
        part("country", "United States", "US")
      ])
    ).toEqual({
      addressLine1: "1600 Amphitheatre Parkway",
      city: "Mountain View",
      stateOrRegion: "CA",
      postalCode: "94043-1351",
      countryCode: "US"
    })
  })
  it("uses postal towns and leaves missing parts available for manual entry", () => {
    expect(
      placeAddress([
        part("premise", "Station House"),
        part("postal_town", "London"),
        part("country", "United Kingdom", "GB")
      ])
    ).toEqual({ addressLine1: "Station House", city: "London", stateOrRegion: "", postalCode: "", countryCode: "GB" })
  })
  it("rejects malformed provider responses", () => {
    expect(() => placeAddress([{ longText: 42 }])).toThrow(/Invalid input/)
  })
})
