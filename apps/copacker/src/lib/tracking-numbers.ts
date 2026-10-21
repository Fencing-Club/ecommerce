import { getTracking } from "ts-tracking-number"
import { z } from "zod"

// A carrier's tracking number as it's stored: capitals and digits, without the spaces labels print between groups.
export const trackingNumberSchema = z
  .string()
  .transform((value) => compact(value))
  .pipe(z.string().regex(/^[A-Z0-9]{6,40}$/, "shipments.carrierLabels.trackingInvalid"))

const compact = (value: string) => value.replace(/\s+/g, "").toUpperCase()

// A run of digits in the groups labels print them in ("8788 2956 8662"), maybe after a letter, or a UPS number.
const candidate = /1Z(?:\s?[0-9A-Z]){16}|[A-Z]?\d[\d ]{9,}\d/gi
// Filler some labels print where a number would go, such as 0000 0000 0000.
const filler = /^(\d)\1+$/

// The tracking number on one page of a carrier's label, read from the page's text a line at a time: the first run of
// letters and digits whose carrier format and check digit hold. Some carriers hand the last leg to USPS and print its
// number too, as DHL eCommerce and FedEx Ground Economy do, so the carrier's own number comes first. Null when the
// page has none, such as a label that's only a picture.
export function readTrackingNumber(text: string) {
  return pick(text.split("\n").flatMap((line) => [...line.matchAll(candidate)].map(([match]) => [compact(match)])))
}

// The tracking number in a label's barcodes, for a page with no text to read it from, such as a UPS label that's a
// picture. UPS's barcode holds the number as it is. USPS's starts with 420 and the ZIP code, of five or nine digits.
// FedEx's starts with 96 and ends with the number. Each barcode gives its first reading whose check digit holds, and
// the carrier's own number comes ahead of a USPS one, as on the page.
export function readTrackingFromBarcodes(values: string[]) {
  return pick(
    values.map((value) => {
      const code = compact(value).replace(/[^0-9A-Z]/g, "")
      if (/^420\d/.test(code)) {
        return [code.slice(8), code.slice(12)]
      }
      return /^96\d{20,32}$/.test(code) ? [code.slice(-12), code.slice(-15), code.slice(-20), code.slice(-22)] : [code]
    })
  )
}

// The tracking number among the readings of the numbers on a page, each tried in turn until one is valid.
function pick(readings: string[][]) {
  const found = readings.flatMap((tries) => {
    for (const reading of tries) {
      const tracking = getTracking(reading)
      if (tracking && !filler.test(tracking.trackingNumber)) {
        return [tracking]
      }
    }
    return []
  })
  return (found.find((tracking) => tracking.courier.code !== "usps") ?? found[0])?.trackingNumber ?? null
}
