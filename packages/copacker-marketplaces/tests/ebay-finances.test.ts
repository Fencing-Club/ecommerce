import { expect, it, vi } from "vitest"
import { collectEbayFinances, collectEbayPayoutTransactions } from "../src/ebay-finances"
const window = { from: "2026-10-01T00:00:00Z", to: "2026-10-22T00:00:00Z" }
const transaction = (id: string) => ({
  transactionId: id,
  transactionDate: "2026-10-15T00:00:00Z",
  transactionType: "SALE",
  bookingEntry: "CREDIT",
  amount: { value: "175.00", currency: "USD" },
  totalFeeAmount: { value: "25.00", currency: "USD" },
  payoutId: "P1"
})
it("retains net amounts and fee evidence without buyer or bank information", async () => {
  const request = vi
    .fn<(method: string, path: string) => Promise<unknown>>()
    .mockResolvedValueOnce({
      total: 1,
      transactions: [{ ...transaction("T1"), buyer: { username: "private" }, transactionMemo: "private" }]
    })
    .mockResolvedValueOnce({
      total: 1,
      payouts: [
        {
          payoutId: "P1",
          payoutDate: "2026-10-16T00:00:00Z",
          amount: { value: "175.00", currency: "USD" },
          payoutStatus: "SUCCEEDED",
          payoutInstrument: { accountLastFourDigits: "1234" }
        }
      ]
    })
  const result = await collectEbayFinances({ request }, window, async () => undefined)
  expect(result.transactions).toEqual([transaction("T1")])
  expect(result.payouts[0]).not.toHaveProperty("payoutInstrument")
  expect(new URL(request.mock.calls[0]![1]).searchParams.get("filter")).toBe(
    `transactionDate:[${window.from}..${window.to}]`
  )
})
it("rejects incomplete pages and changed totals instead of claiming coverage", async () => {
  const request = vi
    .fn<(method: string, path: string) => Promise<unknown>>()
    .mockResolvedValue({ total: 2, transactions: [transaction("T1")] })
  await expect(collectEbayFinances({ request }, window, async () => undefined)).rejects.toThrow("incomplete")
  request
    .mockReset()
    .mockResolvedValueOnce({
      total: 201,
      transactions: Array.from({ length: 200 }, (_, index) => transaction(String(index)))
    })
    .mockResolvedValueOnce({ total: 202, transactions: [transaction("201")] })
  await expect(collectEbayFinances({ request }, window, async () => undefined)).rejects.toThrow("changed")
})
it("accepts empty payout responses but rejects out-of-window transactions", async () => {
  const request = vi
    .fn<(method: string, path: string) => Promise<unknown>>()
    .mockResolvedValueOnce({ total: 0 })
    .mockResolvedValueOnce({})
  expect(await collectEbayFinances({ request }, window, async () => undefined)).toEqual({
    transactions: [],
    payouts: []
  })
  request
    .mockResolvedValueOnce({
      total: 1,
      transactions: [{ ...transaction("T1"), transactionDate: "2020-01-01T00:00:00Z" }]
    })
    .mockResolvedValueOnce({})
  await expect(collectEbayFinances({ request }, window, async () => undefined)).rejects.toThrow("outside")
})
it("fetches only the exact payout's related records and checks ownership", async () => {
  const request = vi
    .fn<(method: string, path: string) => Promise<unknown>>()
    .mockResolvedValue({ total: 1, transactions: [transaction("T1")] })
  const assertOwned = vi.fn<() => Promise<void>>(async () => undefined)
  expect(await collectEbayPayoutTransactions({ request }, "P1", assertOwned)).toHaveLength(1)
  expect(new URL(request.mock.calls[0]![1]).searchParams.get("filter")).toBe("payoutId:{P1}")
  expect(assertOwned).toHaveBeenCalled()
  await expect(collectEbayPayoutTransactions({ request }, "P2", assertOwned)).rejects.toThrow("another payout")
  await expect(collectEbayPayoutTransactions({ request }, "P1},orderId:{all", assertOwned)).rejects.toThrow(/./)
})
it("rejects unbounded windows before making a request", async () => {
  const request = vi.fn<(method: string, path: string) => Promise<unknown>>()
  await expect(
    collectEbayFinances({ request }, { ...window, from: "2020-01-01T00:00:00Z" }, async () => undefined)
  ).rejects.toThrow(/./)
  expect(request).not.toHaveBeenCalled()
})
