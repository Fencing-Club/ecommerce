import { describe, expect, it } from "vitest"
import {
  groupReceivers,
  isAmazonNetwork,
  orderDestination,
  receiverFor,
  receiverIds,
  receivers,
  validatePacking,
  type PackingItem
} from "../src/index"

const item = (id: string, receiver: PackingItem["receiver"]): PackingItem => ({
  id,
  buyerSku: id,
  pieces: 10,
  piecesPerSet: 1,
  asin: "B000000001",
  fnsku: "X000000001",
  receiver
})
const carton = (cartonId: string, ...itemIds: string[]) => ({
  cartonId,
  length: 40,
  width: 30,
  height: 30,
  weight: 5,
  items: itemIds.map((itemId) => ({ itemId, pieces: 5 }))
})

describe("receivers", () => {
  it("groups Amazon's networks apart from the buyer's own location", () => {
    expect(groupReceivers("amazon")).toEqual(["fba", "awd_us"])
    expect(groupReceivers("warehouse")).toEqual(["warehouse"])
    expect(receiverIds.filter(isAmazonNetwork)).toEqual(["fba", "awd_us"])
    expect(receivers.warehouse).not.toHaveProperty("cartonPolicy")
  })

  it("reads where a PO goes from its lines", () => {
    expect(orderDestination({ items: [item("bag", "awd_us")] })).toBe("amazon")
    expect(orderDestination({ items: [item("bag", "warehouse")] })).toBe("warehouse")
  })

  it("keeps a product's own receiver when it is in the PO's group", () => {
    expect(receiverFor("amazon", "awd_us")).toBe("awd_us")
    expect(receiverFor("amazon", "warehouse")).toBe("fba")
    expect(receiverFor("amazon")).toBe("fba")
    expect(receiverFor("warehouse", "awd_us")).toBe("warehouse")
  })

  it("checks each carton by its receiver's policy, and a mixed carton by the strictest", () => {
    const order = { items: [item("bag", "fba"), item("towel", "fba"), item("cord", "awd_us")] }
    // FBA takes mixed SKUs; AWD takes one SKU a carton.
    expect(validatePacking(order, { cartons: [carton("A1", "bag", "towel")], changes: [] }).valid).toBe(true)
    const mixed = validatePacking(order, { cartons: [carton("A1", "bag", "cord")], changes: [] })
    expect(mixed.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["mixedNetworks", "oneSku"]))
    const warehouse = { items: [item("bag", "warehouse"), item("cord", "warehouse")] }
    expect(validatePacking(warehouse, { cartons: [carton("A1", "bag", "cord")], changes: [] }).valid).toBe(true)
  })
})
