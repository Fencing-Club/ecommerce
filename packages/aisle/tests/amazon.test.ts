import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Amazon } from "../src/amazon"

function client(responses: unknown[]) {
  const calls: URL[] = []
  const times: number[] = []
  const transport = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input))
    if (url.hostname === "api.amazon.com") {
      return Response.json({ access_token: "test", expires_in: 3600 })
    }
    calls.push(url)
    times.push(Date.now())
    const response = responses.shift()
    if (response === undefined) {
      throw new Error("Unexpected request")
    }
    return response instanceof Response ? response : Response.json(response)
  })
  return { api: new Amazon({ clientId: "test", clientSecret: "test", refreshToken: "test" }, transport), calls, times }
}
const listing = (sku: string, marketplaceId = "ATVPDKIKX0DER") => ({
  sku,
  summaries: [{ marketplaceId, asin: "B000000001", fnSku: "X000000001" }]
})
describe("AWD current stock", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 500 }))
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("paces pages and retries the same token after throttling", async () => {
    const { api, calls, times } = client([
      { inventory: [], nextToken: "next" },
      new Response(null, { status: 429, headers: { "retry-after": "2" } }),
      { inventory: [] }
    ])
    await api.awdStock()
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(500)
    expect(times[2]! - times[1]!).toBeGreaterThanOrEqual(2000)
    expect(calls[1]?.href).toBe(calls[2]?.href)
  })

  it("bounds transient retries and does not retry authorization failures", async () => {
    const transient = client(Array.from({ length: 3 }, () => new Response(null, { status: 503 })))
    await expect(transient.api.awdStock()).rejects.toThrow("503")
    expect(transient.calls).toHaveLength(3)
    const denied = client([new Response(null, { status: 403 })])
    await expect(denied.api.awdStock()).rejects.toThrow("403")
    expect(denied.calls).toHaveLength(1)
  })

  it("rejects retry delays beyond the collection deadline", async () => {
    const { api, calls } = client([new Response(null, { status: 429, headers: { "retry-after": "600" } })])
    await expect(api.awdStock()).rejects.toThrow("timed out")
    expect(calls).toHaveLength(1)
  })

  it("stops before requesting when job ownership is lost", async () => {
    const { api, calls } = client([{ inventory: [] }])
    await expect(
      api.awdStock(async () => {
        throw new Error("Lease lost")
      })
    ).rejects.toThrow("Lease lost")
    expect(calls).toHaveLength(0)
  })

  it("continues empty pages and preserves source quantities without adding totals", async () => {
    const { api, calls } = client([
      {
        inventory: [
          {
            sku: "z",
            totalOnhandQuantity: 100,
            totalInboundQuantity: 20,
            inventoryDetails: {
              availableDistributableQuantity: 80,
              reservedDistributableQuantity: 20,
              replenishmentQuantity: 10
            }
          }
        ],
        nextToken: "token+/="
      },
      { inventory: [], nextToken: "last" },
      { inventory: [{ sku: "a", totalOnhandQuantity: 0 }], nextToken: null }
    ])
    const result = await api.awdStock()
    expect(result).toMatchObject({
      source: "awd",
      scopeKey: "us",
      rows: [
        {
          sellerSku: "a",
          unit: "amazon_sellable_unit",
          onHand: 0,
          inbound: null,
          availableDistributable: null,
          reservedDistributable: null,
          replenishment: null
        },
        {
          sellerSku: "z",
          unit: "amazon_sellable_unit",
          onHand: 100,
          inbound: 20,
          availableDistributable: 80,
          reservedDistributable: 20,
          replenishment: 10
        }
      ]
    })
    expect(Date.parse(result.observedAt)).toBeGreaterThanOrEqual(Date.parse(result.startedAt))
    expect(calls).toHaveLength(3)
    expect(calls[1]?.searchParams.get("nextToken")).toBe("token+/=")
    for (const call of calls) {
      expect(call.pathname).toBe("/awd/2024-05-09/inventory")
      expect(call.searchParams.get("details")).toBe("SHOW")
      expect(call.searchParams.get("maxResults")).toBe("200")
    }
  })

  it("distinguishes an empty complete response from unknown quantities", async () => {
    expect((await client([{ inventory: [] }]).api.awdStock()).rows).toEqual([])
    expect((await client([{ inventory: [{ sku: "unknown" }] }]).api.awdStock()).rows[0]?.onHand).toBeNull()
  })

  it.each([
    { inventory: [{ sku: "bad", totalOnhandQuantity: -1 }] },
    { inventory: [{ sku: "bad", totalOnhandQuantity: 1.5 }] },
    { inventory: [{ sku: "bad", totalOnhandQuantity: Number.MAX_SAFE_INTEGER + 1 }] },
    { inventory: [{ sku: "" }] },
    { inventory: [], nextToken: "" },
    { inventory: Array.from({ length: 201 }, (_, i) => ({ sku: String(i) })) }
  ])("rejects invalid provider pages", async (page) => {
    await expect(client([page]).api.awdStock()).rejects.toThrow("invalid AWD stock page")
  })

  it("rejects duplicate SKUs across pages even when quantities match", async () => {
    await expect(
      client([
        { inventory: [{ sku: "repeat" }], nextToken: "second" },
        { inventory: [{ sku: "repeat" }] }
      ]).api.awdStock()
    ).rejects.toThrow("repeated an AWD stock SKU")
  })

  it("rejects repeated tokens and excessive pagination", async () => {
    await expect(
      client([
        { inventory: [], nextToken: "loop" },
        { inventory: [], nextToken: "loop" }
      ]).api.awdStock()
    ).rejects.toThrow("repeated a token")
    const bounded = client(Array.from({ length: 100 }, (_, i) => ({ inventory: [], nextToken: String(i) })))
    await Promise.all([expect(bounded.api.awdStock()).rejects.toThrow("page limit"), vi.runAllTimersAsync()])
    expect(bounded.calls).toHaveLength(100)
  })

  it("does not return partial rows after transport failure", async () => {
    const { api } = client([{ inventory: [{ sku: "first" }], nextToken: "second" }])
    await expect(api.awdStock()).rejects.toThrow("Unexpected request")
  })

  it("bounds the accumulated payload independently of page count", async () => {
    const { api, calls } = client(
      Array.from({ length: 40 }, (_, page) => ({
        inventory: Array.from({ length: 200 }, (_, row) => ({ sku: `${page}-${row}-${"界".repeat(500)}` })),
        nextToken: String(page)
      }))
    )
    await Promise.all([expect(api.awdStock()).rejects.toThrow("supported size"), vi.runAllTimersAsync()])
    expect(calls.length).toBeLessThan(40)
  })

  it("rejects results that finish after the collection deadline", async () => {
    const now = Date.now()
    vi.spyOn(Date, "now")
      .mockReturnValueOnce(now)
      .mockReturnValueOnce(now)
      .mockReturnValueOnce(now)
      .mockReturnValue(now + 301000)
    await expect(client([{ inventory: [] }]).api.awdStock()).rejects.toThrow("timed out")
  })
})
describe("Amazon listing identities", () => {
  it("batches unique SKUs in groups of twenty and uses exact seller identities", async () => {
    const skus = Array.from({ length: 21 }, (_, i) => `SKU-${i}`)
    const { api, calls } = client([
      { items: skus.slice(0, 20).map((s) => listing(s)) },
      { items: [listing(skus[20]!)] }
    ])
    const result = await api.listings("seller/1", [...skus, skus[0]!])
    expect(result.size).toBe(21)
    expect(result.get("SKU-0")).toEqual({ asin: "B000000001", fnsku: "X000000001" })
    expect(calls).toHaveLength(2)
    expect(calls[0]?.pathname).toContain("seller%2F1")
    expect(calls[0]?.searchParams.get("identifiers")?.split(",")).toHaveLength(20)
    expect(calls[1]?.searchParams.get("identifiers")).toBe("SKU-20")
  })
  it("follows pagination with the same exact SKU filter", async () => {
    const { api, calls } = client([
      { items: [listing("a")], pagination: { nextToken: "token+/=" } },
      { items: [listing("b")] }
    ])
    expect((await api.listings("seller", ["a", "b"])).size).toBe(2)
    expect(calls[1]?.searchParams.get("pageToken")).toBe("token+/=")
    expect(calls[1]?.searchParams.get("identifiers")).toBe("a,b")
  })
  it("does not use another marketplace or fabricate a missing FNSKU", async () => {
    const { api } = client([
      {
        items: [
          listing("foreign", "OTHER"),
          { sku: "missing", summaries: [{ marketplaceId: "ATVPDKIKX0DER", asin: "B000000001" }] }
        ]
      }
    ])
    const result = await api.listings("seller", ["foreign", "missing"])
    expect(result.has("foreign")).toBe(false)
    expect(result.get("missing")?.fnsku).toBe("")
  })
  it("rejects results for an unrequested SKU", async () => {
    const { api } = client([{ items: [listing("wrong")] }])
    await expect(api.listings("seller", ["wanted"])).rejects.toThrow("unexpected seller SKU")
  })
  it("stops repeated pagination tokens", async () => {
    const { api } = client([
      { items: [], pagination: { nextToken: "loop" } },
      { items: [], pagination: { nextToken: "loop" } }
    ])
    await expect(api.listings("seller", ["wanted"])).rejects.toThrow("pagination")
  })
  it("handles comma-containing SKUs through the exact item path", async () => {
    const { api, calls } = client([listing("cord,2")])
    expect((await api.listings("seller", ["cord,2"])).has("cord,2")).toBe(true)
    expect(calls[0]?.pathname).toContain("cord%2C2")
  })
})

describe("FBA inventory pages", () => {
  const page = (rows: unknown[], marketplaceId = "ATVPDKIKX0DER") => ({
    payload: { granularity: { granularityType: "Marketplace", granularityId: marketplaceId }, inventorySummaries: rows }
  })
  it("treats an empty or unreadable last-updated time as absent", async () => {
    const { api } = client([
      page([
        { sellerSku: "a", totalQuantity: 1, lastUpdatedTime: "" },
        { sellerSku: "b", totalQuantity: 2, lastUpdatedTime: "2026-09-25T10:00:00Z" }
      ])
    ])
    const { rows } = await api.fbaStockPage("ATVPDKIKX0DER")
    expect(rows.map((row) => row.lastUpdatedTime)).toEqual([undefined, "2026-09-25T10:00:00Z"])
  })
  it("requests full detailed inventory with an encoded continuation token", async () => {
    const { api, calls } = client([
      {
        ...page([
          {
            sellerSku: "cord",
            fnSku: "X123",
            totalQuantity: 8,
            inventoryDetails: {
              fulfillableQuantity: 0,
              inboundWorkingQuantity: 8,
              reservedQuantity: { totalReservedQuantity: 0 }
            }
          }
        ]),
        pagination: { nextToken: "next" }
      }
    ])
    const result = await api.fbaStockPage("ATVPDKIKX0DER", "a+/=&")
    expect(calls[0]?.pathname).toBe("/fba/inventory/v1/summaries")
    expect(Object.fromEntries(calls[0]!.searchParams)).toEqual({
      details: "true",
      granularityType: "Marketplace",
      granularityId: "ATVPDKIKX0DER",
      marketplaceIds: "ATVPDKIKX0DER",
      nextToken: "a+/=&"
    })
    expect(result.nextToken).toBe("next")
    expect(result.rows[0]?.inventoryDetails).toMatchObject({
      fulfillableQuantity: 0,
      inboundWorkingQuantity: 8,
      inboundShippedQuantity: null,
      reservedQuantity: { totalReservedQuantity: 0, fcProcessingQuantity: null }
    })
  })
  it("retains missing details as unknown and accepts a genuinely empty page", async () => {
    const { api } = client([page([{ sellerSku: "cord" }]), page([])])
    expect((await api.fbaStockPage("ATVPDKIKX0DER")).rows[0]).toEqual({ sellerSku: "cord", totalQuantity: null })
    expect(await api.fbaStockPage("ATVPDKIKX0DER")).toEqual({
      marketplaceId: "ATVPDKIKX0DER",
      rows: [],
      nextToken: null
    })
  })
  it("rejects unsupported routing and malformed tokens before making any request", async () => {
    const { api, calls } = client([])
    await expect(api.fbaStockPage("EU_MARKETPLACE")).rejects.toThrow("ATVPDKIKX0DER")
    await expect(api.fbaStockPage("ATVPDKIKX0DER", "")).rejects.toThrow("Too small")
    expect(calls).toHaveLength(0)
  })
  it.each([
    page([], "WRONG"),
    { errors: [{ code: "Denied" }] },
    { ...page([]), errors: [{ code: "Partial" }] },
    page([{ sellerSku: "cord", totalQuantity: -1 }]),
    page([{ sellerSku: "cord", inventoryDetails: { fulfillableQuantity: 1.5 } }]),
    page([
      {
        sellerSku: "cord",
        inventoryDetails: { unfulfillableQuantity: { defectiveQuantity: Number.MAX_SAFE_INTEGER + 1 } }
      }
    ])
  ])("rejects mismatched, errored or invalid stock responses", async (response) => {
    await expect(client([response]).api.fbaStockPage("ATVPDKIKX0DER")).rejects.toThrow(
      /marketplace|payload|errors|Quantity/
    )
  })
})

describe("FBA complete stock", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 500 }))
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })
  const page = (rows: unknown[], nextToken?: string) => ({
    payload: {
      granularity: { granularityType: "Marketplace", granularityId: "ATVPDKIKX0DER" },
      inventorySummaries: rows
    },
    ...(nextToken ? { pagination: { nextToken } } : {})
  })
  it("collects empty continuation pages and distinct fulfillment identities", async () => {
    const { api, calls } = client([
      page([], "first"),
      page([{ sellerSku: "cord", fnSku: "B" }], "second"),
      page([{ sellerSku: "cord", fnSku: "A" }])
    ])
    const result = await api.fbaStock("ATVPDKIKX0DER")
    expect(result).toMatchObject({ source: "fba", scopeKey: "ATVPDKIKX0DER" })
    expect(result.rows.map((row) => row.fnSku)).toEqual(["A", "B"])
    expect(result.rows[0]).toMatchObject({ unit: "amazon_sellable_unit", totalQuantity: null })
    expect(calls[2]?.searchParams.get("nextToken")).toBe("second")
  })
  it("rejects duplicate rows and repeated tokens", async () => {
    await expect(
      client([page([{ sellerSku: "x" }], "next"), page([{ sellerSku: "x" }])]).api.fbaStock("ATVPDKIKX0DER")
    ).rejects.toThrow("identity")
    await expect(client([page([], "next"), page([], "next")]).api.fbaStock("ATVPDKIKX0DER")).rejects.toThrow("token")
  })
  it("retries the same page but refuses a retry beyond token validity", async () => {
    const good = client([page([], "next"), new Response(null, { status: 429 }), page([])])
    await good.api.fbaStock("ATVPDKIKX0DER")
    expect(good.calls[1]?.href).toBe(good.calls[2]?.href)
    const expired = client([page([], "next"), new Response(null, { status: 429, headers: { "retry-after": "30" } })])
    await expect(expired.api.fbaStock("ATVPDKIKX0DER")).rejects.toThrow("timed out")
    expect(expired.calls).toHaveLength(2)
  })
  it("rejects incomplete reads and lost ownership", async () => {
    await expect(
      client([page([], "next"), new Response(null, { status: 403 })]).api.fbaStock("ATVPDKIKX0DER")
    ).rejects.toThrow("403")
    const api = client([page([])])
    await expect(
      api.api.fbaStock("ATVPDKIKX0DER", async () => {
        throw new Error("Lost lease")
      })
    ).rejects.toThrow("Lost lease")
    expect(api.calls).toHaveLength(0)
  })
  it("bounds page count", async () => {
    const { api, calls } = client(Array.from({ length: 100 }, (_, i) => page([], String(i))))
    const pending = api.fbaStock("ATVPDKIKX0DER")
    await Promise.all([expect(pending).rejects.toThrow("page limit"), vi.runAllTimersAsync()])
    expect(calls).toHaveLength(100)
  })
})

describe("inbound shipment contents", () => {
  it("adds up an FBA shipment's units by SKU across pages", async () => {
    const { api, calls } = client([
      {
        payload: {
          ItemData: [
            { SellerSKU: "A", QuantityShipped: 10, QuantityReceived: 9 },
            { SellerSKU: "B", QuantityShipped: 0, QuantityReceived: 4 }
          ],
          NextToken: "next"
        }
      },
      {
        payload: {
          ItemData: [
            { ShipmentId: "FBA1ABCDEF", SellerSKU: "A", QuantityShipped: 5 },
            // Another shipment's items aren't counted.
            { ShipmentId: "FBA2OTHER", SellerSKU: "A", QuantityShipped: 7 }
          ],
          NextToken: "again"
        }
      },
      // Amazon hands out a token even with nothing left.
      { payload: { ItemData: [], NextToken: "empty" } }
    ])
    expect(Object.fromEntries((await api.fbaShipmentUnits("FBA1ABCDEF"))!)).toEqual({ A: 15, B: 4 })
    expect(calls[0]?.pathname).toBe("/fba/inbound/v0/shipments/FBA1ABCDEF/items")
    expect(calls[1]?.pathname).toBe("/fba/inbound/v0/shipmentItems")
    expect(calls[1]?.searchParams.get("QueryType")).toBe("NEXT_TOKEN")
    expect(calls[1]?.searchParams.get("NextToken")).toBe("next")
    expect(calls).toHaveLength(3)
  })

  it("counts an AWD shipment's units from its cartons, and cartons within pallets", async () => {
    const product = (sku: string, quantity: number) => ({ sku, quantity, attributes: [] })
    const { api, calls } = client([
      {
        shipmentContainerQuantities: [
          { count: 2, distributionPackage: { type: "CASE", contents: { products: [product("A", 80)], packages: [] } } },
          {
            count: 1,
            distributionPackage: {
              type: "PALLET",
              contents: {
                products: [],
                packages: [
                  { count: 3, distributionPackage: { type: "CASE", contents: { products: [product("B", 10)] } } }
                ]
              }
            }
          }
        ]
      }
    ])
    expect(Object.fromEntries((await api.awdShipmentUnits("STAR-1"))!)).toEqual({ A: 160, B: 30 })
    expect(calls[0]?.pathname).toBe("/awd/2024-05-09/inboundShipments/STAR-1")
  })

  it("returns null for a shipment Amazon has no record of", async () => {
    const { api } = client([
      Response.json({ errors: [{ code: "NotFound", message: "No shipment" }] }, { status: 404 }),
      Response.json({ errors: [{ code: "InvalidInput", message: "Unknown shipment" }] }, { status: 400 })
    ])
    expect(await api.awdShipmentUnits("STAR-X")).toBeNull()
    expect(await api.fbaShipmentUnits("FBA1X")).toBeNull()
  })

  it("lists the North American marketplaces the seller sells in, the US first", async () => {
    const { api } = client([
      {
        payload: [
          { marketplace: { id: "A1AM78C64UM0Y8" }, participation: { isParticipating: true } },
          { marketplace: { id: "ATVPDKIKX0DER" }, participation: { isParticipating: true } },
          { marketplace: { id: "A2Q3Y263D00KWC" }, participation: { isParticipating: false } },
          // Non-Amazon (multi-channel fulfillment) isn't a sales marketplace.
          { marketplace: { id: "A2ZV50J4W1RKNI" }, participation: { isParticipating: true } }
        ]
      }
    ])
    expect(await api.salesMarketplaces()).toEqual(["ATVPDKIKX0DER", "A1AM78C64UM0Y8"])
  })
})
