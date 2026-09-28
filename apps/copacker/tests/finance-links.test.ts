import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"

const context = vi.hoisted(() => ({ current: null as unknown }))
vi.mock("@/db", () => ({ db: () => context.current }))
import { freightPerSku, freightShipment, syncInboundShipments } from "../src/server/amazon-shipments"
import type { Session } from "../src/server/auth"
import { syncExchangeRates } from "../src/server/exchange-rates"
import { landedMarkupsFor } from "../src/server/landed-costs"
import {
  addMonthlyCost,
  listMonthlyCosts,
  monthlyCostShares,
  removeMonthlyCost,
  type MonthlyCost
} from "../src/server/monthly-costs"
import {
  amazonFreight,
  platformCharges,
  reportingCurrency,
  salesByDay,
  shopifyCustomers
} from "../src/server/overview-sales"
import { applyMigrations } from "./migrations"

describe("freight by shipment", () => {
  it("reads the inbound shipment a freight charge names", () => {
    expect(freightShipment("FBA19B16R6HZ")).toEqual({ network: "fba", shipmentId: "FBA19B16R6HZ" })
    expect(freightShipment("STAR-RDBKBGHGZMXXU")).toEqual({ network: "awd", shipmentId: "STAR-RDBKBGHGZMXXU" })
    expect(freightShipment("IB_2026-04-06_STAR-RDBKBGHGZMXXU")).toEqual({
      network: "awd",
      shipmentId: "STAR-RDBKBGHGZMXXU"
    })
    // A transfer from AWD to FBA names no inbound shipment.
    expect(freightShipment("repl-f718288b-49c2-4061-91d7-566c74272448")).toBeNull()
    expect(freightShipment(null)).toBeNull()
  })

  it("shares each shipment's freight by its units and leaves the rest to spread", () => {
    const result = freightPerSku(
      [
        { reference: "FBA1ABCDEF", freightMinor: 3000 },
        { reference: "FBA1ABCDEF", freightMinor: 1000 },
        { reference: "STAR-2", freightMinor: 1000 },
        { reference: "repl-3", freightMinor: 500 },
        // Its contents aren't known.
        { reference: "FBA4ABCDEF", freightMinor: 200 }
      ],
      new Map<string, Record<string, number> | null>([
        // $40 over 40 units: $1 each.
        ["FBA1ABCDEF", { A: 30, B: 10 }],
        // $10 over 5 units: $2 each.
        ["STAR-2", { B: 5 }],
        ["FBA4ABCDEF", null]
      ])
    )
    expect(Object.fromEntries(result.perUnit)).toEqual({ A: 100, B: (1000 + 1000) / 15 })
    expect(result.unallocatedMinor).toBe(700)
  })
})

describe("monthly costs", () => {
  const cost = (overrides: Partial<MonthlyCost>): MonthlyCost => ({
    id: "c1",
    name: "Marketplace Connect",
    amountMinor: 9900,
    currency: "USD",
    channel: null,
    startsOn: null,
    endsOn: null,
    ...overrides
  })

  it("takes each month's amount over the days paid in a period", () => {
    // 30 days of an ongoing $99 a month: $99 × 12 × 30 / 365.
    expect(monthlyCostShares([cost({})], "2026-08-27", "2026-09-26")).toEqual([
      { ...cost({}), shareMinor: Math.round((9900 * 12 * 30) / 365) }
    ])
    // Started 10 days before the period ends.
    expect(monthlyCostShares([cost({ startsOn: "2026-09-16" })], "2026-08-27", "2026-09-26")[0]?.shareMinor).toBe(
      Math.round((9900 * 12 * 10) / 365)
    )
    // Stopped on Aug 31, its last day paid: 5 days in the period.
    expect(monthlyCostShares([cost({ endsOn: "2026-08-31" })], "2026-08-27", "2026-09-26")[0]?.shareMinor).toBe(
      Math.round((9900 * 12 * 5) / 365)
    )
    // Outside the period.
    expect(monthlyCostShares([cost({ endsOn: "2026-08-01" })], "2026-08-27", "2026-09-26")).toEqual([])
  })
})

describe("finance links", () => {
  const pg = new PGlite()
  const database = drizzle(pg, { schema: tables })
  const orgId = randomUUID()
  const amazonAccount = { provider: "amazon" as const, externalId: "SELLER" }
  const freightCharge = (id: string, reference: string, totalMinor: number, description: string) => ({
    orgId,
    externalAccountId: "SELLER",
    transactionId: id,
    orderId: reference,
    postedAt: new Date("2026-09-10T00:00:00Z"),
    type: "ServiceFee",
    currency: "USD",
    totalMinor,
    feesMinor: 0,
    data: { description }
  })

  beforeAll(async () => {
    context.current = database
    await applyMigrations(pg)
    await database.insert(tables.organizations).values({ id: orgId, name: "Fencing Club", kind: "buyer" })
    await database.insert(tables.exchangeRates).values([
      { currency: "CAD", day: "2026-09-01", perUsd: "1.25" },
      { currency: "CAD", day: "2026-09-10", perUsd: "1.5" },
      { currency: "MXN", day: "2026-09-01", perUsd: "20" }
    ])
    const amazonOrder = (id: string, createdAt: string, amount: string, currencyCode: string) => ({
      orgId,
      source: "amazon" as const,
      externalAccountId: "SELLER",
      orderId: id,
      orderedAt: new Date(createdAt),
      data: {
        orderId: id,
        createdTime: createdAt,
        orderItems: [
          {
            orderItemId: `${id}-1`,
            quantityOrdered: 1,
            product: { sellerSku: "A" },
            proceeds: { breakdowns: [{ type: "ITEM", subtotal: { amount, currencyCode } }] }
          }
        ]
      }
    })
    await database.insert(tables.salesOrders).values([
      amazonOrder("us", "2026-09-05T12:00:00Z", "10.00", "USD"),
      // CA$25 at 1.25 a dollar: $20.
      amazonOrder("ca", "2026-09-05T12:00:00Z", "25.00", "CAD"),
      // CA$30 at 1.5, the rate from Sep 10: $20.
      amazonOrder("ca2", "2026-09-12T12:00:00Z", "30.00", "CAD"),
      // No rates for Brazilian reais: counted, but not in sales.
      amazonOrder("br", "2026-09-05T12:00:00Z", "50.00", "BRL")
    ] as (typeof tables.salesOrders.$inferInsert)[])
  })
  afterAll(async () => {
    await pg.close()
  })

  it("converts sales in other currencies at the rate on the day they were placed", async () => {
    const rows = await salesByDay(orgId, [amazonAccount], new Date("2026-09-01T00:00:00Z"), "UTC", "USD")
    expect(rows.toSorted((a, b) => a.date.localeCompare(b.date))).toEqual([
      { source: "amazon", date: "2026-09-05", orders: 3, units: 3, priced: 2, revenueMinor: 3000, currency: "USD" },
      { source: "amazon", date: "2026-09-12", orders: 1, units: 1, priced: 1, revenueMinor: 2000, currency: "USD" }
    ])
    // Into Canadian dollars instead: $10 is CA$12.50.
    const inCad = await salesByDay(orgId, [amazonAccount], new Date("2026-09-01T00:00:00Z"), "UTC", "CAD")
    expect(inCad.find((row) => row.date === "2026-09-05")?.revenueMinor).toBe(1250 + 2500)
  })

  it("converts platform charges at the rate on the day they were posted", async () => {
    await database.insert(tables.amazonTransactions).values({
      ...freightCharge("mx-storage", "", -20000, "StorageFee"),
      orderId: null,
      currency: "MXN"
    })
    const lines = await platformCharges(
      orgId,
      [amazonAccount],
      new Date("2026-09-01T00:00:00Z"),
      new Date("2026-09-26T00:00:00Z"),
      "USD"
    )
    // MX$200 at 20 a dollar.
    expect(lines).toEqual([{ key: "amazon-charges", label: "Amazon account charges", minor: -1000, currency: "USD" }])
  })

  it("records monthly costs for the buyer's own workspace only", async () => {
    const session = (id: string, kind: "buyer" | "supplier") =>
      ({ org: { id, kind }, user: { id: "user" }, role: "owner" }) as unknown as Session
    const buyer = session(orgId, "buyer")
    const { id } = await addMonthlyCost(buyer, {
      name: "Marketplace Connect",
      amount: 9900,
      currency: "USD",
      channel: "amazon",
      startsOn: "2025-10-01"
    })
    expect(await listMonthlyCosts(orgId)).toEqual([
      {
        id,
        name: "Marketplace Connect",
        amountMinor: 9900,
        currency: "USD",
        channel: "amazon",
        startsOn: "2025-10-01",
        endsOn: null
      }
    ])
    await expect(
      addMonthlyCost(buyer, { name: "App", amount: 100, currency: "USD", startsOn: "2026-02-01", endsOn: "2026-01-01" })
    ).rejects.toThrow("errors.endBeforeStart")
    await expect(
      addMonthlyCost(session(randomUUID(), "supplier"), { name: "App", amount: 1, currency: "USD" })
    ).rejects.toThrow("buyer")
    const other = randomUUID()
    await database.insert(tables.organizations).values({ id: other, name: "Other", kind: "buyer" })
    await expect(removeMonthlyCost(session(other, "buyer"), id)).rejects.toThrow("not found")
    await removeMonthlyCost(buyer, id)
    expect(await listMonthlyCosts(orgId)).toEqual([])
  })

  it("counts Shopify customers in the period, returning ones, and a year's sales per customer", async () => {
    const order = (id: string, at: string, customerId: string | null, amount: string) => ({
      orgId,
      source: "shopify" as const,
      externalAccountId: "club.myshopify.com",
      orderId: id,
      orderedAt: new Date(at),
      data: {
        id,
        name: "#1",
        createdAt: at,
        cancelledAt: null,
        test: false,
        sourceName: "web",
        fulfillments: [],
        ...(customerId && { customerId }),
        lines: [
          {
            id: `${id}-l`,
            quantity: 1,
            currentQuantity: 1,
            sku: "A",
            variant: { id: "va" },
            originalUnitPriceSet: { shopMoney: { amount, currencyCode: "USD" } }
          }
        ]
      }
    })
    await database.insert(tables.salesOrders).values([
      // Returning: ordered in August, and again in the period.
      order("s1", "2026-08-10T12:00:00Z", "gid://shopify/Customer/1", "40.00"),
      order("s2", "2026-09-10T12:00:00Z", "gid://shopify/Customer/1", "60.00"),
      // New in the period.
      order("s3", "2026-09-12T12:00:00Z", "gid://shopify/Customer/2", "30.00"),
      // A guest: no customer.
      order("s4", "2026-09-12T12:00:00Z", null, "99.00"),
      // After the period: not counted.
      order("s5", "2026-10-02T12:00:00Z", "gid://shopify/Customer/3", "10.00")
    ] as (typeof tables.salesOrders.$inferInsert)[])
    const result = await shopifyCustomers(
      orgId,
      { provider: "shopify", externalId: "club.myshopify.com" },
      { from: new Date("2026-09-01T00:00:00Z"), to: new Date("2026-10-01T00:00:00Z") },
      "USD"
    )
    expect(result).toEqual({
      customers: 2,
      returning: 1,
      yearCustomers: 2,
      repeatCustomers: 1,
      yearOrders: 3,
      yearRevenueMinor: 13000,
      currency: "USD"
    })
  })

  it("reports in the Shopify store's currency, or US dollars", async () => {
    expect(await reportingCurrency(orgId)).toBe("USD")
  })

  it("copies the rates for the workspace's currencies from the day after the last one stored", async () => {
    const requests: string[] = []
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      requests.push(url)
      if (url.endsWith("/currencies")) {
        return Response.json({ CAD: "Canadian Dollar", MXN: "Mexican Peso" })
      }
      return Response.json({ rates: { "2026-09-25": { CAD: 1.4, MXN: 18 } } })
    })
    await syncExchangeRates(orgId, new Date("2026-09-26T12:00:00Z"), fetcher)
    // BRL isn't published; the rates run from the day after the oldest latest rate (MXN's, Sep 1).
    expect(requests.at(-1)).toBe("https://api.frankfurter.dev/v1/2026-09-02..2026-09-26?base=USD&symbols=CAD,MXN")
    const stored = await database.select().from(tables.exchangeRates)
    expect(stored.filter((row) => row.day === "2026-09-25").map((row) => [row.currency, Number(row.perUsd)])).toEqual(
      expect.arrayContaining([
        ["CAD", 1.4],
        ["MXN", 18]
      ])
    )
  })

  it("looks up the shipments freight was charged for, once each", async () => {
    await database
      .insert(tables.amazonTransactions)
      .values([
        freightCharge("f1", "FBA1ABCDEF", -4000, "FBAInternationalInboundFreightCharge"),
        freightCharge("f2", "IB_2026-09-01_STAR-XYZ", -1000, "AWDTransportationFee"),
        freightCharge("f3", "repl-1", -500, "AWDTransportationFee"),
        freightCharge("f4", "STAR-PO1", -2500, "FBAPostInboundTransportation")
      ])
    const amazon = {
      fbaShipmentUnits: vi.fn<(id: string) => Promise<Map<string, number> | null>>(
        async () =>
          new Map([
            ["A", 30],
            ["B", 10]
          ])
      ),
      awdShipmentUnits: vi.fn<(id: string) => Promise<Map<string, number> | null>>(async (id) =>
        id === "STAR-XYZ" ? new Map([["B", 5]]) : null
      )
    }
    const input = { orgId, externalAccountId: "SELLER", amazon }
    const owned = () => Promise.resolve()
    await syncInboundShipments(input, owned, new Date("2026-09-26T00:00:00Z"))
    expect(amazon.fbaShipmentUnits).toHaveBeenCalledExactlyOnceWith("FBA1ABCDEF")
    expect(amazon.awdShipmentUnits.mock.calls.map(([id]) => id).toSorted()).toEqual(["STAR-PO1", "STAR-XYZ"])
    // Found shipments aren't read again; a missing one waits a week.
    await syncInboundShipments(input, owned, new Date("2026-09-27T00:00:00Z"))
    expect(amazon.fbaShipmentUnits).toHaveBeenCalledTimes(1)
    expect(amazon.awdShipmentUnits).toHaveBeenCalledTimes(2)
    await syncInboundShipments(input, owned, new Date("2026-10-04T00:00:00Z"))
    expect(amazon.awdShipmentUnits).toHaveBeenCalledTimes(3)
  })

  it("puts freight for a PO's shipment in its landed costs and spreads the rest by SKU", async () => {
    const supplierId = randomUUID()
    await database
      .insert(tables.suppliers)
      .values({ id: supplierId, buyerOrgId: orgId, name: "Supplier", email: "s@example.com" })
    const [po] = await database
      .insert(tables.orders)
      .values({
        buyerOrgId: orgId,
        supplierId,
        shopifyDomain: "club.myshopify.com",
        status: "submitted",
        data: {
          currency: "USD",
          items: [{ variantId: "va", pieces: 100, piecesPerSet: 1, unitPrice: 500 }],
          adjustments: []
        } as never
      })
      .returning()
    await database
      .insert(tables.shipments)
      .values({ orderId: po!.id, orderRevision: 1, amazonShipmentId: "STAR-PO1", amazonOrderId: "STAR-ORDER1" })
    // $25 of freight on $500 of products: 5% more to land.
    expect(Object.fromEntries(await landedMarkupsFor(orgId))).toEqual({ va: 0.05 })
    const freight = await amazonFreight(
      orgId,
      "SELLER",
      { from: new Date("2026-09-01T00:00:00Z"), to: new Date("2026-09-26T00:00:00Z") },
      "USD",
      10,
      new Set(["STAR-PO1"])
    )
    expect(freight).toEqual({
      currency: "USD",
      // The PO's shipment is left out: $40 + $10 + $5.
      freightMinor: 5500,
      bySku: new Map([
        ["A", 100],
        ["B", 2000 / 15]
      ]),
      // The AWD transfer's $5 over the 10 units sold.
      perUnitMinor: 50
    })
  })
})
