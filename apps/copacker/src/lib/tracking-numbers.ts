import { z } from "zod"

// A carrier's tracking number as it's stored: capitals and digits, without the spaces labels print between groups.
export const trackingNumberSchema = z
  .string()
  .transform((value) => compact(value))
  .pipe(z.string().regex(/^[A-Z0-9]{6,40}$/, "shipments.carrierLabels.trackingInvalid"))

const compact = (value: string) => value.replace(/\s+/g, "").toUpperCase()

// UPS numbers start 1Z and have 16 more letters and digits, which labels print in groups ("1Z 4F7 E21 03 9382 1041").
const ups = /\b1Z(?:\s?[0-9A-Z]){16}\b/i
// Other carriers print a heading before the number: FedEx "TRK#", USPS "USPS TRACKING #", DHL "WAYBILL". The number is
// groups of digits.
const headed = /(?:TRACKING\s*(?:#|NUMBER|NO\.?)?|TRK\s*#?|WAYBILL|AWB)\s*[:#]?\s*(\d[\d ]{8,40}\d)/i

// The tracking number on one page of a carrier's label, read from the page's text, or null when none can be found.
export function readTrackingNumber(text: string) {
  const found = text.match(ups)?.[0] ?? text.match(headed)?.[1]
  const number = found && compact(found)
  return number && trackingNumberSchema.safeParse(number).success ? number : null
}
