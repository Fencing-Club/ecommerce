// The weight and size a carrier's label prints, read from the page's text, and whether they fit a carton
// configuration. Carriers print them their own way: FedEx "ACTWGT: 27.40 LB" and "DIMMED: 24 X 16 X 16 IN", USPS
// "27 lb 6 oz", DHL eCommerce "28 LB", UPS "DWT: 24,16,16". UPS labels bought through Shopify are pictures, with no
// text to read.
export type LabelMeasurements = {
  // Kilograms.
  weight?: number
  // Centimetres, longest first.
  dimensions?: [number, number, number]
}

const kilogramsPerPound = 0.453_592_37
const centimetresPerInch = 2.54
const amount = String.raw`(\d+(?:\.\d+)?)`

// The first pattern that matches gives the weight: a carrier's actual weight ahead of any other.
const weights: Array<[RegExp, (match: RegExpMatchArray) => number]> = [
  [new RegExp(String.raw`ACT\s*WGT:?\s*${amount}\s*(LB|KG)`, "i"), ([, value, unit]) => toKilograms(value, unit)],
  [
    new RegExp(String.raw`\b${amount}\s*lbs?\s+${amount}\s*oz\b`, "i"),
    ([, pounds, ounces]) => (Number(pounds) + Number(ounces) / 16) * kilogramsPerPound
  ],
  [new RegExp(String.raw`\b${amount}\s*(lbs?|kgs?)\b`, "i"), ([, value, unit]) => toKilograms(value, unit)],
  [new RegExp(String.raw`\b${amount}\s*oz\b`, "i"), ([, ounces]) => (Number(ounces) / 16) * kilogramsPerPound]
]
const dimensions: Array<[RegExp, (match: RegExpMatchArray) => number[]]> = [
  [
    new RegExp(String.raw`\b${amount}\s*[x×]\s*${amount}\s*[x×]\s*${amount}\s*(in|cm)\b`, "i"),
    ([, length, width, height, unit]) =>
      [length, width, height].map((value) => Number(value) * (/^cm$/i.test(unit ?? "") ? 1 : centimetresPerInch))
  ],
  [
    new RegExp(String.raw`\bDWT:?\s*${amount}\s*,\s*${amount}\s*,\s*${amount}`, "i"),
    ([, length, width, height]) => [length, width, height].map((value) => Number(value) * centimetresPerInch)
  ]
]

function toKilograms(value: string | undefined, unit: string | undefined) {
  return Number(value) * (/^kg/i.test(unit ?? "") ? 1 : kilogramsPerPound)
}

function first<T>(text: string, patterns: Array<[RegExp, (match: RegExpMatchArray) => T]>) {
  for (const [pattern, read] of patterns) {
    const match = text.match(pattern)
    if (match) {
      return read(match)
    }
  }
  return undefined
}

export function readLabelMeasurements(text: string): LabelMeasurements {
  const weight = first(text, weights)
  const size = first(text, dimensions)
  const measured: LabelMeasurements = {}
  if (weight && Number.isFinite(weight)) {
    measured.weight = weight
  }
  if (size?.every((value) => Number.isFinite(value) && value > 0)) {
    const [longest = 0, middle = 0, shortest = 0] = size.toSorted((a, b) => b - a)
    measured.dimensions = [longest, middle, shortest]
  }
  return measured
}

// Whether everything a label prints fits a carton configuration, allowing for carriers rounding to the next pound or
// inch: its weight within a pound of the carton's, and each side within an inch. A label that prints neither fits
// nothing.
export function fitsConfiguration(
  measured: LabelMeasurements,
  configuration: { length: number; width: number; height: number; weight: number }
) {
  if (measured.weight === undefined && !measured.dimensions) {
    return false
  }
  if (measured.weight !== undefined && Math.abs(measured.weight - configuration.weight) > kilogramsPerPound) {
    return false
  }
  const expected = [configuration.length, configuration.width, configuration.height].toSorted((a, b) => b - a)
  return (
    !measured.dimensions ||
    measured.dimensions.every((value, index) => Math.abs(value - (expected[index] ?? 0)) <= centimetresPerInch)
  )
}
