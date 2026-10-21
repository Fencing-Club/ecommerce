import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import {
  amazonSources,
  type CartonPolicy,
  cartonLimits,
  cartonPolicies,
  checkCarton,
  type PolicyCarton,
  sizeLimit,
  weightLimit
} from "../src/carton-policies"
import type { PackingItem } from "../src/index"

const item = (buyerSku: string, piecesPerSet = 1, ids = { asin: "B000000001", fnsku: "X000000001" }): PackingItem => ({
  id: randomUUID(),
  buyerSku,
  ...ids,
  pieces: 1000,
  piecesPerSet,
  amazonNetwork: "fba"
})
const bag = item("DB-2031")
const towel = item("CT-3100", 2)
const carton = (
  size: [number, number, number],
  weight: number,
  contents: Array<[ReturnType<typeof item>, number]>
): PolicyCarton => ({
  length: size[0],
  width: size[1],
  height: size[2],
  weight,
  contents: contents.map(([product, pieces]) => ({ item: product, pieces, units: pieces / product.piecesPerSet }))
})
const codes = (policy: CartonPolicy, checked: PolicyCarton, earlier: PolicyCarton[] = []) =>
  checkCarton(policy, checked, earlier).map(({ issue, fields }) => [issue.code, ...(fields ?? [])])

describe("carton policies", () => {
  it("converts limits from the units Amazon states them in, rounding a converted weight down", () => {
    expect(cartonLimits(cartonPolicies.fba)).toEqual({
      size: {
        shape: "box",
        lengthCm: 91.44,
        widthCm: 63.5,
        heightCm: 63.5,
        lengthIn: 36,
        widthIn: 25,
        heightIn: 25
      },
      weight: { maxKg: 22.67, maxLb: 50 },
      maxUnits: null,
      oneSku: false,
      samePacking: false,
      exceptOneUnit: true
    })
    expect(cartonLimits(cartonPolicies.awd_us)).toMatchObject({
      size: { shape: "cube", lengthCm: 63.5, lengthIn: 25 },
      maxUnits: 150,
      oneSku: true,
      samePacking: true,
      exceptOneUnit: false
    })
    expect(sizeLimit({ sides: [60, 40, 40], unit: "cm" })).toMatchObject({ lengthIn: 23.6220472441 })
    expect(weightLimit({ weight: 20, unit: "kg" })).toEqual({ maxKg: 20, maxLb: 44.09 })
  })

  it("lets an FBA carton fit its limit in any orientation, and outlines the sides that don't", () => {
    expect(codes(cartonPolicies.fba, carton([100, 40, 40], 12, [[bag, 160]]))).toEqual([["cartonSize", "length"]])
    expect(codes(cartonPolicies.fba, carton([40, 80, 40], 12, [[bag, 160]]))).toEqual([])
    expect(codes(cartonPolicies.fba, carton([70, 70, 40], 12, [[bag, 160]]))).toEqual([["cartonSize", "width"]])
    expect(codes(cartonPolicies.awd_us, carton([70, 70, 40], 12, [[bag, 100]]))).toEqual([
      ["cartonSize", "length", "width"]
    ])
  })

  it("excepts a carton holding one sellable unit from FBA's size and weight limits only", () => {
    expect(codes(cartonPolicies.fba, carton([120, 70, 40], 30, [[bag, 1]]))).toEqual([])
    expect(codes(cartonPolicies.fba, carton([120, 70, 40], 30, [[towel, 2]]))).toEqual([])
    expect(codes(cartonPolicies.fba, carton([60, 40, 40], 30, [[bag, 2]]))).toEqual([["cartonWeight", "weight"]])
    expect(codes(cartonPolicies.awd_us, carton([60, 40, 40], 30, [[bag, 1]]))).toEqual([["cartonWeight", "weight"]])
  })

  it("names the receiver, SKU and limit in what a carton breaks", () => {
    const issues = checkCarton(
      cartonPolicies.awd_us,
      carton([60, 40, 40], 12, [
        [bag, 160],
        [towel, 40]
      ]),
      []
    ).map(({ issue }) => issue)
    expect(issues).toEqual([
      { code: "oneSku", values: { receiver: "AWD" } },
      { code: "unitsPerCarton", values: { receiver: "AWD", sku: "DB-2031", units: 160, max: 150 } }
    ])
  })

  it("holds every carton of a SKU to the packing of its first, and names it", () => {
    const first = carton([60, 40, 40], 12, [[bag, 100]])
    const second = carton([60, 40, 41], 12, [[bag, 100]])
    expect(codes(cartonPolicies.awd_us, carton([60, 40, 40], 12, [[bag, 100]]), [first])).toEqual([])
    expect(checkCarton(cartonPolicies.awd_us, carton([60, 40, 40], 12, [[bag, 90]]), [first, second])).toEqual([
      {
        issue: {
          code: "samePacking",
          values: { receiver: "AWD", sku: "DB-2031", units: 100, length: 60, width: 40, height: 40, weight: 12 }
        },
        // Where AWD states the rule, for its error to link to.
        source: amazonSources.awdInventory
      }
    ])
    expect(codes(cartonPolicies.fba, carton([60, 40, 41], 12, [[bag, 90]]), [first])).toEqual([])
  })

  it("requires Amazon's product identifiers", () => {
    const unlisted = item("DB-2032", 1, { asin: "", fnsku: "X000000002" })
    expect(checkCarton(cartonPolicies.fba, carton([60, 40, 40], 12, [[unlisted, 10]]), [])).toEqual([
      { issue: { code: "missingAsin", values: { receiver: "FBA", sku: "DB-2032" } } }
    ])
  })

  it("keeps an FBA carton to one of Amazon's packing groups, once Amazon has set them", () => {
    const mixed = carton([40, 30, 30], 5, [
      [bag, 10],
      [towel, 10]
    ])
    // Before Amazon plans the shipment, there are no groups to break.
    expect(codes(cartonPolicies.fba, mixed)).toEqual([])
    expect(checkCarton(cartonPolicies.fba, mixed, [], { "DB-2031": "PG-1", "CT-3100": "PG-1" })).toEqual([])
    expect(checkCarton(cartonPolicies.fba, mixed, [], { "DB-2031": "PG-1", "CT-3100": "PG-2" })).toEqual([
      {
        issue: { code: "packingGroups", values: { receiver: "FBA", sku: "DB-2031", other: "CT-3100" } },
        source: amazonSources.packingGroups
      }
    ])
  })

  it("checks a new receiver's cartons from its rules alone", () => {
    // A 3PL that states its limits in metric units and takes no Amazon identifiers.
    const warehouse: CartonPolicy = {
      receiver: "Bayline",
      rules: [
        { type: "maxSize", sides: [60, 40, 40], unit: "cm", description: "Boxes up to 60 × 40 × 40 cm." },
        { type: "maxWeight", weight: 20, unit: "kg", description: "Boxes up to 20 kg." },
        { type: "maxUnits", units: 48, description: "Up to 48 units a box." }
      ]
    }
    const unlisted = item("DB-2032", 1, { asin: "", fnsku: "" })
    expect(codes(warehouse, carton([60, 40, 40], 20, [[unlisted, 48]]))).toEqual([])
    expect(codes(warehouse, carton([61, 40, 40], 21, [[unlisted, 49]]))).toEqual([
      ["cartonSize", "length"],
      ["cartonWeight", "weight"],
      ["unitsPerCarton"]
    ])
  })
})
