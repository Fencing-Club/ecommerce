import { isSupportedCountry, parsePhoneNumberFromString } from "libphonenumber-js"
import { z } from "zod"

// Formats the international numbers Copacker sees most. Anything unrecognized is shown as saved rather than guessed.
export function formatPhone(value: string, countryCode?: string) {
  const trimmed = value.normalize("NFKC").trim()
  const country = countryCode?.toUpperCase()
  const parsed = parsePhoneNumberFromString(trimmed, {
    defaultCountry: country && isSupportedCountry(country) ? country : undefined,
    extract: false
  })
  if (!parsed?.isPossible()) {
    return trimmed
  }
  // Keep the familiar North American presentation, including extensions.
  return parsed.countryCallingCode === "1" ? `+1 ${parsed.formatNational()}` : parsed.formatInternational()
}

export function phoneHref(value: string) {
  return `tel:${value.replace(/[^\d+]/g, "")}`
}

// An extension after the number, such as "ext. 12" or "x12".
const extension = /\s*(?:ext\.?|x)\s*\d{1,6}$/i

// A phone number as typed, or nothing: at least six digits and no letters besides an extension, so a name, an email
// address or part of a number is caught. Full-width digits and brackets from a Chinese keyboard are saved as plain
// ones, which a phone can dial.
export const phoneSchema = z
  .string()
  .normalize("NFKC")
  .trim()
  .max(30)
  .refine((value) => {
    const number = value.replace(extension, "")
    return !value || ((number.match(/\d/g)?.length ?? 0) >= 6 && !/\p{L}/u.test(number))
  }, "partners.phone.invalid")
