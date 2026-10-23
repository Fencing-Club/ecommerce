import { it, expect, vi } from "vitest"
import { parseFbmReturns } from "../src/fbm-returns"
import type { Shopify } from "../src/shopify"
import { collectShopifyEconomics, economicsQueries } from "../src/shopify-economics"
const order = { id: "o1", updatedAt: "2026-01-01T00:00:00Z", transactions: [], refunds: [], tags: [], test: false }
it("recovers only named parent payments and checks the owning order", async () => {
  const snapshot = { ...order, transactions: [{ id: "refund", parentTransaction: { id: "payment" } }] }
  const graphql = vi.fn<Shopify["graphql"]>(async (query: string) =>
    query === economicsQueries.parent ? { node: { id: "payment", order: { id: "o1" } } } : { order: snapshot }
  )
  const result = await collectShopifyEconomics({ graphql }, "o1", false, async () => undefined, {
    recoverParents: true
  })
  expect(result.transactions.map((row) => row.id)).toEqual(["refund", "payment"])
  expect(graphql).toHaveBeenCalledWith(economicsQueries.parent, { id: "payment" })
  graphql.mockImplementation(async (query) =>
    query === economicsQueries.parent
      ? { node: { id: "payment", order: { id: "different-order" } } }
      : { order: snapshot }
  )
  await expect(
    collectShopifyEconomics({ graphql }, "o1", false, async () => undefined, { recoverParents: true })
  ).rejects.toThrow("Invalid input")
})

it("leaves unavailable parents absent and caps a parent chain at ten lookups", async () => {
  const snapshot = { ...order, transactions: [{ id: "0", parentTransaction: { id: "1" } }] }
  const unavailable = vi.fn<Shopify["graphql"]>(async (query: string) =>
    query === economicsQueries.parent ? { node: null } : { order: snapshot }
  )
  expect(
    (
      await collectShopifyEconomics({ graphql: unavailable }, "o1", false, async () => undefined, {
        recoverParents: true
      })
    ).transactions
  ).toHaveLength(1)
  const graphql = vi.fn<Shopify["graphql"]>(async (query: string, variables?: Record<string, unknown>) =>
    query === economicsQueries.parent
      ? {
          node: {
            id: String(variables?.id),
            order: { id: "o1" },
            parentTransaction: { id: String(Number(variables?.id) + 1) }
          }
        }
      : { order: snapshot }
  )
  expect(
    (await collectShopifyEconomics({ graphql }, "o1", false, async () => undefined, { recoverParents: true }))
      .transactions
  ).toHaveLength(11)
  expect(graphql.mock.calls.filter((call) => call[0] === economicsQueries.parent)).toHaveLength(10)
})
it("keeps missing returns permission explicit and rejects transaction truncation", async () => {
  const graphql = vi.fn<() => Promise<unknown>>(async () => ({ order }))
  expect(await collectShopifyEconomics({ graphql }, "o1", false, async () => undefined)).toMatchObject({
    returns: null,
    returnsCoverage: "missing_scope"
  })
  await expect(
    collectShopifyEconomics(
      {
        graphql: async () => ({
          order: { ...order, transactions: Array.from({ length: 100 }, (_, i) => ({ id: String(i) })) }
        })
      },
      "o1",
      false,
      async () => undefined
    )
  ).rejects.toThrow("Too big")
})
it("rejects changed orders instead of publishing mixed financial evidence", async () => {
  const graphql = vi
    .fn<() => Promise<unknown>>()
    .mockResolvedValueOnce({ order })
    .mockResolvedValueOnce({ order: { ...order, updatedAt: "2026-01-02T00:00:00Z" } })
  await expect(collectShopifyEconomics({ graphql }, "o1", false, async () => undefined)).rejects.toThrow("changed")
})
it("rejects stalled return pagination", async () => {
  const graphql = vi.fn<(query: string) => Promise<unknown>>(async (query: string) =>
    query === economicsQueries.order
      ? { order }
      : { order: { id: "o1", returns: { nodes: [], pageInfo: { hasNextPage: true, endCursor: null } } } }
  )
  await expect(collectShopifyEconomics({ graphql }, "o1", true, async () => undefined)).rejects.toThrow("stalled")
})
it("keeps FBM reasons and missing monetary fields without customer text", () => {
  const text =
    "Order ID\tReturn request date\tAmazon RMA ID\tMerchant SKU\tReturn quantity\tReturn Reason\tReturn request status\tItem Name\nO1\t2026-01-01\tR1\tS1\t2\tDEFECTIVE\tCLOSED\tprivate text"
  expect(parseFbmReturns(text)[0]).toMatchObject({
    quantity: 2,
    reason: "DEFECTIVE",
    labelCost: null,
    datePrecision: "day"
  })
  expect(JSON.stringify(parseFbmReturns(text))).not.toContain("private text")
  expect(() => parseFbmReturns(text.replace("\t2\t", "\tbad\t"))).toThrow("Invalid")
})
