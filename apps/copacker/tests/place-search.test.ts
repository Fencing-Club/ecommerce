import { afterEach, describe, expect, it, vi } from "vitest"
import { createPlaceSearch } from "../src/lib/place-search"

afterEach(() => vi.unstubAllGlobals())

function provider() {
  const fetchFields = vi.fn<(options: { fields: string[] }) => Promise<void>>().mockResolvedValue(undefined)
  const response = {
    suggestions: [
      {},
      {
        placePrediction: {
          placeId: "address-1",
          text: { toString: () => "Station House, London, UK" },
          toPlace: () => ({
            fetchFields,
            addressComponents: [
              { types: ["premise"], longText: "Station House" },
              { types: ["postal_town"], longText: "London" },
              { types: ["country"], longText: "United Kingdom", shortText: "GB" }
            ]
          })
        }
      }
    ]
  }
  const fetch = vi
    .fn<(request: { input: string; language: string; sessionToken: object }) => Promise<typeof response>>()
    .mockResolvedValue(response)
  class AutocompleteSessionToken {}
  class AutocompleteSuggestion {
    static fetchAutocompleteSuggestions = fetch
  }
  const importLibrary = vi
    .fn<(name: string) => Promise<unknown>>()
    .mockResolvedValue({ AutocompleteSessionToken, AutocompleteSuggestion })
  vi.stubGlobal("window", { google: { maps: { importLibrary } } })
  return { fetch, fetchFields, importLibrary }
}

describe("Google address search", () => {
  it("keeps one billing session while typing and requests address fields only on selection", async () => {
    const { fetch, fetchFields, importLibrary } = provider()
    const search = await createPlaceSearch()
    const results = await search("Station", "en")
    await search("Station House", "en")
    expect(importLibrary).toHaveBeenCalledWith("places")
    expect(results).toHaveLength(1)
    expect(results[0]?.label).toBe("Station House, London, UK")
    expect(fetchFields).not.toHaveBeenCalled()
    const firstToken = fetch.mock.calls[0]?.[0].sessionToken
    expect(fetch.mock.calls[1]?.[0].sessionToken).toBe(firstToken)
    expect(await results[0]?.select()).toMatchObject({
      addressLine1: "Station House",
      city: "London",
      countryCode: "GB"
    })
    expect(fetchFields).toHaveBeenCalledWith({ fields: ["addressComponents"] })
    await search("Another", "fr")
    expect(fetch.mock.calls[2]?.[0]).toMatchObject({ input: "Another", language: "fr" })
    expect(fetch.mock.calls[2]?.[0].sessionToken).not.toBe(firstToken)
  })

  it("reports provider errors so the form can offer manual entry", async () => {
    const { fetch } = provider()
    fetch.mockRejectedValueOnce(new Error("API unavailable"))
    const search = await createPlaceSearch()
    await expect(search("Station", "en")).rejects.toThrow("API unavailable")
  })

  it("rejects an unavailable Maps SDK", async () => {
    vi.stubGlobal("window", {})
    await expect(createPlaceSearch()).rejects.toThrow(/Invalid input/)
  })
})
