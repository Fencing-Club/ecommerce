import { z } from "zod"

// Formats the international numbers Copacker sees most. Anything unrecognized is shown as saved rather than guessed.
const formats: Array<{ pattern: RegExp; format: (digits: RegExpMatchArray) => string }> = [
  // North America: +1 (425) 260-2501
  { pattern: /^1(\d{3})(\d{3})(\d{4})$/, format: ([, area, prefix, line]) => `+1 (${area}) ${prefix}-${line}` },
  // China mobile: +86 188 6161 3263
  { pattern: /^86(1\d{2})(\d{4})(\d{4})$/, format: ([, carrier, block, line]) => `+86 ${carrier} ${block} ${line}` }
]

export function formatPhone(value: string) {
  const trimmed = value.trim()
  if (!trimmed.startsWith("+")) {
    return trimmed
  }
  const digits = trimmed.replace(/\D/g, "")
  for (const { pattern, format } of formats) {
    const match = digits.match(pattern)
    if (match) {
      return format(match)
    }
  }
  return trimmed
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
  }, "Enter a phone number")
