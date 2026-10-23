import { randomUUID } from "node:crypto"
import { ProviderError } from "@repo/copacker-marketplaces/amazon"
import { ebayFinanceScope } from "@repo/copacker-marketplaces/ebay-finances"
import { beforeEach, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
import { reconcileEbayPayout } from "../src/server/ebay-payout-reconciliation"
import { database, setUpTestDatabase } from "./test-db"
const context = vi.hoisted(() => ({ request: vi.fn<(method: string, path: string) => Promise<unknown>>() }))
vi.mock("@/db", () => import("./test-db"))
vi.mock("../src/server/connections", () => ({ ebayFor: async () => ({ request: context.request }) }))
import { syncEbayFinances } from "../src/server/ebay-finances"
const orgId = randomUUID(),
  now = new Date("2026-10-22T00:00:00Z")
const input = { orgId, externalAccountId: "seller", revision: 1, scopes: ebayFinanceScope }
const payout = {
  payoutId: "P1",
  payoutDate: "2026-10-20T00:00:00Z",
  payoutStatus: "SUCCEEDED",
  amount: { value: "150", currency: "USD" },
  transactionCount: 2
}
const sale = {
  transactionId: "S1",
  transactionDate: "2026-10-19T00:00:00Z",
  transactionType: "SALE",
  bookingEntry: "CREDIT" as const,
  amount: { value: "175", currency: "USD" },
  totalFeeAmount: { value: "25", currency: "USD" },
  payoutId: "P1"
}
const refund = {
  ...sale,
  transactionId: "R1",
  transactionType: "REFUND",
  bookingEntry: "DEBIT" as const,
  amount: { value: "25", currency: "USD" }
}
setUpTestDatabase({ truncate: true })
beforeEach(async () => {
  context.request.mockReset()
  await database.insert(tables.organizations).values({ id: orgId, kind: "buyer", name: "Buyer" })
  await database
    .insert(tables.connections)
    .values({ orgId, provider: "ebay", externalId: "seller", encryptedToken: "x" })
  await database.insert(tables.salesSyncs).values({ orgId, source: "ebay", externalAccountId: "seller", revision: 1 })
})
it("compares payout net without subtracting sale fees twice or recognizing another payment", () => {
  expect(reconcileEbayPayout(payout, [sale, refund])).toMatchObject({
    status: "balanced",
    additionalRecognizedAmount: null,
    transactionNet: [{ amount: "150", currency: "USD" }]
  })
  expect(reconcileEbayPayout(payout, [sale]).status).toBe("missing_transactions")
  expect(reconcileEbayPayout({ ...payout, payoutReference: "split" }, [sale, refund]).status).toBe(
    "split_payout_requires_allocation"
  )
  expect(reconcileEbayPayout(payout, [sale, { ...refund, amount: { value: "25", currency: "CAD" } }]).status).toBe(
    "currency_mismatch"
  )
})
it("imports only thirty days and follows exact payout references without duplicating rows", async () => {
  context.request.mockImplementation(async (_method: string, path: string) => {
    if (path.includes("/payout/P1")) {
      return payout
    }
    if (path.includes("/payout?")) {
      return { total: 1, payouts: [payout] }
    }
    return { total: 2, transactions: [sale, refund] }
  })
  await syncEbayFinances(input, async () => undefined, now)
  const rows = await database.select().from(tables.analyticsEvidence)
  expect(rows.filter((row) => row.dataset === "financial_transactions")).toHaveLength(2)
  expect(rows.find((row) => row.dataset === "payout_reconciliation")?.data.status).toBe("balanced")
  const feeds = await database.select().from(tables.analyticsFeeds)
  expect(feeds.find((row) => row.dataset === "financial_transactions")?.state).toMatchObject({
    coveredFrom: "2026-09-22T00:00:00.000Z",
    coveredTo: now.toISOString(),
    error: null
  })
  context.request.mockClear()
  await syncEbayFinances(input, async () => undefined, now)
  expect(context.request).not.toHaveBeenCalled()
})
it("does not query finance endpoints until permission is granted", async () => {
  await syncEbayFinances({ ...input, scopes: "" }, async () => undefined, now)
  expect(context.request).not.toHaveBeenCalled()
  expect((await database.select().from(tables.analyticsFeeds))[0]?.state.error).toBe("finance_permission_required")
})
it("honors a payout Retry-After longer than the daily refresh", async () => {
  context.request.mockImplementation(async (_method, path) => {
    if (path.includes("/payout/P1")) {
      throw new ProviderError(429, null, "throttled", 2 * 86400000)
    }
    if (path.includes("/payout?")) {
      return { total: 1, payouts: [payout] }
    }
    return { total: 0, transactions: [] }
  })
  await syncEbayFinances(input, async () => undefined, now)
  context.request.mockClear()
  await syncEbayFinances(input, async () => undefined, new Date(now.getTime() + 25 * 3600000))
  expect(context.request).not.toHaveBeenCalled()
})
it("preserves coverage on failed collection and rejects superseded writes", async () => {
  await database.insert(tables.analyticsFeeds).values({
    orgId,
    source: "ebay",
    externalAccountId: "seller",
    dataset: "financial_transactions",
    state: { coveredFrom: "2026-09-01T00:00:00Z", coveredTo: "2026-09-30T00:00:00Z" },
    checkedAt: new Date("2026-09-30")
  })
  context.request.mockRejectedValue(new Error("private provider failure"))
  await syncEbayFinances(input, async () => undefined, now)
  expect((await database.select().from(tables.analyticsFeeds))[0]?.state).toMatchObject({
    coveredTo: "2026-09-30T00:00:00Z",
    error: "financial_collection_failed"
  })
  await database.update(tables.salesSyncs).set({ revision: 2 })
  context.request.mockClear()
  await syncEbayFinances(input, async () => undefined, now)
  expect(context.request).not.toHaveBeenCalled()
  await expect(syncEbayFinances(input, async () => undefined, new Date(now.getTime() + 960000))).rejects.toThrow(
    "superseded"
  )
})
