import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import type { OrderInput } from "@repo/aisle"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
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
  coverBucket,
  dailySales,
  periodTotal,
  purchasing,
  salesByDay,
  shipmentPipeline,
  summarizeRestock
} from "../src/server/overview"
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

function order(items: { pieces: number; unitPrice: number }[], currency = "USD"): OrderInput {
  return { currency, items, adjustments: [] } as unknown as OrderInput
}

describe("dailySales", () => {
  const today = new Date("2026-09-25T15:00:00Z")

  it("fills uncovered days with null and covered days without orders with zero", () => {
    const series = dailySales(
      [{ source: "amazon", date: "2026-09-23", orders: 2, units: 5 }],
      { amazon: { from: new Date("2026-09-22T00:00:00Z"), to: new Date("2026-09-25T10:00:00Z") } },
      today,
      4
    )
    expect(series.map((row) => row.date)).toEqual(["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24"])
    expect(series.map((row) => row.amazon)).toEqual([
      null,
      { orders: 0, units: 0 },
      { orders: 2, units: 5 },
      { orders: 0, units: 0 }
    ])
    expect(series.every((row) => row.shopify === null)).toBe(true)
  })

  it("compares with the previous period only when both are fully covered", () => {
    const covered = { from: new Date("2026-01-01T00:00:00Z"), to: new Date("2026-09-25T00:00:00Z") }
    const rows = [
      { source: "amazon" as const, date: "2026-09-24", orders: 3, units: 6 },
      { source: "amazon" as const, date: "2026-09-10", orders: 1, units: 2 },
      { source: "amazon" as const, date: "2026-08-20", orders: 2, units: 4 }
    ]
    const series = dailySales(rows, { amazon: covered }, today, 60)
    expect(periodTotal(series, ["amazon"], 30)).toEqual({ orders: 4, units: 8, previous: { orders: 2, units: 4 } })
    const short = dailySales(rows, { amazon: { ...covered, from: new Date("2026-09-01T00:00:00Z") } }, today, 60)
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

  it("adds stock, value, reorders and best sellers across channels", () => {
    const summary = summarizeRestock([
      {
        key: "amazon",
        label: "Amazon",
        lines: [
          line({
            status: "stockout",
            sold: 40,
            available: 2,
            daysRemaining: 3,
            stockoutDays: 5,
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
        lines: [line({ status: "reorder", sold: 10, available: 30, daysRemaining: 20, estimatedCostMinor: 5000 })]
      }
    ])
    expect(summary).toMatchObject({
      stockouts: 1,
      reorders: 1,
      reorderCost: [{ currency: "USD", minor: 25000 }],
      lostDays: 5,
      itemsOut: 1,
      unitsOnHand: 52,
      stockValue: [{ currency: "USD", minor: 16000 }],
      uncosted: 1
    })
    expect(summary.channels).toEqual([
      { key: "amazon", label: "Amazon", available: 22, incoming: 10, value: [{ currency: "USD", minor: 1000 }] },
      { key: "shopify:1", label: "Warehouse", available: 30, incoming: 0, value: [{ currency: "USD", minor: 15000 }] }
    ])
    expect(summary.bestSellers[0]).toMatchObject({
      variantId: "v1",
      sold: 50,
      available: 32,
      daysRemaining: 3,
      status: "stockout",
      channels: ["Amazon", "Warehouse"]
    })
    expect(summary.cover.find((bucket) => bucket.key === "under14")?.items).toBe(1)
  })
})

describe("purchasing", () => {
  it("totals open and draft POs and groups sent value by month", () => {
    const result = purchasing(
      [
        {
          status: "submitted",
          supplier: "Ok Fencing",
          data: order([{ pieces: 10, unitPrice: 1000 }]),
          sentAt: new Date("2026-09-02T00:00:00Z")
        },
        {
          status: "closed",
          supplier: "Ok Fencing",
          data: order([{ pieces: 1, unitPrice: 500 }]),
          sentAt: new Date("2026-07-15T00:00:00Z")
        },
        { status: "draft", supplier: "Blade Co", data: order([{ pieces: 2, unitPrice: 300 }]), sentAt: null },
        {
          status: "submitted",
          supplier: "Blade Co",
          data: order([{ pieces: 1, unitPrice: 100 }], "EUR"),
          sentAt: new Date("2026-09-03T00:00:00Z")
        }
      ],
      new Date("2026-09-25T00:00:00Z")
    )
    expect(result.openCount).toBe(2)
    expect(result.open).toEqual([
      { currency: "USD", minor: 10000 },
      { currency: "EUR", minor: 100 }
    ])
    expect(result.draftCount).toBe(1)
    expect(result.bySupplier.map((supplier) => supplier.name)).toEqual(["Ok Fencing", "Blade Co"])
    expect(result.spend.currency).toBe("USD")
    expect(result.spend.otherCurrencies).toBe(true)
    expect(result.spend.months).toHaveLength(12)
    expect(result.spend.months.at(-1)).toEqual({ month: "2026-09", minor: 10000 })
    expect(result.spend.months.find((month) => month.month === "2026-07")?.minor).toBe(500)
    expect(result.spend.months[0]?.month).toBe("2025-10")
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

  it("lists critical items first and flags stale and failed syncs", () => {
    const items = attentionItems({
      ...quiet,
      restock: { ...quiet.restock, stockouts: 2, reorders: 1 },
      shipments: { waiting: 1, problems: 0 },
      drafts: 1,
      syncs: [
        { source: "shopify", status: "idle", coveredTo: new Date("2026-09-20T00:00:00Z"), finishedAt: null },
        { source: "amazon", status: "failed", coveredTo: now, finishedAt: now }
      ],
      stock: [{ source: "fba", status: "idle", finishedAt: new Date("2026-09-01T00:00:00Z") }]
    })
    expect(items.map((item) => item.key)).toEqual([
      "stockouts",
      "shipments-waiting",
      "reorders",
      "sync-amazon",
      "sync-shopify",
      "stock-stale",
      "drafts"
    ])
    expect(items[0]?.title).toBe("2 items are out of stock or will run out before a reorder arrives")
    expect(items.find((item) => item.key === "sync-shopify")?.title).toBe("Shopify orders haven't synced in 5 days")
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

describe("salesByDay", () => {
  const pg = new PGlite()
  const database = drizzle(pg, { schema: tables })
  const orgId = randomUUID()

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
    await database.insert(tables.salesOrders).values([
      // A bundle of 2 counts once as 2, whatever its components; plain lines count at their current quantity.
      shopifyOrder("s1", "2026-09-24T10:00:00Z", [
        { id: "l1", quantity: 3, currentQuantity: 2, sku: "A", variant: { id: "va" }, lineItemGroup: null },
        {
          id: "l2",
          quantity: 2,
          currentQuantity: 2,
          sku: "B",
          variant: { id: "vb" },
          lineItemGroup: { id: "g1", quantity: 2, variantId: "vbundle" }
        },
        {
          id: "l3",
          quantity: 4,
          currentQuantity: 4,
          sku: "C",
          variant: { id: "vc" },
          lineItemGroup: { id: "g1", quantity: 2, variantId: "vbundle" }
        }
      ]),
      shopifyOrder("s2", "2026-09-24T23:30:00Z", [
        { id: "l4", quantity: 1, currentQuantity: 1, sku: "A", variant: { id: "va" } }
      ]),
      {
        orgId,
        source: "amazon",
        externalAccountId: "SELLER",
        orderId: "a1",
        orderedAt: new Date("2026-09-23T05:00:00Z"),
        data: {
          orderId: "a1",
          createdTime: "2026-09-23T05:00:00Z",
          orderItems: [
            { quantityOrdered: 3, product: { sellerSku: "A" } },
            { quantityOrdered: 1, product: { sellerSku: "B" } }
          ]
        }
      },
      // Another account's orders aren't counted.
      { ...shopifyOrder("s3", "2026-09-24T10:00:00Z", []), externalAccountId: "old.myshopify.com" }
    ] as (typeof tables.salesOrders.$inferInsert)[])
  })
  afterAll(async () => {
    await pg.close()
  })

  it("counts orders and units per source and UTC day for the connected accounts", async () => {
    const rows = await salesByDay(
      orgId,
      [
        { provider: "shopify", externalId: "club.myshopify.com" },
        { provider: "amazon", externalId: "SELLER" }
      ],
      new Date("2026-09-01T00:00:00Z")
    )
    expect(
      rows
        .map(({ source, date, orders, units }) => ({ source, date, orders, units }))
        .toSorted((a, b) => a.source.localeCompare(b.source))
    ).toEqual([
      { source: "amazon", date: "2026-09-23", orders: 1, units: 4 },
      { source: "shopify", date: "2026-09-24", orders: 2, units: 5 }
    ])
  })
})
