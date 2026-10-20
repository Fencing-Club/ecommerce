import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import type { OrderInput } from "@repo/aisle"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
import { coverBucket } from "../src/lib/cover"
import type { RestockLine } from "../src/server/restock-plan"

const context = vi.hoisted(() => ({ current: null as unknown }))
vi.mock("@/db", () => ({ db: () => context.current }))
vi.mock("../src/server/connections", () => ({
  amazonFor: vi.fn<() => void>(),
  shopifyFor: vi.fn<() => void>(),
  connection: vi.fn<() => void>()
}))
import {
  attentionItems,
  paymentDue,
  purchasing,
  setupSteps,
  summarizeRestock,
  upcomingSpend
} from "../src/server/overview"
import {
  catalogIndex,
  dailySales,
  grossProfit,
  type ItemRow,
  amazonFreight,
  movers,
  orderFees,
  otherMarketplaceOrders,
  periodTotal,
  platformCharges,
  platformFees,
  salesByDay,
  salesByItem,
  sellingPrices
} from "../src/server/overview-sales"
import { applySchema } from "./database"

function line(overrides: Partial<RestockLine>): RestockLine {
  return {
    variantId: "v1",
    productId: "p1",
    product: "Foil",
    variant: "Small",
    sku: "FOIL-S",
    imageUrl: null,
    packOf: null,
    supplier: null,
    externalSupplier: null,
    status: "stocked",
    blocked: [],
    sold: 10,
    soldAlone: null,
    soldInBundles: null,
    soldOnEbay: null,
    salesDays: 56,
    stockoutDays: 0,
    rateDays: 56,
    leadTimeDays: 56,
    available: 100,
    incoming: 0,
    targetStock: null,
    targetWhere: null,
    minimumOrder: null,
    caseQuantity: null,
    casePack: null,
    need: 0,
    purchaseUnits: 0,
    caseCount: 0,
    unitCostMinor: 500,
    costCurrency: "USD",
    estimatedCostMinor: null,
    daysRemaining: 120,
    priceMinor: null,
    priceCurrency: null,
    lostDays: 0,
    lostUnits: 0,
    lostSalesMinor: null,
    lostProfitMinor: null,
    ...overrides
  }
}

function order(items: { pieces: number; unitPrice: number }[], currency = "USD", dueDate = "2026-10-01"): OrderInput {
  return { currency, items, adjustments: [], dueDate } as unknown as OrderInput
}

describe("dailySales", () => {
  const now = new Date("2026-09-25T12:00:00Z")

  it("fills uncovered days with null and covered days without orders with zero", () => {
    const series = dailySales(
      [{ source: "amazon", date: "2026-09-23", orders: 2, units: 5, priced: 1, revenueMinor: 1500, currency: "USD" }],
      { amazon: { from: new Date("2026-09-22T00:00:00Z"), to: new Date("2026-09-25T10:00:00Z") } },
      { from: "2026-09-21", to: "2026-09-24" },
      "UTC",
      now
    )
    expect(series.map((row) => row.date)).toEqual(["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24"])
    expect(series.map((row) => row.amazon)).toEqual([
      null,
      { orders: 0, units: 0, revenueMinor: 0, unpriced: 0 },
      { orders: 2, units: 5, revenueMinor: 1500, unpriced: 1 },
      { orders: 0, units: 0, revenueMinor: 0, unpriced: 0 }
    ])
    expect(series.every((row) => row.shopify === null)).toBe(true)
  })

  it("measures coverage from the store's midnight", () => {
    // Orders cover from 06:00 UTC on Sep 24, before midnight in Los Angeles (07:00 UTC) but after it in UTC.
    const coverage = { shopify: { from: new Date("2026-09-24T06:00:00Z"), to: new Date("2026-09-25T08:00:00Z") } }
    const day = { from: "2026-09-24", to: "2026-09-24" }
    expect(dailySales([], coverage, day, "UTC", now)[0]?.shopify).toBeNull()
    expect(dailySales([], coverage, day, "America/Los_Angeles", now)[0]?.shopify).not.toBeNull()
  })

  it("counts today up to the last sync, and nothing after now", () => {
    const coverage = { amazon: { from: new Date("2026-09-01T00:00:00Z"), to: new Date("2026-09-25T11:00:00Z") } }
    const series = dailySales([], coverage, { from: "2026-09-25", to: "2026-09-26" }, "UTC", now)
    expect(series.map((row) => row.amazon !== null)).toEqual([true, false])
  })

  it("counts a day the last sync reached into, even when it stopped before midnight", () => {
    const coverage = { amazon: { from: new Date("2026-09-01T00:00:00Z"), to: new Date("2026-09-24T23:57:00Z") } }
    const series = dailySales([], coverage, { from: "2026-09-24", to: "2026-09-25" }, "UTC", now)
    expect(series.map((row) => row.amazon !== null)).toEqual([true, false])
  })

  it("compares with the previous period only when both are fully covered", () => {
    const covered = { from: new Date("2026-01-01T00:00:00Z"), to: new Date("2026-09-25T00:00:00Z") }
    const rows = [
      {
        source: "amazon" as const,
        date: "2026-09-24",
        orders: 3,
        units: 6,
        priced: 3,
        revenueMinor: 600,
        currency: "USD"
      },
      {
        source: "amazon" as const,
        date: "2026-09-10",
        orders: 1,
        units: 2,
        priced: 1,
        revenueMinor: 200,
        currency: "USD"
      },
      {
        source: "amazon" as const,
        date: "2026-08-20",
        orders: 2,
        units: 4,
        priced: 2,
        revenueMinor: 400,
        currency: "USD"
      }
    ]
    const current = { from: "2026-08-26", to: "2026-09-24" }
    const previous = { from: "2026-07-27", to: "2026-08-25" }
    const series = (coverage: { from: Date; to: Date }, range: { from: string; to: string }) =>
      dailySales(rows, { amazon: coverage }, range, "UTC", now)
    expect(periodTotal(series(covered, current), series(covered, previous), ["amazon"])).toEqual({
      orders: 4,
      units: 8,
      revenueMinor: 800,
      unpriced: 0,
      previous: { orders: 2, units: 4, revenueMinor: 400, unpriced: 0 }
    })
    const short = { ...covered, from: new Date("2026-09-01T00:00:00Z") }
    expect(periodTotal(series(short, current), series(short, previous), ["amazon"]).previous).toBeNull()
    // Without a comparison, only the period's totals.
    expect(periodTotal(series(covered, current), null, ["amazon"]).previous).toBeNull()
  })
})

describe("summarizeRestock", () => {
  it("buckets days of cover", () => {
    expect(coverBucket({ available: 0, sold: 4, daysRemaining: 0 })).toBe("out")
    expect(coverBucket({ available: 5, sold: 0, daysRemaining: null })).toBe("unsold")
    expect(coverBucket({ available: 5, sold: 4, daysRemaining: 13 })).toBe("under14")
    expect(coverBucket({ available: 5, sold: 4, daysRemaining: 45 })).toBe("under60")
    expect(coverBucket({ available: 5, sold: 4, daysRemaining: 90 })).toBe("over90")
    expect(coverBucket({ available: null, sold: 4, daysRemaining: 10 })).toBeNull()
  })

  it("adds stock, values, lost sales, slow stock and best sellers across channels", () => {
    const summary = summarizeRestock(
      [
        {
          key: "amazon",
          label: "Amazon",
          lines: [
            line({
              status: "stockout",
              sold: 40,
              available: 2,
              daysRemaining: 3,
              stockoutDays: 14,
              rateDays: 42,
              estimatedCostMinor: 20000,
              incoming: 10
            }),
            line({ variantId: "v2", product: "Mask", sold: 5, available: 20, unitCostMinor: null }),
            line({ variantId: "v3", status: "not_stocked", sold: 0, available: 50 })
          ]
        },
        {
          key: "shopify:1",
          label: "Warehouse",
          lines: [
            line({ status: "reorder", sold: 10, available: 30, daysRemaining: 20, estimatedCostMinor: 5000 }),
            line({ variantId: "v4", product: "Glove", sold: 0, available: 8, daysRemaining: null })
          ]
        }
      ],
      (entry, channel) =>
        entry.variantId === "v2" ? null : { minor: channel === "amazon" ? 2000 : 1500, currency: "USD" }
    )
    expect(summary).toMatchObject({
      stockouts: 1,
      reorders: 1,
      reorderCost: [{ currency: "USD", minor: 25000 }],
      reorderUncosted: 0,
      lostDays: 14,
      // 14 days out at 40 sold over 42 days in stock.
      lostUnits: 13,
      lostValue: [{ currency: "USD", minor: 26667 }],
      itemsOut: 1,
      unitsOnHand: 60,
      stockValue: [{ currency: "USD", minor: 20000 }],
      retailValue: [{ currency: "USD", minor: 4000 + 45000 + 12000 }],
      uncosted: 1,
      unpriced: 1
    })
    expect(summary.channels[0]).toMatchObject({ key: "amazon", available: 22, incoming: 10 })
    expect(summary.bestSellers[0]).toMatchObject({
      variantId: "v1",
      sold: 50,
      available: 32,
      daysRemaining: 3,
      status: "stockout",
      channel: "amazon",
      channels: ["Amazon", "Warehouse"]
    })
    expect(summary.cover.find((bucket) => bucket.key === "under14")).toMatchObject({ items: 1, channel: "amazon" })
    expect(summary.slow).toMatchObject({ items: 2, units: 28, value: [{ currency: "USD", minor: 4000 }] })
    expect(summary.slow.top.map((item) => item.variantId)).toEqual(["v4", "v2"])
  })
})

describe("purchasing and upcoming spend", () => {
  const list = [
    {
      status: "submitted" as const,
      supplier: "Ok Fencing",
      data: order([{ pieces: 10, unitPrice: 1000 }], "USD", "2026-09-20"),
      sentAt: new Date("2026-09-02T00:00:00Z")
    },
    {
      status: "closed" as const,
      supplier: "Ok Fencing",
      data: order([{ pieces: 1, unitPrice: 500 }]),
      // July 31 in Los Angeles, August 1 in UTC.
      sentAt: new Date("2026-08-01T03:00:00Z")
    },
    { status: "draft" as const, supplier: "Blade Co", data: order([{ pieces: 2, unitPrice: 300 }]), sentAt: null },
    {
      status: "submitted" as const,
      supplier: "Blade Co",
      data: order([{ pieces: 1, unitPrice: 100 }], "EUR", "2026-11-10"),
      sentAt: new Date("2026-09-03T00:00:00Z")
    },
    {
      status: "submitted" as const,
      supplier: "Blade Co",
      data: order([{ pieces: 2, unitPrice: 1000 }], "USD", "2027-03-01"),
      sentAt: new Date("2026-09-04T00:00:00Z")
    }
  ]

  it("totals open and draft POs and groups sent value by the store's month", () => {
    const result = purchasing(list)
    expect(result.openCount).toBe(3)
    expect(result.open).toEqual([
      { currency: "USD", minor: 12000 },
      { currency: "EUR", minor: 100 }
    ])
    expect(result.draftCount).toBe(1)
    expect(result.bySupplier.map((supplier) => supplier.name)).toEqual(["Ok Fencing", "Blade Co"])
  })

  it("dates a PO's payment from its Net terms and when it was sent", () => {
    const sentAt = new Date("2026-09-02T00:00:00Z")
    const net = { ...order([]), paymentTerms: "Net 30" }
    expect(paymentDue({ data: net, sentAt })).toBe("2026-10-02")
    expect(paymentDue({ data: { ...net, paymentTerms: "Payment in advance", dueDate: undefined }, sentAt })).toBe(
      "2026-09-02"
    )
  })

  it("adds reorders to sent POs due within 60 days", () => {
    const result = upcomingSpend(list, [{ currency: "USD", minor: 3000 }], "2026-09-25")
    expect(Object.fromEntries(result.purchaseOrders.map((bucket) => [bucket.key, bucket.value]))).toEqual({
      overdue: [{ currency: "USD", minor: 10000 }],
      next30: [],
      next60: [{ currency: "EUR", minor: 100 }],
      later: [{ currency: "USD", minor: 2000 }]
    })
    expect(result.next60).toEqual([
      { currency: "USD", minor: 13000 },
      { currency: "EUR", minor: 100 }
    ])
  })
})

describe("attentionItems", () => {
  const now = new Date("2026-09-25T00:00:00Z")
  const quiet = {
    now,
    restock: { stockouts: 0, reorders: 0, reorderCost: [], sources: [] },
    shipments: { waiting: 0, problems: 0 },
    drafts: 0,
    syncs: [],
    stock: [],
    shopifyHistoryLimited: false
  }

  it("is empty when nothing needs the buyer", () => {
    expect(attentionItems(quiet)).toEqual([])
  })

  it("lists critical items first and flags stale syncs and missing fees", () => {
    const items = attentionItems({
      ...quiet,
      restock: { ...quiet.restock, stockouts: 2, reorders: 1 },
      shipments: { waiting: 1, problems: 0 },
      drafts: 1,
      syncs: [
        {
          source: "shopify",
          status: "idle",
          coveredTo: new Date("2026-09-20T00:00:00Z"),
          finishedAt: null
        },
        { source: "amazon", status: "failed", coveredTo: now, finishedAt: now, feesErrorCode: "fees_failed" }
      ],
      stock: [{ source: "fba", status: "idle", finishedAt: new Date("2026-09-01T00:00:00Z") }]
    })
    expect(items.map((item) => item.key)).toEqual([
      "stockouts",
      "shipments-waiting",
      "reorders",
      "sync-amazon",
      "fees-amazon",
      "sync-shopify",
      "stock-stale",
      "drafts"
    ])
    expect(items[0]?.title).toBe("2 items run out before a reorder arrives")
    expect(items.find((item) => item.key === "sync-shopify")?.title).toBe("Shopify orders haven’t synced in 5 days")
    expect(items.find((item) => item.key === "drafts")?.title).toBe("1 purchase order is still a draft")
  })
})

describe("setupSteps", () => {
  it("marks each step done from what's connected and synced", () => {
    const steps = setupSteps({
      connected: ["shopify"],
      ordersCopied: ["shopify"],
      stockSynced: true,
      inStock: 10,
      uncosted: 2
    })
    expect(Object.fromEntries(steps.map((step) => [step.key, step.done]))).toEqual({
      shopify: true,
      amazon: false,
      orders: true,
      stock: true,
      costs: false
    })
  })
})

describe("setupSteps while syncing", () => {
  it("keeps a step open while its first sync runs, with the orders' progress", () => {
    const steps = setupSteps({
      connected: ["amazon"],
      ordersCopied: ["amazon"],
      stockSynced: false,
      ordersSyncing: { progress: 0.4 },
      stockSyncing: true,
      inStock: 0,
      uncosted: 0
    })
    const byKey = Object.fromEntries(steps.map((step) => [step.key, step]))
    expect(byKey.orders).toMatchObject({ done: false, syncing: { progress: 0.4 } })
    expect(byKey.stock).toMatchObject({ done: false, syncing: { progress: null } })
    expect(byKey.amazon).not.toHaveProperty("syncing")
  })
})

describe("margins and trends", () => {
  const index = catalogIndex([
    {
      variantId: "va",
      buyerSku: "A",
      productTitle: "Foil",
      variantTitle: "Default Title",
      unitCostMinor: 400,
      costCurrency: "USD"
    },
    {
      variantId: "vb",
      buyerSku: "B",
      productTitle: "Mask",
      unitCostMinor: 1000,
      costCurrency: "USD",
      priceMinor: 3000,
      priceCurrency: "USD"
    },
    {
      variantId: "vpack",
      buyerSku: "A-3PK",
      productTitle: "Foil 3-pack",
      unitCostMinor: null,
      bundle: { components: [{ variantId: "va", quantity: 3 }] }
    },
    { variantId: "vx", buyerSku: "X", productTitle: "No cost" },
    { variantId: "vdup1", buyerSku: "DUP" },
    { variantId: "vdup2", buyerSku: "DUP" }
  ])
  const item = (overrides: Partial<ItemRow>): ItemRow => ({
    source: "shopify",
    key: "va",
    period: "current",
    units: 10,
    revenueMinor: 10000,
    pricedUnits: 10,
    currency: "USD",
    ...overrides
  })

  it("finds unit costs, including bundles, and only unambiguous Amazon SKUs", () => {
    expect(index.unitCost(index.variantFor("amazon", "A-3PK"))).toEqual({ minor: 1200, currency: "USD" })
    expect(index.variantFor("amazon", "DUP")).toBeNull()
    expect(index.unitCost(index.variantFor("shopify", "vx"))).toBeNull()
  })

  it("estimates fees for orders not posted yet at the posted rate", () => {
    expect(
      platformFees([
        { orderId: "1", revenueMinor: 10000, feesMinor: 1500 },
        { orderId: "2", revenueMinor: 4000, feesMinor: null },
        { orderId: "3", revenueMinor: null, feesMinor: null }
      ])
    ).toEqual({ feesMinor: 2100, estimatedOrders: 1, revenueMinor: 14000 })
  })

  it("takes unit costs and Amazon's fees off the costed sales", () => {
    const result = grossProfit(
      [
        item({}),
        item({ source: "amazon", key: "A-3PK", units: 2, pricedUnits: 2, revenueMinor: 6000 }),
        item({ key: "vx", revenueMinor: 5000 }),
        item({ period: "previous", revenueMinor: 99999 })
      ],
      index,
      { amazon: { feesMinor: 900, revenueMinor: 6000 }, shopify: { feesMinor: 600, revenueMinor: 20000 } },
      [
        { key: "amazon-refunds", label: "Amazon refunds", minor: -1000, currency: "USD" },
        // Another currency can't be taken off USD sales.
        { key: "shopify-labels", label: "Shopify shipping labels", minor: -50, currency: "EUR" }
      ]
    )
    expect(result).toEqual({
      currency: "USD",
      revenueMinor: 21000,
      costedRevenueMinor: 16000,
      costMinor: 4000 + 2400,
      // All of Amazon's costed sales carry its fees; half of Shopify's sales are costed, so half its fees.
      feesMinor: 900 + 300,
      charges: [{ key: "amazon-refunds", label: "Amazon refunds", minor: -1000, currency: "USD" }],
      chargesMinor: -1000,
      profitMinor: 16000 - 6400 - 1200 - 1000,
      margin: (16000 - 6400 - 1200 - 1000) / 16000
    })
  })

  it("adds Amazon's inbound freight to each Amazon unit, by SKU where its shipment is known", () => {
    const landedIndex = catalogIndex(
      [
        { variantId: "va", buyerSku: "A", unitCostMinor: 400, costCurrency: "USD" },
        { variantId: "vb", buyerSku: "B", unitCostMinor: 1000, costCurrency: "USD" }
      ],
      new Map([["vb", 0.1]])
    )
    const result = grossProfit(
      [
        item({ source: "amazon", key: "A", units: 10, pricedUnits: 10, revenueMinor: 10000 }),
        // B's shipments cost $2 a unit to bring in, on top of the freight spread over every unit.
        item({ source: "amazon", key: "B", units: 2, pricedUnits: 2, revenueMinor: 5000 }),
        // Shopify units don't pass through Amazon's warehouses.
        item({ source: "shopify", key: "va", units: 3, pricedUnits: 3, revenueMinor: 3000 })
      ],
      landedIndex,
      {},
      [],
      { perUnitMinor: 150, bySku: new Map([["B", 200]]), currency: "USD" }
    )
    expect(result.charges).toEqual([
      { key: "amazon-freight", label: "Amazon inbound freight", minor: -(150 * 12 + 200 * 2), currency: "USD" }
    ])
    expect(result.profitMinor).toBe(18000 - (4000 + 2200 + 1200) - 2200)
  })

  it("counts units Amazon resold after a return at no further cost", () => {
    const result = grossProfit(
      [
        item({
          source: "amazon",
          key: "amzn.gr.fc-glove-nonslip-right-fah6RU-LN",
          units: 1,
          pricedUnits: 1,
          revenueMinor: 1341
        })
      ],
      catalogIndex([]),
      {},
      [],
      { perUnitMinor: 150, bySku: new Map(), currency: "USD" }
    )
    expect(result).toMatchObject({ costedRevenueMinor: 1341, costMinor: 0, chargesMinor: 0, profitMinor: 1341 })
  })

  it("lists items selling more and less than before, leaving out small sellers", () => {
    const result = movers(
      [
        item({ key: "va", units: 30 }),
        item({ key: "va", period: "previous", units: 10 }),
        item({ source: "amazon", key: "A", units: 5 }),
        item({ key: "vb", units: 2 }),
        item({ key: "vb", period: "previous", units: 20 }),
        item({ key: "vx", units: 3 }),
        item({ key: "vx", period: "previous", units: 1 })
      ],
      index,
      ["shopify", "amazon"]
    )
    expect(result.rising).toEqual([
      { id: "va", product: "Foil", variant: null, sku: "A", imageUrl: null, current: 35, previous: 10 }
    ])
    expect(result.falling.map((entry) => [entry.id, entry.current, entry.previous])).toEqual([["vb", 2, 20]])
  })

  it("prices a variant at its recent average in each source", () => {
    const price = sellingPrices(
      [
        item({ units: 4, pricedUnits: 4, revenueMinor: 1000 }),
        item({ period: "previous", units: 1, pricedUnits: 1, revenueMinor: 500 })
      ],
      index
    )
    expect(price("shopify", "va")).toEqual({ minor: 300, currency: "USD" })
    expect(price("amazon", "va")).toBeNull()
  })
})

describe("sales queries", () => {
  const pg = new PGlite()
  const database = drizzle(pg, { schema: tables })
  const orgId = randomUUID()
  const shopifyAccount = { provider: "shopify" as const, externalId: "club.myshopify.com" }
  const amazonAccount = { provider: "amazon" as const, externalId: "SELLER" }
  const money = (amount: string) => ({ shopMoney: { amount, currencyCode: "USD" } })

  beforeAll(async () => {
    context.current = database
    await applySchema(pg)
    await database.insert(tables.organizations).values({ id: orgId, name: "Fencing Club", kind: "buyer" })
    const shopifyOrder = (id: string, createdAt: string, lines: unknown[], extra: Record<string, unknown> = {}) => ({
      orgId,
      source: "shopify" as const,
      externalAccountId: "club.myshopify.com",
      orderId: id,
      orderedAt: new Date(createdAt),
      data: {
        tags: [],
        transactions: [],
        id,
        name: "#1",
        createdAt,
        cancelledAt: null,
        test: false,
        sourceName: "web",
        lines,
        fulfillments: [],
        ...extra
      }
    })
    const amazonOrder = (id: string, createdAt: string, items: unknown[]) => ({
      orgId,
      source: "amazon" as const,
      externalAccountId: "SELLER",
      orderId: id,
      orderedAt: new Date(createdAt),
      data: { orderId: id, createdTime: createdAt, orderItems: items }
    })
    await database.insert(tables.salesOrders).values([
      // 3 bought, 1 refunded: 2 units at $10 less their share of a $3 discount. A bundle of 2 counts once, at its
      // components' prices.
      shopifyOrder(
        "s1",
        "2026-09-24T10:00:00Z",
        [
          {
            id: "l1",
            quantity: 3,
            currentQuantity: 2,
            sku: "A",
            variant: { id: "va" },
            lineItemGroup: null,
            originalUnitPriceSet: money("10.00"),
            discountAllocations: [{ allocatedAmountSet: money("3.00") }]
          },
          {
            discountAllocations: [],
            id: "l2",
            quantity: 2,
            currentQuantity: 2,
            sku: "B",
            variant: { id: "vb" },
            lineItemGroup: { id: "g1", quantity: 2, variantId: "vbundle" },
            originalUnitPriceSet: money("5.00")
          },
          {
            discountAllocations: [],
            id: "l3",
            quantity: 4,
            currentQuantity: 4,
            sku: "C",
            variant: { id: "vc" },
            lineItemGroup: { id: "g1", quantity: 2, variantId: "vbundle" },
            originalUnitPriceSet: money("2.50")
          }
        ],
        {
          fulfillments: [{ id: "f1", status: "SUCCESS", location: { id: "loc1" }, lines: [] }],
          transactions: [
            {
              id: "p1",
              kind: "SALE",
              status: "SUCCESS",
              fees: [{ amount: money("1.36").shopMoney, taxAmount: money("0.11").shopMoney }]
            },
            {
              id: "p2",
              kind: "SALE",
              status: "FAILURE",
              fees: [{ amount: money("5.00").shopMoney, taxAmount: money("0").shopMoney }]
            }
          ]
        }
      ),
      // Before midnight on Sep 25 in UTC, but Sep 24 in Los Angeles. This order is free.
      shopifyOrder("s2", "2026-09-25T03:30:00Z", [
        {
          originalUnitPriceSet: { shopMoney: { amount: "0.00", currencyCode: "USD" } },
          discountAllocations: [],
          id: "l4",
          quantity: 1,
          currentQuantity: 1,
          sku: "A",
          variant: { id: "va" }
        }
      ]),
      amazonOrder("a1", "2026-09-23T05:00:00Z", [
        {
          orderItemId: "i1",
          quantityOrdered: 3,
          product: { sellerSku: "A" },
          proceeds: {
            breakdowns: [
              { type: "ITEM", subtotal: { amount: "30.00", currencyCode: "USD" } },
              { type: "DISCOUNT", subtotal: { amount: "-3.00", currencyCode: "USD" } },
              { type: "TAX", subtotal: { amount: "2.40", currencyCode: "USD" } }
            ]
          }
        },
        { orderItemId: "i2", quantityOrdered: 1, product: { sellerSku: "B" }, proceeds: { breakdowns: [] } }
      ]),
      amazonOrder("a2", "2026-08-10T05:00:00Z", [
        { orderItemId: "i3", quantityOrdered: 2, product: { sellerSku: "A" } }
      ]),
      // Cancelled: not counted at all.
      {
        ...amazonOrder("a3", "2026-09-23T06:00:00Z", [
          { orderItemId: "i4", quantityOrdered: 1, product: { sellerSku: "A" } }
        ]),
        data: {
          orderId: "a3",
          createdTime: "2026-09-23T06:00:00Z",
          fulfillment: { fulfillmentStatus: "CANCELLED" },
          orderItems: [{ orderItemId: "i4", quantityOrdered: 1, product: { sellerSku: "A" } }]
        }
      },
      // Pending, with no price yet: counted once Amazon confirms it.
      {
        ...amazonOrder("a5", "2026-09-23T07:00:00Z", []),
        data: {
          orderId: "a5",
          createdTime: "2026-09-23T07:00:00Z",
          fulfillment: { fulfillmentStatus: "PENDING" },
          orderItems: [{ orderItemId: "i7", quantityOrdered: 2, product: { sellerSku: "A" } }]
        }
      },
      // Pending with one item priced and one not: left out until Amazon prices every item.
      {
        ...amazonOrder("a7", "2026-09-23T07:30:00Z", []),
        data: {
          orderId: "a7",
          createdTime: "2026-09-23T07:30:00Z",
          fulfillment: { fulfillmentStatus: "PENDING" },
          orderItems: [
            {
              orderItemId: "i9",
              quantityOrdered: 1,
              product: { sellerSku: "A" },
              proceeds: { breakdowns: [{ type: "ITEM", subtotal: { amount: "59.95", currencyCode: "USD" } }] }
            },
            { orderItemId: "i10", quantityOrdered: 1, product: { sellerSku: "B" } }
          ]
        }
      },
      // A replacement Amazon links to the order it replaces: $0 of sales from the start, before any payment posts.
      {
        ...amazonOrder("a6", "2026-09-20T05:00:00Z", []),
        data: {
          orderId: "a6",
          createdTime: "2026-09-20T05:00:00Z",
          fulfillment: { fulfillmentStatus: "SHIPPED" },
          associatedOrders: [{ orderId: "a0", associationType: "REPLACEMENT_ORIGINAL_ID" }],
          orderItems: [{ orderItemId: "i8", quantityOrdered: 1, product: { sellerSku: "A" } }]
        }
      },
      // A free replacement: Amazon posts its payment at zero and never adds proceeds.
      amazonOrder("a4", "2026-09-23T06:30:00Z", [
        { orderItemId: "i5", quantityOrdered: 2, product: { sellerSku: "A" } },
        // A line with nothing ordered has no proceeds either.
        { orderItemId: "i6", quantityOrdered: 0, product: { sellerSku: "B" } }
      ]),
      // Another account's orders aren't counted.
      { ...shopifyOrder("s3", "2026-09-24T10:00:00Z", []), externalAccountId: "old.myshopify.com" }
    ] as (typeof tables.salesOrders.$inferInsert)[])
    await database.insert(tables.amazonTransactions).values([
      {
        orgId,
        externalAccountId: "SELLER",
        transactionId: "t1",
        orderId: "a1",
        postedAt: new Date("2026-09-24T00:00:00Z"),
        type: "Shipment",
        currency: "USD",
        totalMinor: 2000,
        feesMinor: 450,
        data: {}
      },
      // Amazon's release of t1, deferred: the same fees again, which aren't counted twice.
      {
        orgId,
        externalAccountId: "SELLER",
        transactionId: "t1-release",
        orderId: "a1",
        postedAt: new Date("2026-09-24T12:00:00Z"),
        type: "Shipment",
        currency: "USD",
        totalMinor: 2000,
        feesMinor: 450,
        data: {
          relatedIdentifiers: [
            { relatedIdentifierName: "ORDER_ID", relatedIdentifierValue: "a1" },
            { relatedIdentifierName: "DEFERRED_TRANSACTION_ID", relatedIdentifierValue: "t1" }
          ]
        }
      },
      {
        orgId,
        externalAccountId: "SELLER",
        transactionId: "t2",
        orderId: "a1",
        postedAt: new Date("2026-09-25T00:00:00Z"),
        type: "Refund",
        currency: "USD",
        totalMinor: -500,
        feesMinor: -50,
        data: {}
      },
      {
        orgId,
        externalAccountId: "SELLER",
        transactionId: "t4",
        orderId: "a4",
        postedAt: new Date("2026-09-24T00:00:00Z"),
        type: "Shipment",
        currency: "USD",
        totalMinor: 0,
        feesMinor: 0,
        data: {}
      }
    ])
  })
  afterAll(async () => {
    await pg.close()
  })

  it("counts orders, units and sales per source and store day", async () => {
    const rows = await salesByDay(
      orgId,
      [shopifyAccount, amazonAccount],
      new Date("2026-09-01T00:00:00Z"),
      "America/Los_Angeles",
      "USD"
    )
    expect(rows.toSorted((a, b) => a.source.localeCompare(b.source))).toEqual([
      // a1, and a4 at zero; the cancelled a3 and the pending a5 and a7 aren't counted.
      { source: "amazon", date: "2026-09-19", orders: 1, units: 1, priced: 1, revenueMinor: 0, currency: "USD" },
      { source: "amazon", date: "2026-09-22", orders: 2, units: 6, priced: 2, revenueMinor: 2700, currency: "USD" },
      // $20 less 2/3 of $3, plus the $20 bundle; the free order adds a unit but no sales.
      { source: "shopify", date: "2026-09-24", orders: 2, units: 5, priced: 2, revenueMinor: 3800, currency: "USD" }
    ])
  })

  it("narrows Shopify sales to the orders shipped from a location", async () => {
    const since = new Date("2026-09-01T00:00:00Z")
    const at = (locationId: string) =>
      salesByDay(orgId, [{ ...shopifyAccount, locationId }], since, "America/Los_Angeles", "USD")
    // s2 was never fulfilled, so it counts for no location.
    expect(await at("loc1")).toEqual([
      { source: "shopify", date: "2026-09-24", orders: 1, units: 4, priced: 1, revenueMinor: 3800, currency: "USD" }
    ])
    expect(await at("loc2")).toEqual([])
    const fees = await orderFees(
      orgId,
      { ...shopifyAccount, locationId: "loc1" },
      since,
      new Date("2026-09-26T00:00:00Z"),
      "USD"
    )
    expect(fees.map((row) => row.orderId)).toEqual(["s1"])
  })

  it("adds up units and sales per item, a bundle once under its own variant", async () => {
    const rows = await salesByItem(
      orgId,
      [shopifyAccount, amazonAccount],
      {
        current: { from: new Date("2026-09-01T00:00:00Z"), to: new Date("2026-09-26T00:00:00Z") },
        previous: { from: new Date("2026-08-01T00:00:00Z"), to: new Date("2026-09-01T00:00:00Z") }
      },
      "USD"
    )
    const byKey = Object.fromEntries(rows.map((row) => [`${row.source}:${row.period}:${row.key}`, row]))
    expect(byKey["shopify:current:va"]).toMatchObject({ units: 3, pricedUnits: 3, revenueMinor: 1800 })
    expect(byKey["shopify:current:vbundle"]).toMatchObject({ units: 2, pricedUnits: 2, revenueMinor: 2000 })
    // Includes the replacement a6: a unit sold for nothing.
    expect(byKey["amazon:current:A"]).toMatchObject({ units: 6, pricedUnits: 6, revenueMinor: 2700, currency: "USD" })
    expect(byKey["amazon:current:B"]).toMatchObject({ units: 1, pricedUnits: 1, revenueMinor: 0 })
    expect(byKey["amazon:previous:A"]).toMatchObject({ units: 2, pricedUnits: 0, revenueMinor: 0 })
    expect(byKey["shopify:current:vb"]).toBeUndefined()
  })

  it("prices items only as part of a priced order, so item and order totals always match", async () => {
    const current = { from: new Date("2026-09-01T00:00:00Z"), to: new Date("2026-09-26T00:00:00Z") }
    const accounts = [shopifyAccount, amazonAccount]
    const items = await salesByItem(orgId, accounts, { current, previous: null }, "USD")
    const days = (await salesByDay(orgId, accounts, current.from, "UTC", "USD")).filter(
      (row) => row.date < "2026-09-26"
    )
    const itemSales = items.reduce((sum, item) => sum + item.revenueMinor, 0)
    expect(itemSales).toBe(days.reduce((sum, row) => sum + row.revenueMinor, 0))
    expect(items.reduce((sum, item) => sum + item.pricedUnits, 0)).toBeLessThanOrEqual(
      days.reduce((sum, row) => sum + row.units, 0)
    )
  })

  it("joins Amazon orders to the fees posted for them", async () => {
    const rows = await orderFees(
      orgId,
      amazonAccount,
      new Date("2026-08-01T00:00:00Z"),
      new Date("2026-09-26T00:00:00Z"),
      "USD"
    )
    expect(rows.toSorted((a, b) => a.orderId.localeCompare(b.orderId))).toEqual([
      // The order payment's fees only: the refund is counted with refunds, and the release repeats the payment.
      { orderId: "a1", revenueMinor: 2700, feesMinor: 450 },
      { orderId: "a2", revenueMinor: null, feesMinor: null },
      { orderId: "a4", revenueMinor: 0, feesMinor: 0 },
      // A replacement is $0 of sales before Amazon posts anything for it.
      { orderId: "a6", revenueMinor: 0, feesMinor: null }
    ])
  })

  it("adds up Shopify Payments fees from each order's successful payments", async () => {
    const rows = await orderFees(
      orgId,
      shopifyAccount,
      new Date("2026-09-01T00:00:00Z"),
      new Date("2026-09-26T00:00:00Z"),
      "USD"
    )
    expect(rows.toSorted((a, b) => a.orderId.localeCompare(b.orderId))).toEqual([
      // $1.36 fee plus $0.11 tax; the failed payment's fee isn't charged.
      { orderId: "s1", revenueMinor: 3800, feesMinor: 147 },
      // No payment fees on the free order.
      { orderId: "s2", revenueMinor: 0, feesMinor: 0 }
    ])
  })

  it("leaves out Shopify orders with an excluded tag, such as Shopify's copies of Amazon orders", async () => {
    const copy = (id: string, sourceName: string) => ({
      orgId,
      source: "shopify" as const,
      externalAccountId: "club.myshopify.com",
      orderId: id,
      orderedAt: new Date("2026-09-20T10:00:00Z"),
      data: {
        transactions: [],
        id,
        name: "#2",
        createdAt: "2026-09-20T10:00:00Z",
        cancelledAt: null,
        test: false,
        sourceName,
        tags: ["Amazon", `Amazon-${sourceName.slice("amazon-".length).toUpperCase()}`],
        fulfillments: [],
        lines: [
          {
            discountAllocations: [],
            id: `${id}-l`,
            quantity: 1,
            currentQuantity: 1,
            sku: "A",
            variant: { id: "va" },
            originalUnitPriceSet: money("10.00")
          }
        ]
      }
    })
    await database
      .insert(tables.salesOrders)
      .values([
        copy("us1", "amazon-us"),
        copy("ca1", "amazon-ca"),
        copy("uk1", "amazon-uk")
      ] as (typeof tables.salesOrders.$inferInsert)[])
    const since = new Date("2026-09-01T00:00:00Z")
    const day = (rows: Awaited<ReturnType<typeof salesByDay>>) => rows.find((row) => row.date === "2026-09-20")
    expect(day(await salesByDay(orgId, [shopifyAccount], since, "UTC", "USD"))?.orders).toBe(3)
    expect(
      day(await salesByDay(orgId, [{ ...shopifyAccount, excludedTags: ["amazon"] }], since, "UTC", "USD"))
    ).toBeUndefined()
    expect(
      day(await salesByDay(orgId, [{ ...shopifyAccount, excludedTags: ["amazon-uk"] }], since, "UTC", "USD"))?.orders
    ).toBe(2)
    // Canada's orders are read from Amazon too; the UK's aren't.
    expect(await otherMarketplaceOrders(orgId, "club.myshopify.com", since, new Date("2026-09-26T00:00:00Z"))).toBe(1)
  })

  it("adds up refunds and platform charges by when they're posted, leaving out payouts", async () => {
    await database.insert(tables.amazonTransactions).values(
      [
        ["ads", "ProductAdsPayment", -14563],
        ["storage", "ServiceFee", -4500],
        ["reimbursed", "FBAInventoryReimbursement", 1200],
        ["payout", "Disbursement", -90000],
        // Amazon fulfilling a Shopify order.
        ["mcf", "Shipment", -744, "FBAShipmentInjectionFulfillmentFee"],
        // A payment for an order from a marketplace Copacker doesn't read: neither its sales nor its fees count.
        ["canada", "Shipment", 3660, "Order Payment"],
        // A payout Amazon records as an adjustment isn't a cost or a credit.
        ["payout-adjustment", "Adjustment", 244154, "Disbursement"],
        ["freight", "ServiceFee", -199539, "FBAInternationalInboundFreightCharge"]
      ].map(([transactionId, type, totalMinor, description]) => ({
        orgId,
        externalAccountId: "SELLER",
        transactionId: String(transactionId),
        orderId: null,
        postedAt: new Date("2026-09-10T00:00:00Z"),
        type: String(type),
        currency: "USD",
        totalMinor: Number(totalMinor),
        feesMinor: 0,
        data: description ? { description } : {}
      }))
    )
    await database.insert(tables.shopifyBalanceTransactions).values(
      [
        ["b1", "SHIPPING_LABEL", -1234],
        ["b2", "SHIPPING_LABEL_ADJUSTMENT_SURCHARGE", -100],
        ["b3", "BILLING_DEBIT", -8999],
        ["b4", "CHARGEBACK_FEE", -1500],
        ["b6", "IMPORT_TAX", -2377],
        ["b7", "CUSTOMS_DUTY", -499],
        // A card payment: its processing fee is counted with the order.
        ["b5", "CHARGE", 4800]
      ].map(([transactionId, type, netMinor]) => ({
        orgId,
        externalAccountId: "club.myshopify.com",
        transactionId: String(transactionId),
        type: String(type),
        processedAt: new Date("2026-09-12T00:00:00Z"),
        orderId: null,
        currency: "USD",
        amountMinor: Number(netMinor),
        feeMinor: 0,
        netMinor: Number(netMinor),
        data: {}
      }))
    )
    const lines = await platformCharges(
      orgId,
      [amazonAccount, shopifyAccount],
      new Date("2026-09-01T00:00:00Z"),
      new Date("2026-09-26T00:00:00Z"),
      "USD"
    )
    expect(Object.fromEntries(lines.map((line) => [line.key, line.minor]))).toEqual({
      // t2, the refund on a1; its fees came back with it.
      "amazon-refunds": -500,
      "amazon-ads": -14563,
      "amazon-charges": -4500 + 1200,
      "amazon-mcf": -744,
      "shopify-labels": -1334,
      "shopify-bill": -8999,
      "shopify-disputes": -1500,
      "shopify-duties": -2876
    })
    // Inbound freight isn't a charge when posted: it's spread over the units sold.
    const range = { from: new Date("2026-09-01T00:00:00Z"), to: new Date("2026-09-26T00:00:00Z") }
    const freight = await amazonFreight(orgId, "SELLER", range, "USD", 500)
    expect(freight).toEqual({ perUnitMinor: 199539 / 500, bySku: new Map(), currency: "USD", freightMinor: 199539 })
    // A Shopify location's view leaves out charges that belong to the whole store.
    const atLocation = await platformCharges(
      orgId,
      [{ ...shopifyAccount, locationId: "loc1" }],
      new Date("2026-09-01T00:00:00Z"),
      new Date("2026-09-26T00:00:00Z"),
      "USD"
    )
    expect(atLocation).toEqual([])
  })
})
