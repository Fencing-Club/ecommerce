import { describe, expect, it } from "vitest"
import { amazonSources } from "../src/carton-policies"
import { checkPallets, type PackingItem, type PackingOrder } from "../src/index"
import {
  checkPallet,
  footprintLimit,
  heightLimit,
  palletPolicies,
  palletWeightLimit,
  type PolicyPallet
} from "../src/pallet-policies"

const pallet = (overrides: Partial<PolicyPallet> = {}): PolicyPallet => ({
  palletId: "1",
  length: 120,
  width: 100,
  height: 150,
  weight: 400,
  stackable: false,
  ...overrides
})
const codes = (checked: PolicyPallet) =>
  checkPallet(palletPolicies.fba, checked).map(({ issue, fields }) => [issue.code, ...fields])

describe("pallet policies", () => {
  it("converts Amazon's limits to centimetres and whole kilograms", () => {
    const [footprint, , height, weight] = palletPolicies.fba.rules
    expect(footprint?.type === "footprint" && footprintLimit(footprint)).toEqual({
      lengthCm: 121.9,
      widthCm: 101.6,
      lengthIn: 48,
      widthIn: 40
    })
    expect(height?.type === "maxHeight" && heightLimit(height)).toEqual({
      maxCm: 182.9,
      maxIn: 72,
      stackable: { maxCm: 127, maxIn: 50 }
    })
    expect(weight?.type === "maxWeight" && palletWeightLimit(weight)).toEqual({ maxKg: 680, maxLb: 1500 })
  })

  it("lets a pallet fit the footprint either way round, and outlines the sides that don't", () => {
    expect(codes(pallet({ length: 101.6, width: 121.9 }))).toEqual([])
    expect(codes(pallet({ length: 130 }))).toEqual([["palletFootprint", "length"]])
    expect(codes(pallet({ length: 100, width: 125 }))).toEqual([["palletFootprint", "width"]])
  })

  it("holds a stackable pallet lower than one that isn't", () => {
    expect(codes(pallet({ height: 190 }))).toEqual([["palletHeight", "height"]])
    expect(codes(pallet({ height: 140 }))).toEqual([])
    expect(codes(pallet({ height: 140, stackable: true }))).toEqual([["stackableHeight", "height"]])
  })

  it("checks weight against 1,500 lb exactly, though it's shown as 680 kg", () => {
    expect(codes(pallet({ weight: 680.38 }))).toEqual([])
    expect(codes(pallet({ weight: 681 }))).toEqual([["palletWeight", "weight"]])
  })

  it("checks nothing a supplier hasn't entered yet", () => {
    expect(codes(pallet({ length: Number.NaN, width: Number.NaN, height: Number.NaN, weight: Number.NaN }))).toEqual([])
  })

  it("names the receiver and the page that states the rule", () => {
    expect(checkPallet(palletPolicies.awd_us, pallet({ height: 190 }))).toEqual([
      {
        issue: { code: "palletHeight", values: { receiver: "AWD", pallet: "1", maxCm: 182.9, maxIn: 72 } },
        fields: ["height"],
        source: amazonSources.freight
      }
    ])
  })
})

describe("checkPallets", () => {
  const item = (id: string, amazonNetwork: PackingItem["amazonNetwork"]): PackingItem => ({
    id,
    buyerSku: id,
    pieces: 100,
    piecesPerSet: 1,
    amazonNetwork
  })
  const order: PackingOrder = { destination: "amazon", items: [item("bag", "fba"), item("towel", "awd_us")] }
  const cartons = [
    { cartonId: "A1", items: [{ itemId: "bag", pieces: 10 }] },
    { cartonId: "B1", items: [{ itemId: "towel", pieces: 10 }] }
  ]
  const tall = { ...pallet({ height: 190 }), cartonIds: ["A1"] }

  it("follows the policy of where the pallet's cartons go, AWD's when any go there", () => {
    expect(checkPallets(order, { cartons, pallets: [tall] })[0]).toMatchObject({ values: { receiver: "FBA" } })
    // A pallet goes to one network, so one with both networks' cartons is refused too.
    const mixed = checkPallets(order, { cartons, pallets: [{ ...tall, cartonIds: ["A1", "B1"] }] })
    expect(mixed[0]).toMatchObject({ code: "palletMixedNetworks", values: { pallet: tall.palletId } })
    expect(mixed[1]).toMatchObject({ values: { receiver: "AWD" } })
  })

  it("leaves pallets to the buyer's own warehouse, and pallets with no cartons yet, unchecked", () => {
    expect(checkPallets({ ...order, destination: "warehouse" }, { cartons, pallets: [tall] })).toEqual([])
    expect(checkPallets(order, { cartons, pallets: [{ ...tall, cartonIds: [] }] })).toEqual([])
  })
})
