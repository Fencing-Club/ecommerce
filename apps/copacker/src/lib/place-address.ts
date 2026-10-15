import { z } from "zod"

const componentsSchema = z.array(
  z.object({
    longText: z.string(),
    shortText: z.string().optional(),
    types: z.array(z.string())
  })
)

// Google returns different locality levels by country. Keep missing parts blank for manual entry.
export function placeAddress(components: unknown) {
  const parsed = componentsSchema.parse(components)
  const part = (type: string, short = false) => {
    const component = parsed.find((entry) => entry.types.includes(type))
    return (short ? component?.shortText : component?.longText) ?? component?.longText ?? ""
  }
  const countryCode = part("country", true)
  const street = part("route")
  const number = part("street_number")
  const addressLine1 = [number, street].filter(Boolean).join(" ") || part("premise")
  return {
    addressLine1,
    city: part("locality") || part("postal_town") || part("sublocality_level_1") || part("administrative_area_level_2"),
    stateOrRegion: part("administrative_area_level_1", true),
    postalCode: [part("postal_code"), part("postal_code_suffix")].filter(Boolean).join("-"),
    countryCode
  }
}
