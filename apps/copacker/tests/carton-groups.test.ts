import { describe, expect, it } from "vitest"
import {
  type CartonGroup,
  cartonGroupSchema,
  cartonMeasures,
  checkCartons,
  expandCartonGroups,
  groupCartonIds,
  maxCartons,
  nextCartonId,
  nextPalletId,
  packedPallets,
  packedPieces,
  packingDraft,
  packingEditorSchema,
  palletCartons,
  physicalCartons,
  piecesLeft,
  totalPiecesLeft
} from "@/lib/carton-groups"
import { towelOrder } from "@/stories/fixtures/packing"
import { pickupAddress } from "@/stories/fixtures/purchase-orders"

const [natural, , teaTowel] = towelOrder.items
const group = (cartonId: string, count: number, cartonIds: string[] = []): CartonGroup => ({
  cartonId,
  cartonIds,
  count,
  length: 60,
  width: 40,
  height: 40,
  weight: 12.4,
  items: [{ itemId: natural!.id, pieces: 24 }]
})

describe("carton configuration letters", () => {
  it("letters each new configuration and numbers its cartons from 1", () => {
    expect(nextCartonId([])).toBe("A1")
    const groups = [group("A1", 10), group("B1", 6)]
    expect(nextCartonId(groups)).toBe("C1")
    expect(groupCartonIds(groups)).toEqual([
      ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10"],
      ["B1", "B2", "B3", "B4", "B5", "B6"]
    ])
    // A deleted configuration's letter isn't reused while a later one is in use; past Z come AA, AB.
    expect(nextCartonId([group("A1", 1), group("C1", 1)])).toBe("D1")
    expect(
      nextCartonId(Array.from({ length: 26 }, (_, index) => group(`${String.fromCharCode(65 + index)}1`, 1)))
    ).toBe("AA1")
  })

  it("keeps saved IDs and carries on a configuration's numbers when its count grows", () => {
    expect(groupCartonIds([group("A1", 4, ["A1", "A2", "A3"])])).toEqual([["A1", "A2", "A3", "A4"]])
    // A number another row already has falls back to a suffix.
    expect(expandCartonGroups([group("A1", 2), group("A2", 1)]).map((carton) => carton.cartonId)).toEqual([
      "A1",
      "A1-2",
      "A2"
    ])
  })

  it("lists each physical carton for the pallets, with its configuration and contents by supplier SKU", () => {
    const cartons = palletCartons(
      [group("A1", 2), { ...group("B1", 1), items: [{ itemId: teaTowel!.id, pieces: 60 }] }],
      towelOrder.items
    )
    expect(cartons.map((carton) => [carton.id, carton.group, carton.units])).toEqual([
      ["A1", 0, 24],
      ["A2", 0, 24],
      ["B1", 1, 60]
    ])
    expect(cartons[2]!.contents).toEqual([{ sku: "NT-CT-3100", name: teaTowel!.name, pieces: 60 }])
  })

  it("numbers a new pallet after those there are, skipping numbers in use", () => {
    const pallet = { length: 120, width: 100, height: 90, weight: 62, stackable: true, cartonIds: [] }
    expect(nextPalletId([])).toBe("1")
    expect(
      nextPalletId([
        { ...pallet, palletId: "1" },
        { ...pallet, palletId: "3" }
      ])
    ).toBe("4")
  })
})

describe("carton rules", () => {
  const pallet = (palletId: string, cartonIds: string[], weight = 62) => ({
    palletId,
    length: 120,
    width: 100,
    height: 90,
    weight,
    stackable: true,
    cartonIds
  })

  it("holds at most maxCartons, and past it no physical carton is listed", () => {
    expect(physicalCartons([group("A1", maxCartons)])).toHaveLength(maxCartons)
    expect(physicalCartons([group("A1", maxCartons), group("B1", 1)])).toEqual([])
    expect(cartonGroupSchema.shape.count.safeParse(maxCartons + 1).success).toBe(false)
  })

  it("checks complete cartons against what the purchase order has left after its other shipments", () => {
    const tooMany = { ...group("A1", 11), items: [{ itemId: natural!.id, pieces: 24 }] }
    expect(checkCartons(towelOrder, [tooMany], {}).map((issue) => issue.code)).toEqual(["overQuantity"])
    expect(checkCartons(towelOrder, [group("A1", 10)], {})).toEqual([])
    expect(checkCartons(towelOrder, [group("A1", 10)], { [natural!.id]: 1 }).map((issue) => issue.code)).toEqual([
      "overQuantity"
    ])
    // An incomplete carton shows its own fields' errors instead.
    expect(checkCartons(towelOrder, [{ ...tooMany, weight: Number.NaN }], {})).toEqual([])
  })

  it("counts the pieces of each line packed and left to pack", () => {
    expect(packedPieces(physicalCartons([group("A1", 3)]))).toEqual({ [natural!.id]: 72 })
    expect(piecesLeft(natural!, { [natural!.id]: 200 })).toBe(40)
    expect(piecesLeft(natural!, { [natural!.id]: 300 })).toBe(0)
    expect(totalPiecesLeft(towelOrder.items, { [natural!.id]: 40 })).toBe(500)
  })

  it("sums the cartons' weight and volume, or the pallets' when packed on them, once each is complete", () => {
    expect(cartonMeasures([group("A1", 2)])).toEqual({ cartons: 2, units: 48, weight: 24.8, volume: 0.192 })
    expect(cartonMeasures([group("A1", 2), { ...group("B1", 1), weight: Number.NaN }])).toMatchObject({
      cartons: 3,
      weight: null,
      volume: null
    })
    expect(cartonMeasures([group("A1", 2)], [pallet("1", ["A1", "A2"])])).toMatchObject({ weight: 62, volume: 1.08 })
    expect(cartonMeasures([group("A1", 2)], [])).toMatchObject({ weight: null, volume: null })
  })

  it("saves each physical carton, and the pallets only when packed on them, holding cartons the packing has", () => {
    const values = (palletized: boolean) => ({
      readyDate: "",
      origin: pickupAddress,
      cartons: [{ ...group("A1", 2), weight: Number.NaN }],
      palletized,
      pallets: [pallet("1", ["A1", "Z9"])],
      changes: []
    })
    const draft = packingDraft(values(true))
    expect(draft.cartons?.map((carton) => carton.cartonId)).toEqual(["A1", "A2"])
    // Blank fields are left out.
    expect(draft.cartons?.[0]).not.toHaveProperty("weight")
    expect(draft.pallets).toEqual([pallet("1", ["A1"])])
    expect(packingDraft(values(false))).not.toHaveProperty("pallets")
    expect(packedPallets([pallet("1", ["A1", "Z9"])], [{ cartonId: "A1" }])).toEqual([pallet("1", ["A1"])])
  })
})

describe("packing editor", () => {
  const schema = packingEditorSchema("UTC")
  const values = (palletized: boolean, weight: number) => ({
    readyDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    origin: pickupAddress,
    cartons: [group("A1", 1)],
    palletized,
    pallets: [{ palletId: "1", length: 120, width: 100, height: 90, weight, stackable: true, cartonIds: ["A1"] }],
    changes: []
  })

  it("checks pallets only when the cartons are packed on them", () => {
    expect(schema.safeParse(values(true, 62)).success).toBe(true)
    expect(schema.safeParse(values(false, Number.NaN)).success).toBe(true)
    const result = schema.safeParse(values(true, Number.NaN))
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([["pallets", 0, "weight"]])
  })
})
