import { z } from "zod"
import { placeAddress } from "./place-address"

type Prediction = {
  placeId: string
  text: { toString(): string }
  toPlace(): { fetchFields(options: { fields: string[] }): Promise<unknown>; addressComponents?: unknown }
}
type SearchRequest = { input: string; language: string; sessionToken: object }
type SearchResponse = { suggestions: { placePrediction?: Prediction }[] }
// Only the small SDK surface we use. Address data is validated separately before reaching the form.
const placesSchema = z.object({
  AutocompleteSessionToken: z.custom<new () => object>((value) => typeof value === "function"),
  AutocompleteSuggestion: z.custom<{ fetchAutocompleteSuggestions(request: SearchRequest): Promise<SearchResponse> }>(
    (value) =>
      typeof value === "function" &&
      "fetchAutocompleteSuggestions" in value &&
      typeof value.fetchAutocompleteSuggestions === "function"
  )
})

export async function createPlaceSearch() {
  const google = z
    .object({
      maps: z.object({
        importLibrary: z.custom<(name: string) => Promise<unknown>>((value) => typeof value === "function")
      })
    })
    .parse(Reflect.get(window, "google"))
  const library = await google.maps.importLibrary("places")
  const places = placesSchema.parse(library)
  let token = new places.AutocompleteSessionToken()
  return async (input: string, language: string) => {
    const result = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input,
      language,
      sessionToken: token
    })
    return result.suggestions.flatMap(({ placePrediction }) => {
      if (!placePrediction) {
        return []
      }
      return [
        {
          id: placePrediction.placeId,
          label: placePrediction.text.toString(),
          async select() {
            const place = placePrediction.toPlace()
            token = new places.AutocompleteSessionToken()
            await place.fetchFields({ fields: ["addressComponents"] })
            return placeAddress(place.addressComponents)
          }
        }
      ]
    })
  }
}

export type AddressSuggestion = Awaited<ReturnType<Awaited<ReturnType<typeof createPlaceSearch>>>>[number]
