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
  purchasing,
  setupSteps,
  shipmentPipeline,
  summarizeRestock,
  upcomingSpend
} from "../src/server/overview"
import {
  amazonFees,
  amazonOrderFees,
  catalogIndex,
  dailySales,
  grossProfit,
  type ItemRow,
  movers,
  periodTotal,
  salesByDay,
  salesByItem,
  sellingPrices
} from "../src/server/overview-sales"
import { applyMigrations } from "./migrations"

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
    status: "stocked",
    blocked: [],
    sold: 10,
    soldAlone: null,
    soldInBundles: null,
    salesDays: 56,
    stockoutDays: 0,
    rateDays: 56,
    leadTimeDays: 56,
    available: 100,
    incoming: 0,
    targetStock: null,
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
    ...overrides
  }
}

function order(items: { pieces: number; unitPrice: number }[], currency = "USD", dueDate = "2026-10-01"): OrderInput {
  return { currency, items, adjustments: [], dueDate } as unknown as OrderInput
}

describe("dailySales", () => {
  const today = "2026-09-25"

  it("fills uncovered days with null and covered days without orders with zero", () => {
    const series = dailySales(
      [{ source: "amazon", date: "2026-09-23", orders: 2, units: 5, priced: 1, revenueMinor: 1500, currency: "USD" }],
      { amazon: { from: new Date("2026-09-22T00:00:00Z"), to: new Date("2026-09-25T10:00:00Z") } },
      today,
      4,
      "UTC"
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
    expect(dailySales([], coverage, today, 1, "UTC")[0]?.shopify).toBeNull()
    expect(dailySales([], coverage, today, 1, "America/Los_Angeles")[0]?.shopify).not.toBeNull()
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
    const series = dailySales(rows, { amazon: covered }, today, 60, "UTC")
    expect(periodTotal(series, ["amazon"], 30)).toEqual({
      orders: 4,
      units: 8,
      revenueMinor: 800,
      unpriced: 0,
      previous: { orders: 2, units: 4, revenueMinor: 400, unpriced: 0 }
    })
    const short = dailySales(rows, { amazon: { ...covered, from: new Date("2026-09-01T00:00:00Z") } }, today, 60, "UTC")
    expect(periodTotal(short, ["amazon"], 30).previous).toBeNull()
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
    const result = purchasing(list, new Date("2026-09-25T12:00:00Z"), "America/Los_Angeles")
    expect(result.openCount).toBe(3)
    expect(result.open).toEqual([
      { currency: "USD", minor: 12000 },
      { currency: "EUR", minor: 100 }
    ])
    expect(result.draftCount).toBe(1)
    expect(result.bySupplier.map((supplier) => supplier.name)).toEqual(["Ok Fencing", "Blade Co"])
    expect(result.spend.currency).toBe("USD")
    expect(result.spend.otherCurrencies).toBe(true)
    expect(result.spend.months).toHaveLength(12)
    expect(result.spend.months.at(-1)).toEqual({ month: "2026-09", minor: 12000 })
    expect(result.spend.months.find((month) => month.month === "2026-07")?.minor).toBe(500)
    expect(result.spend.months[0]?.month).toBe("2025-10")
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

  it("lists critical items first and flags stale syncs, missing fees and missing prices", () => {
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
          finishedAt: null,
          unpriced: 12,
          outdated: true
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
      "prices-shopify",
      "stock-stale",
      "drafts"
    ])
    expect(items[0]?.title).toBe("2 items are out of stock or will run out before a reorder arrives")
    expect(items.find((item) => item.key === "sync-shopify")?.title).toBe("Shopify orders haven't synced in 5 days")
    expect(items.find((item) => item.key === "prices-shopify")?.detail).toBe(
      "12 orders from the last 30 days have no price, so sales and margins leave them out."
    )
  })
})

describe("setupSteps", () => {
  it("marks each step done from what's connected and synced", () => {
    const steps = setupSteps({
      connected: ["shopify"],
      ordersCopied: ["shopify"],
      stockSynced: true,
      inStock: 10,
      uncosted: 2,
      suppliers: 1,
      timeZone: null
    })
    expect(Object.fromEntries(steps.map((step) => [step.key, step.done]))).toEqual({
      shopify: true,
      amazon: false,
      orders: true,
      stock: true,
      costs: false,
      supplier: true,
      "time-zone": false
    })
  })
})

describe("shipmentPipeline", () => {
  it("groups states by stage and leaves out finished shipments", () => {
    const stages = shipmentPipeline(["approval", "waiting_labels", "packing", "received", "cancelled", "collected"])
    expect(Object.fromEntries(stages.map((stage) => [stage.key, stage.shipments]))).toEqual({
      you: 2,
      packing: 1,
      booking: 0,
      ready: 0,
      transit: 1,
      problem: 0
    })
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

  it("estimates Amazon fees for orders not posted yet at the posted rate", () => {
    expect(
      amazonFees([
        { orderId: "1", revenueMinor: 10000, feesMinor: 1500 },
        { orderId: "2", revenueMinor: 4000, feesMinor: null },
        { orderId: "3", revenueMinor: null, feesMinor: null }
      ])
    ).toEqual({
      feesMinor: 2100,
      estimatedMinor: 600,
      estimatedOrders: 1,
      unknownOrders: 0,
      revenueMinor: 14000,
      rate: 0.15
    })
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
      { amazonMinor: 900, amazonRevenueMinor: 6000 }
    )
    expect(result).toEqual({
      currency: "USD",
      revenueMinor: 21000,
      costedRevenueMinor: 16000,
      costMinor: 4000 + 2400,
      feesMinor: 900,
      profitMinor: 16000 - 6400 - 900,
      margin: (16000 - 6400 - 900) / 16000
    })
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
    await applyMigrations(pg)
    await database.insert(tables.organizations).values({ id: orgId, name: "Fencing Club", kind: "buyer" })
    const shopifyOrder = (id: string, createdAt: string, lines: unknown[]) => ({
      orgId,
      source: "shopify" as const,
      externalAccountId: "club.myshopify.com",
      orderId: id,
      orderedAt: new Date(createdAt),
      data: { id, name: "#1", createdAt, cancelledAt: null, test: false, sourceName: "web", lines, fulfillments: [] }
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
      shopifyOrder("s1", "2026-09-24T10:00:00Z", [
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
          id: "l2",
          quantity: 2,
          currentQuantity: 2,
          sku: "B",
          variant: { id: "vb" },
          lineItemGroup: { id: "g1", quantity: 2, variantId: "vbundle" },
          originalUnitPriceSet: money("5.00")
        },
        {
          id: "l3",
          quantity: 4,
          currentQuantity: 4,
          sku: "C",
          variant: { id: "vc" },
          lineItemGroup: { id: "g1", quantity: 2, variantId: "vbundle" },
          originalUnitPriceSet: money("2.50")
        }
      ]),
      // Before midnight on Sep 25 in UTC, but Sep 24 in Los Angeles. Copied before prices were.
      shopifyOrder("s2", "2026-09-25T03:30:00Z", [
        { id: "l4", quantity: 1, currentQuantity: 1, sku: "A", variant: { id: "va" } }
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
      "America/Los_Angeles"
    )
    expect(rows.toSorted((a, b) => a.source.localeCompare(b.source))).toEqual([
      { source: "amazon", date: "2026-09-22", orders: 1, units: 4, priced: 1, revenueMinor: 2700, currency: "USD" },
      // $20 less 2/3 of $3, plus the $20 bundle; the unpriced order counts its unit but no sales.
      { source: "shopify", date: "2026-09-24", orders: 2, units: 5, priced: 1, revenueMinor: 3800, currency: "USD" }
    ])
  })

  it("adds up units and sales per item, a bundle once under its own variant", async () => {
    const rows = await salesByItem(orgId, [shopifyAccount, amazonAccount], {
      previousStart: new Date("2026-08-01T00:00:00Z"),
      currentStart: new Date("2026-09-01T00:00:00Z"),
      end: new Date("2026-09-26T00:00:00Z")
    })
    const byKey = Object.fromEntries(rows.map((row) => [`${row.source}:${row.period}:${row.key}`, row]))
    expect(byKey["shopify:current:va"]).toMatchObject({ units: 3, pricedUnits: 2, revenueMinor: 1800 })
    expect(byKey["shopify:current:vbundle"]).toMatchObject({ units: 2, pricedUnits: 2, revenueMinor: 2000 })
    expect(byKey["amazon:current:A"]).toMatchObject({ units: 3, pricedUnits: 3, revenueMinor: 2700, currency: "USD" })
    expect(byKey["amazon:current:B"]).toMatchObject({ units: 1, pricedUnits: 1, revenueMinor: 0 })
    expect(byKey["amazon:previous:A"]).toMatchObject({ units: 2, pricedUnits: 0, revenueMinor: 0 })
    expect(byKey["shopify:current:vb"]).toBeUndefined()
  })

  it("joins Amazon orders to the fees posted for them", async () => {
    const rows = await amazonOrderFees(
      orgId,
      "SELLER",
      new Date("2026-08-01T00:00:00Z"),
      new Date("2026-09-26T00:00:00Z")
    )
    expect(rows.toSorted((a, b) => a.orderId.localeCompare(b.orderId))).toEqual([
      { orderId: "a1", revenueMinor: 2700, feesMinor: 400 },
      { orderId: "a2", revenueMinor: null, feesMinor: null }
    ])
  })
})
