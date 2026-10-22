import { describe, expect, it } from "vitest"
import { fitsConfiguration, readLabelMeasurements } from "../src/lib/label-measurements"

const rounded = ({ weight, dimensions }: ReturnType<typeof readLabelMeasurements>) => ({
  weight: weight === undefined ? undefined : Math.round(weight * 100) / 100,
  dimensions: dimensions?.map((value) => Math.round(value * 10) / 10)
})

describe("reading the weight and size a carrier's label prints", () => {
  it("reads FedEx's actual weight and dimensions", () => {
    const text = "SHIP DATE: 20OCT26\nACTWGT: 27.40 LB\nCAD: 123456789/TAAS1234\nDIMMED: 24 X 16 X 16 IN"
    expect(rounded(readLabelMeasurements(text))).toEqual({ weight: 12.43, dimensions: [61, 40.6, 40.6] })
  })

  it("reads USPS pounds and ounces, and DHL's pounds, without a size", () => {
    expect(rounded(readLabelMeasurements("PRIORITY MAIL®\n27 lb 6 oz\nMailed from 90210"))).toEqual({
      weight: 12.42,
      dimensions: undefined
    })
    expect(rounded(readLabelMeasurements("Ship Date: 2026-10-20\nMailed From: 90210\n28 LB"))).toEqual({
      weight: 12.7,
      dimensions: undefined
    })
  })

  it("reads metric weights and sizes, longest side first", () => {
    expect(rounded(readLabelMeasurements("Weight: 15.2 kg\nDimensions: 40 x 60 x 50 cm"))).toEqual({
      weight: 15.2,
      dimensions: [60, 50, 40]
    })
  })

  it("reads UPS dimensional weight sizes", () => {
    expect(readLabelMeasurements("28 LBS 1 OF 1\nDWT: 24,16,16").dimensions?.map(Math.round)).toEqual([61, 41, 41])
  })

  it("reads nothing from a page without them", () => {
    expect(readLabelMeasurements("FedEx Tracking ID# 7788 9900 1136\nParcel Select")).toEqual({})
  })
})

describe("a label's weight and size against a carton configuration", () => {
  const a = { length: 60, width: 40, height: 40, weight: 12.4 }
  const b = { length: 60, width: 40, height: 50, weight: 15.2 }

  it("fits allowing for carriers rounding up to the next pound and inch", () => {
    const fedex = readLabelMeasurements("ACTWGT: 27.40 LB\nDIMMED: 24 X 16 X 16 IN")
    expect([fitsConfiguration(fedex, a), fitsConfiguration(fedex, b)]).toEqual([true, false])
    const dhl = readLabelMeasurements("34 LB")
    expect([fitsConfiguration(dhl, a), fitsConfiguration(dhl, b)]).toEqual([false, true])
  })

  it("allows no more than a pound or an inch", () => {
    expect(fitsConfiguration(readLabelMeasurements("ACTWGT: 28.20 LB"), a)).toBe(true)
    expect(fitsConfiguration(readLabelMeasurements("ACTWGT: 28.50 LB"), a)).toBe(false)
    expect(fitsConfiguration(readLabelMeasurements("DIMMED: 25 X 16 X 16 IN"), a)).toBe(false)
  })

  it("needs every printed measure to fit", () => {
    expect(fitsConfiguration(readLabelMeasurements("ACTWGT: 27.40 LB\nDIMMED: 24 X 16 X 20 IN"), a)).toBe(false)
  })

  it("fits nothing when the label prints neither", () => {
    expect(fitsConfiguration({}, a)).toBe(false)
  })
})
