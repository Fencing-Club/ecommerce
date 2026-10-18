import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import {
  orderInputSchema,
  packingSchema,
  validatePacking,
  buildAwdRequest,
  buildFbaPlan,
  cartonNetworks,
  fbaBoxes,
  splitByNetwork,
  commercialChanges,
  approveChanges,
  money
} from "../src/index"
import {
  destinationName,
  destinationRequirements,
  isCartonRule,
  itemRequirements,
  requirementText
} from "../src/requirements"
const itemId = randomUUID()
const order = orderInputSchema.parse({
  supplierId: randomUUID(),
  reference: "PO-37",
  destination: "amazon",
  currency: "USD",
  dueDate: "2026-10-10",
  items: [
    {
      id: itemId,
      variantId: "gid://shopify/ProductVariant/1",
      inventoryItemId: "gid://shopify/InventoryItem/1",
      name: "Foil body cord",
      variant: "Two pack",
      buyerSku: "foil-2",
      supplierSku: "B02",
      asin: "B000000001",
      fnsku: "X000000001",
      pieces: 320,
      piecesPerSet: 2,
      unitPrice: 210,
      amazonNetwork: "awd_us"
    }
  ]
})
const packing = packingSchema.parse({
  readyDate: "2026-10-05",
  origin: {
    name: "Supplier",
    addressLine1: "13 Changxing Road",
    city: "Zhangjiagang",
    stateOrRegion: "Jiangsu",
    postalCode: "215600",
    countryCode: "CN",
    phoneNumber: "+8618861613263",
    email: "supplier@example.com"
  },
  cartons: ["A6", "A7"].map((cartonId) => ({
    cartonId,
    length: 50,
    width: 40,
    height: 30,
    weight: 15,
    items: [{ itemId, pieces: 160 }]
  }))
})
describe("Supplier piece and carton contract", () => {
  it("groups identical physical cartons and converts pieces to sellable packs", () => {
    expect(validatePacking(order, packing).valid).toBe(true)
    const request = buildAwdRequest(order, packing, "copacker-test")
    expect(request.packagesToInbound).toHaveLength(1)
    expect(request.packagesToInbound[0]?.count).toBe(2)
    expect(request.packagesToInbound[0]?.distributionPackage.contents.products[0]?.quantity).toBe(80)
    expect(request.originAddress).not.toHaveProperty("email")
    expect(packing.cartons.map((c) => c.cartonId)).toEqual(["A6", "A7"])
  })
  it.each([63.5001, 70])("rejects oversized cartons (%s cm)", (length) => {
    const p = structuredClone(packing)
    p.cartons[0]!.length = length
    expect(validatePacking(order, p).valid).toBe(false)
  })
  it("applies Amazon's carton rules only to Amazon shipments", () => {
    const p = structuredClone(packing)
    p.cartons[0]!.length = 90
    p.cartons[0]!.weight = 30
    const toWarehouse = { ...order, destination: "warehouse" as const, deliveryId: crypto.randomUUID() }
    toWarehouse.items = toWarehouse.items.map((item) => ({ ...item, fnsku: "" }))
    expect(validatePacking(toWarehouse, p).valid).toBe(true)
    expect(validatePacking(order, p).valid).toBe(false)
    // Complete sets still apply everywhere.
    p.cartons[0]!.items[0]!.pieces = 3
    expect(validatePacking(toWarehouse, p).issues.map((issue) => issue.code)).toContain("incompletePacks")
  })
  it("requires a delivery address for the buyer's own location", () => {
    expect(orderInputSchema.safeParse({ ...order, destination: "warehouse" }).success).toBe(false)
  })
  it("stops at a forwarder on the way to Amazon or the buyer's own location, never ends there", () => {
    const via = { forwarderId: randomUUID(), addressId: randomUUID() }
    expect(orderInputSchema.safeParse({ ...order, via }).success).toBe(true)
    expect(
      orderInputSchema.safeParse({ ...order, destination: "warehouse", deliveryId: randomUUID(), via }).success
    ).toBe(true)
    expect(orderInputSchema.safeParse({ ...order, destination: "forwarder", deliveryId: via.addressId }).success).toBe(
      false
    )
  })
  it("uses the exact 50-pound boundary", () => {
    const p = structuredClone(packing)
    p.cartons.forEach((c) => {
      c.weight = 22.68
    })
    expect(validatePacking(order, p).issues.some((i) => i.code === "cartonWeight")).toBe(true)
  })
  it("rejects broken multipacks, duplicate carton IDs, and inconsistent configurations", () => {
    const p = structuredClone(packing)
    p.cartons[1]!.cartonId = "a6"
    p.cartons[1]!.items[0]!.pieces = 159
    const result = validatePacking(order, p)
    expect(result.issues).toHaveLength(3)
  })
  it("honors quantities reserved by another partial shipment", () => {
    expect(validatePacking(order, packing, { [itemId]: 2 }).issues.some((i) => i.code === "overQuantity")).toBe(true)
  })
  it("rejects products outside the PO and missing FNSKUs", () => {
    const p = structuredClone(packing)
    p.cartons[0]!.items[0]!.itemId = randomUUID()
    expect(validatePacking(order, p).valid).toBe(false)
    expect(validatePacking({ ...order, items: [{ ...order.items[0]!, fnsku: "" }] }, packing).valid).toBe(false)
  })
  it("applies only allowed commercial changes without mutating historical PO", () => {
    const p = { ...packing, changes: [{ itemId, supplierSku: "B02-new", unitPrice: 230 }] }
    expect(commercialChanges(order, p)).toHaveLength(1)
    const approved = approveChanges(order, p)
    expect(approved.items[0]?.supplierSku).toBe("B02-new")
    expect(approved.items[0]?.buyerSku).toBe("foil-2")
    expect(order.items[0]?.unitPrice).toBe(210)
  })
  it("clears a catalog quote when the supplier changes its SKU", () => {
    const quoted = orderInputSchema.parse({
      ...order,
      items: [
        {
          ...order.items[0],
          supplierCatalogStatus: "matched",
          supplierCatalog: {
            productId: randomUUID(),
            revision: 3,
            supplierSku: "B02",
            title: "Body cord",
            currency: "USD",
            priceMinor: 210,
            priceBasis: "piece",
            piecesPerSellablePack: 1,
            sellablePacksPerCase: null
          }
        }
      ]
    })
    const changed = approveChanges(quoted, {
      ...packing,
      changes: [{ itemId, supplierSku: "B02-new", unitPrice: 230 }]
    })
    expect(changed.items[0]?.supplierCatalog).toBeUndefined()
    expect(changed.items[0]?.supplierCatalogStatus).toBeUndefined()
    expect(quoted.items[0]?.supplierCatalog?.supplierSku).toBe("B02")
  })
})

describe("FBA shipments", () => {
  const gloveId = randomUUID()
  const fbaOrder = orderInputSchema.parse({
    ...order,
    items: [
      { ...order.items[0], amazonNetwork: "fba" },
      {
        ...order.items[0],
        amazonNetwork: "fba",
        id: gloveId,
        variantId: "gid://shopify/ProductVariant/2",
        buyerSku: "glove-6",
        pieces: 12,
        piecesPerSet: 1
      }
    ]
  })
  const cartons = (list: Array<{ length?: number; weight?: number; items: Array<[string, number]> }>) =>
    packingSchema.parse({
      ...packing,
      cartons: list.map((carton, index) => ({
        cartonId: `C${index + 1}`,
        length: carton.length ?? 50,
        width: 40,
        height: 30,
        weight: carton.weight ?? 15,
        items: carton.items.map(([id, pieces]) => ({ itemId: id, pieces }))
      }))
    })
  const prep = new Map([
    ["foil-2", { prepCategory: "NONE", prepOwnerConstraint: "NONE_ONLY", labelOwnerConstraint: "SELLER_ONLY" }],
    ["glove-6", { prepCategory: "FC_PROVIDED", prepOwnerConstraint: "SELLER_ONLY", allOwnersConstraint: "MUST_MATCH" }]
  ])

  it("allows mixed cartons and a large carton holding one unit, but not large cartons of several", () => {
    const mixed = cartons([
      {
        items: [
          [itemId, 320],
          [gloveId, 11]
        ]
      },
      { length: 80, weight: 30, items: [[gloveId, 1]] }
    ])
    expect(validatePacking(fbaOrder, mixed).issues).toEqual([])
    const oversize = cartons([
      {
        length: 80,
        items: [
          [itemId, 320],
          [gloveId, 12]
        ]
      }
    ])
    expect(validatePacking(fbaOrder, oversize).issues).toEqual([
      { cartonId: expect.any(String), code: "cartonSize", values: { network: "FBA" }, fields: ["length"] }
    ])
    // AWD keeps its one-SKU cartons, and a carton goes to one network.
    const awd = { ...fbaOrder, items: fbaOrder.items.map((item) => ({ ...item, amazonNetwork: "awd_us" as const })) }
    expect(validatePacking(awd, mixed).issues.map((issue) => issue.code)).toContain("awdOneSku")
    const both = { ...fbaOrder, items: [awd.items[0]!, fbaOrder.items[1]!] }
    expect(validatePacking(both, mixed).issues.map((issue) => issue.code)).toContain("mixedNetworks")
  })

  it("plans sellable units per SKU with owners from Amazon's record of each SKU", () => {
    const mixed = cartons([
      {
        items: [
          [itemId, 320],
          [gloveId, 12]
        ]
      }
    ])
    expect(buildFbaPlan(fbaOrder, mixed, "cp-test", prep)).toMatchObject({
      name: "cp-test",
      destinationMarketplaces: ["ATVPDKIKX0DER"],
      sourceAddress: { stateOrProvinceCode: "Jiangsu", phoneNumber: "+8618861613263" },
      items: [
        { msku: "foil-2", quantity: 160, labelOwner: "SELLER", prepOwner: "NONE" },
        { msku: "glove-6", quantity: 12, labelOwner: "SELLER", prepOwner: "SELLER" }
      ]
    })
    expect(fbaBoxes(fbaOrder, mixed, prep)).toEqual([
      {
        cartonId: "C1",
        box: {
          contentInformationSource: "BOX_CONTENT_PROVIDED",
          quantity: 1,
          dimensions: { length: 50, width: 40, height: 30, unitOfMeasurement: "CM" },
          weight: { value: 15, unit: "KG" },
          items: [
            { msku: "foil-2", quantity: 160, labelOwner: "SELLER", prepOwner: "NONE" },
            { msku: "glove-6", quantity: 12, labelOwner: "SELLER", prepOwner: "SELLER" }
          ]
        }
      }
    ])
    expect(() => buildFbaPlan(fbaOrder, mixed, "cp-test", new Map([["foil-2", prep.get("foil-2")!]]))).toThrow(
      "glove-6: choose its prep category in Seller Central"
    )
  })

  it("sends AWD Amazon's prep category for the SKU, not the supplier's preparation", () => {
    const products = (prepDetails: Map<string, { prepCategory: string }>) =>
      buildAwdRequest(order, packing, "copacker-test", prepDetails).packagesToInbound[0]!.distributionPackage.contents
        .products
    expect(products(new Map([["foil-2", { prepCategory: "NONE" }]]))[0]!.prepDetails).toEqual({
      prepCategory: "NO_PREP",
      labelOwner: "SELF"
    })
    expect(products(new Map([["foil-2", { prepCategory: "TEXTILE" }]]))[0]!.prepDetails).toEqual({
      prepCategory: "TEXTILE",
      prepOwner: "SELF",
      labelOwner: "SELF"
    })
    expect(products(new Map())[0]!.prepDetails).toEqual({ labelOwner: "SELF" })
  })
})

describe("POs to Amazon with lines for several networks", () => {
  const gloveId = randomUUID()
  const both = orderInputSchema.parse({
    ...order,
    items: [
      order.items[0],
      {
        ...order.items[0],
        id: gloveId,
        variantId: "gid://shopify/ProductVariant/2",
        buyerSku: "glove-6",
        pieces: 12,
        piecesPerSet: 1,
        amazonNetwork: "fba"
      }
    ]
  })
  const split = packingSchema.parse({
    ...packing,
    changes: [{ itemId, supplierSku: "B02-new", unitPrice: 230 }],
    cartons: [
      ...packing.cartons,
      { cartonId: "G1", length: 30, width: 20, height: 10, weight: 3, items: [{ itemId: gloveId, pieces: 12 }] }
    ]
  })

  it("checks each carton by its own network and splits the cartons into one packing per network", () => {
    expect(validatePacking(both, split).issues).toEqual([])
    expect(cartonNetworks(both, split.cartons[2]!)).toEqual(["fba"])
    const parts = splitByNetwork(both, split)
    expect(parts.map((part) => [part.network, part.packing.cartons.map((carton) => carton.cartonId)])).toEqual([
      ["fba", ["G1"]],
      ["awd_us", ["A6", "A7"]]
    ])
    // Invoice changes stay with the first part, and the rest keep the shared details.
    expect(parts.map((part) => part.packing.changes.length)).toEqual([1, 0])
    expect(parts[1]!.packing.readyDate).toBe(split.readyDate)
  })

  it("gives each network its own carton rules and each line its network", () => {
    const rules = destinationRequirements(both)
    expect(rules.filter(isCartonRule)).toEqual([
      { code: "cartons", network: "fba" },
      { code: "cartons", network: "awd_us" },
      { code: "separateCartons", networks: ["fba", "awd_us"] }
    ])
    expect(rules.filter(isCartonRule).map(requirementText)).toEqual([
      expect.stringContaining("FBA cartons: mixed SKUs are allowed"),
      expect.stringContaining("AWD US cartons: one SKU per carton"),
      "Pack FBA and AWD US products in separate cartons."
    ])
    expect(destinationName(both)).toBe("Amazon FBA and AWD US")
    expect(itemRequirements(both.items[0]!, "amazon")[0]).toEqual({ code: "packFor", network: "awd_us" })
  })
})

describe("money", () => {
  it.each([
    [0, "$0"],
    [400, "$4"],
    [410, "$4.10"],
    [401, "$4.01"],
    [-400, "-$4"],
    [-410, "-$4.10"],
    [123400, "$1,234"]
  ])("formats %i minor units as %s", (amount, expected) => {
    expect(money(amount)).toBe(expected)
  })

  it("writes minor units in English unless given a language", () => {
    expect(money(123450)).toBe("$1,234.50")
    expect(money(123450, "EUR", "de")).toBe("1.234,50 €")
    expect(money(123400, "EUR", "de")).toBe("1.234 €")
  })
})
