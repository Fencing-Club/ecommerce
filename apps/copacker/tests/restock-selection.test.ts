import invariant from "tiny-invariant"
import { describe, expect, it } from "vitest"
import {
  calculationSteps,
  createPoHref,
  type LineEdit,
  lineEdit,
  listedLines,
  lossSteps,
  lostSales,
  matchingLines,
  orderTotals,
  orderUnits,
  reportKey,
  supplierGroups,
  wholeDays,
  wholeUnits
} from "@/lib/restock-selection"
import type { RestockLine } from "@/server/restock-plan"
import { restockLines, suppliers } from "@/stories/fixtures/catalog"

// The fixture's lines: two Lotus totes and an apron to reorder, a basket with enough stock, napkins that can't be
// calculated, twine from a supplier only in Shopify, a mug with no Amazon listing and soap Amazon doesn't stock.
function fixtureLine(index: number) {
  const line = restockLines[index]
  invariant(line, `restock fixture line ${index}`)
  return line
}
const tote = fixtureLine(0)
const black = fixtureLine(1)
const apron = fixtureLine(2)
const basket = fixtureLine(3)
const napkins = fixtureLine(4)
const twine = fixtureLine(5)
const mug = fixtureLine(6)
const soap = fixtureLine(7)
const [lotus, northwind] = suppliers
const none = new Map<string, LineEdit>()
const products = (lines: RestockLine[]) =>
  lines.map((line) => `${line.product}${line.variant ? `, ${line.variant}` : ""}`)

describe("restock order units", () => {
  it("orders the suggestion for lines to reorder until they're edited", () => {
    expect(orderUnits(tote, undefined)).toBe(96)
    expect(orderUnits(twine, undefined)).toBe(14)
    expect(orderUnits(basket, undefined)).toBe(0)
    expect(orderUnits(napkins, undefined)).toBe(0)
    expect(lineEdit(tote, undefined)).toEqual({ selected: true, units: "96" })
    expect(lineEdit(basket, undefined)).toEqual({ selected: false, units: "0" })
  })

  it("orders typed whole units while a line is ticked", () => {
    expect(orderUnits(tote, { selected: true, units: "120" })).toBe(120)
    expect(orderUnits(tote, { selected: false, units: "120" })).toBe(0)
    expect(orderUnits(basket, { selected: true, units: "12" })).toBe(12)
    for (const units of ["", "0", "-4", "1.5", "ten"]) {
      expect(orderUnits(tote, { selected: true, units })).toBe(0)
      expect(wholeUnits(units)).toBeNull()
    }
  })
})

describe("restock order totals", () => {
  it("adds up the selected lines, saying which lack a case pack or a unit cost", () => {
    const totals = orderTotals(restockLines, none)
    expect(totals).toMatchObject({ count: 4, units: 184, cases: 5, weight: 30, unknownSize: 2, unknownCost: 1 })
    expect(totals.volume).toBeCloseTo(0.18)
    // The apron has no unit cost, so the cost is the totes' and the twine's.
    expect([...totals.cost]).toEqual([["USD", 134 * 425]])
  })

  it("follows edits: a line left out, another's units changed", () => {
    const edits = new Map<string, LineEdit>([
      [black.variantId, { selected: false, units: "24" }],
      [tote.variantId, { selected: true, units: "25" }]
    ])
    const totals = orderTotals([tote, black], edits)
    // 25 units round up to two cases of 24.
    expect(totals).toMatchObject({ count: 1, units: 25, cases: 2, weight: 12 })
    expect(totals.cost.get("USD")).toBe(25 * 425)
  })

  it("counts nothing when nothing is selected", () => {
    expect(orderTotals([basket, soap], none)).toMatchObject({ count: 0, units: 0, cases: 0, cost: new Map() })
  })

  it("sums the sales expected to be lost, per currency, from lines whose loss has a price", () => {
    expect([...lostSales(restockLines)]).toEqual([["USD", 48600]])
    expect(lostSales([apron, black]).size).toBe(0)
  })
})

describe("restock purchase order links", () => {
  it("opens a PO to the supplier with the selected lines, for Amazon", () => {
    const po = createPoHref([tote, black, basket], none, { kind: "amazon" }, lotus!.id)
    expect(po).toEqual({
      href: `/orders/new?${new URLSearchParams([
        ["variant", `${tote.variantId}@96`],
        ["variant", `${black.variantId}@24`],
        ["destination", "amazon"],
        ["supplierId", lotus!.id]
      ])}`,
      count: 2,
      capped: false
    })
  })

  it("sends a Shopify location's stock to the buyer's warehouse, and leaves out a supplier ordered outside", () => {
    const po = createPoHref([twine], none, { kind: "shopify", locationId: "81234" }, null)
    expect(new URLSearchParams(po.href.split("?")[1]).toString()).toBe(
      new URLSearchParams([
        ["variant", `${twine.variantId}@14`],
        ["destination", "warehouse"],
        ["locationId", "81234"]
      ]).toString()
    )
  })

  it("takes the first 100 lines a PO holds", () => {
    const many = Array.from({ length: 101 }, (_, index) => ({ ...twine, variantId: `variant-${index}` }))
    const po = createPoHref(many, none, { kind: "amazon" }, lotus!.id)
    expect(po).toMatchObject({ count: 100, capped: true })
    expect(po.href).not.toContain("variant-100")
  })
})

describe("restock calculation", () => {
  it("works out the quantity: the sales rate, the lead time's need, stock, and whole cases", () => {
    expect(calculationSteps(tote)).toEqual([
      { label: { key: "sold", days: 60 }, value: { kind: "count", value: 120 } },
      { label: { key: "outOfStock" }, value: { kind: "days", value: 6 } },
      { label: { key: "salesRate" }, value: { kind: "perDay", value: 120 / 54 } },
      { label: { key: "leadTimeNeed", days: 45 }, value: { kind: "count", value: 100 } },
      { label: { key: "available" }, value: { kind: "count", value: 0 }, sign: "−" },
      { label: { key: "incoming" }, value: { kind: "count", value: 24 }, sign: "−" },
      {
        label: { key: "toOrderCases", cases: 4, size: 24 },
        value: { kind: "count", value: 96 },
        sign: "=",
        result: true
      }
    ])
  })

  it("adds the minimum kept at Amazon and rounds up to the minimum order", () => {
    const steps = calculationSteps(apron)
    expect(steps.map((step) => step.label.key)).toEqual([
      "sold",
      "salesRate",
      "leadTimeNeed",
      "minimumAt",
      "available",
      "incoming",
      "toOrderMinimum"
    ])
    expect(steps[3]).toEqual({
      label: { key: "minimumAt", where: "Amazon" },
      value: { kind: "count", value: 20 },
      sign: "+"
    })
    expect(steps.at(-1)?.value).toEqual({ kind: "count", value: 50 })
    expect(calculationSteps({ ...apron, targetWhere: null })[3]?.label).toEqual({ key: "minimumHere" })
  })

  it("orders what's needed when nothing rounds it up", () => {
    expect(calculationSteps(twine).at(-1)?.label).toEqual({ key: "toOrder" })
  })

  it("shows the sales lost before an order arrives, in money only with prices", () => {
    expect(lossSteps(tote, true)).toEqual([
      { label: { key: "daysOut" }, value: { kind: "count", value: 12 } },
      { label: { key: "lostSales" }, value: { kind: "lostValue", units: 27, minor: 48600, currency: "USD" } }
    ])
    expect(lossSteps(tote, false)[1]?.value).toEqual({ kind: "units", value: 27 })
    // The apron has no Shopify price.
    expect(lossSteps(apron, true)[1]?.value).toEqual({ kind: "units", value: 24 })
    expect(lossSteps(black, true)).toEqual([])
  })
})

describe("restock filters, order and groups", () => {
  it("searches by product, variant or SKU, ignoring case and spaces", () => {
    const filters = { cover: null, onlyOrders: false }
    expect(products(matchingLines(restockLines, { ...filters, query: "apron" }))).toEqual(["Linen apron"])
    expect(products(matchingLines(restockLines, { ...filters, query: " tote-BLK " }))).toEqual([
      "Canvas tote bag, Black"
    ])
    expect(matchingLines(restockLines, { ...filters, query: "" })).toHaveLength(restockLines.length)
  })

  it("keeps a link's days-of-cover group or only the items to reorder", () => {
    expect(products(matchingLines(restockLines, { query: "", cover: "out", onlyOrders: false }))).toEqual([
      "Canvas tote bag, Natural"
    ])
    expect(products(matchingLines(restockLines, { query: "", cover: null, onlyOrders: true }))).toEqual([
      "Canvas tote bag, Natural",
      "Canvas tote bag, Black",
      "Linen apron",
      "Jute twine"
    ])
  })

  it("lists what to reorder, most urgent first, and what can't be calculated", () => {
    const options = { showAll: false, cover: null, salesError: false, sort: "urgency" } as const
    expect(products(listedLines(restockLines, options))).toEqual([
      "Canvas tote bag, Natural",
      "Linen apron",
      "Jute twine",
      "Canvas tote bag, Black",
      "Cotton napkins"
    ])
    // While a store's sales couldn't be read, lines that can't be calculated aren't listed.
    expect(products(listedLines(restockLines, { ...options, salesError: true }))).not.toContain("Cotton napkins")
    // Lines with enough stock join on request, or with a days-of-cover filter.
    expect(listedLines(restockLines, { ...options, showAll: true })).toHaveLength(restockLines.length)
    expect(listedLines([basket], { ...options, cover: "over90" })).toEqual([basket])
  })

  it("sorts by name or by the largest order", () => {
    const options = { showAll: false, cover: null, salesError: false } as const
    expect(products(listedLines(restockLines, { ...options, sort: "name" }))).toEqual([
      "Canvas tote bag, Black",
      "Canvas tote bag, Natural",
      "Cotton napkins",
      "Jute twine",
      "Linen apron"
    ])
    expect(products(listedLines(restockLines, { ...options, sort: "quantity" }))).toEqual([
      "Canvas tote bag, Natural",
      "Linen apron",
      "Canvas tote bag, Black",
      "Jute twine",
      "Cotton napkins"
    ])
  })

  it("groups lines by supplier: Copacker suppliers by name, then suppliers only in Shopify", () => {
    const groups = supplierGroups([twine, apron, tote, mug, black])
    expect(groups.map(({ key, name, supplierId }) => ({ key, name, supplierId }))).toEqual([
      { key: lotus!.id, name: "Lotus Manufacturing", supplierId: lotus!.id },
      { key: northwind!.id, name: "Northwind Textiles", supplierId: northwind!.id },
      { key: "shopify:Coastal Paper", name: "Coastal Paper", supplierId: null }
    ])
    // Each group keeps the lines' order.
    expect(groups[0]?.lines).toEqual([tote, mug, black])
  })
})

describe("restock settings", () => {
  it("takes whole days from 1 to 730", () => {
    expect(wholeDays("60")).toBe(60)
    expect(wholeDays("730")).toBe(730)
    for (const text of ["", "0", "731", "1.5", "-3", "days"]) {
      expect(wholeDays(text)).toBeNull()
    }
  })

  it("keys a report by its channel, supplier and days", () => {
    expect(reportKey({ channel: { kind: "amazon" }, supplier: "all", days: 60, leadTimeDays: 45 })).toBe(
      "amazon|all|60|45"
    )
    expect(
      reportKey({ channel: { kind: "shopify", locationId: "81234" }, supplier: lotus!.id, days: 90, leadTimeDays: 60 })
    ).toBe(`shopify:81234|${lotus!.id}|90|60`)
  })
})
