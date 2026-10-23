import { z } from "zod"
import type { Ebay } from "./ebay"

export const ebayFinanceScope = "https://api.ebay.com/oauth/api_scope/sell.finances"
const money = z.object({ value: z.string().regex(/^\d+(?:\.\d+)?$/), currency: z.string().regex(/^[A-Z]{3}$/) })
const fee = z.object({
  amount: money.optional(),
  feeType: z.string().optional(),
  feeJurisdiction: z.string().optional()
})
// Explicit allowlists exclude buyers, bank details and free-text memos.
export const ebayFinancialTransaction = z.object({
  transactionId: z.string().min(1),
  transactionDate: z.iso.datetime({ offset: true }),
  transactionType: z.string().min(1),
  transactionStatus: z.string().optional(),
  bookingEntry: z.enum(["CREDIT", "DEBIT"]),
  amount: money,
  orderId: z.string().optional(),
  payoutId: z.string().optional(),
  feeType: z.string().optional(),
  totalFeeAmount: money.optional(),
  totalFeeBasisAmount: money.optional(),
  eBayCollectedTaxAmount: money.optional(),
  orderLineItems: z
    .array(
      z.object({
        lineItemId: z.string().optional(),
        feeBasisAmount: money.optional(),
        marketplaceFees: z.array(fee).optional()
      })
    )
    .optional(),
  references: z.array(z.object({ referenceId: z.string(), referenceType: z.string() })).optional(),
  payoutDetails: z
    .object({ payoutIds: z.array(z.string()).optional(), payoutReference: z.string().optional() })
    .optional()
})
export const ebayPayout = z.object({
  payoutId: z.string().min(1),
  payoutDate: z.iso.datetime({ offset: true }),
  payoutStatus: z.string(),
  amount: money,
  totalAmount: money.optional(),
  totalFee: money.optional(),
  transactionCount: z.number().int().nonnegative().optional(),
  payoutReference: z.string().optional()
})
export type EbayFinancialTransaction = z.infer<typeof ebayFinancialTransaction>
export type EbayPayout = z.infer<typeof ebayPayout>
export const ebayTransactionKey = (row: EbayFinancialTransaction) =>
  JSON.stringify([row.transactionType, row.transactionId])
const windowSchema = z
  .object({ from: z.iso.datetime({ offset: true }), to: z.iso.datetime({ offset: true }) })
  .refine(
    ({ from, to }) => Date.parse(from) < Date.parse(to) && Date.parse(to) - Date.parse(from) <= 31 * 86400000,
    "eBay financial reads require a window of at most 31 days"
  )

async function collect<T>(
  client: Pick<Ebay, "request">,
  kind: "transaction" | "payout",
  filter: string,
  schema: z.ZodType<T>,
  id: (row: T) => string,
  assertOwned: () => Promise<void>
) {
  const rows: T[] = [],
    seen = new Set<string>()
  let total: number | undefined
  for (let offset = 0; offset < 5000; offset += 200) {
    await assertOwned()
    const url = new URL(`https://apiz.ebay.com/sell/finances/v1/${kind}`)
    url.search = new URLSearchParams({ filter, limit: "200", offset: String(offset), sort: `${kind}Date` }).toString()
    const page = z
      .object({
        total: z.number().int().nonnegative().optional(),
        transactions: z.array(schema).max(200).optional(),
        payouts: z.array(schema).max(200).optional()
      })
      .parse(await client.request("GET", url.href))
    const items = (kind === "transaction" ? page.transactions : page.payouts) ?? []
    // eBay documents an empty payout response when there are no matching payouts.
    if (kind === "payout" && offset === 0 && page.total === undefined && !items.length) {
      return rows
    }
    if (page.total === undefined) {
      throw new Error("eBay financial pagination has no total")
    }
    if (total !== undefined && total !== page.total) {
      throw new Error("eBay financial pagination changed")
    }
    total = page.total
    for (const row of items) {
      if (seen.has(id(row))) {
        throw new Error("eBay financial pagination repeated a record")
      }
      seen.add(id(row))
      rows.push(row)
    }
    if (rows.length === total) {
      return rows
    }
    if (rows.length > total || items.length < 200) {
      throw new Error("eBay financial pagination is incomplete")
    }
  }
  throw new Error("eBay financial pagination exceeded its bound")
}

export async function collectEbayFinances(
  client: Pick<Ebay, "request">,
  window: { from: string; to: string },
  assertOwned: () => Promise<void>
) {
  const { from, to } = windowSchema.parse(window)
  const transactions = await collect(
    client,
    "transaction",
    `transactionDate:[${from}..${to}]`,
    ebayFinancialTransaction,
    ebayTransactionKey,
    assertOwned
  )
  const payouts = await collect(
    client,
    "payout",
    `payoutDate:[${from}..${to}]`,
    ebayPayout,
    (row) => row.payoutId,
    assertOwned
  )
  for (const date of [...transactions.map((row) => row.transactionDate), ...payouts.map((row) => row.payoutDate)]) {
    if (Date.parse(date) < Date.parse(from) || Date.parse(date) > Date.parse(to)) {
      throw new Error("eBay financial record outside requested window")
    }
  }
  return { transactions, payouts }
}

export async function collectEbayPayoutTransactions(
  client: Pick<Ebay, "request">,
  payoutId: string,
  assertOwned: () => Promise<void>
) {
  // Do not interpolate provider IDs into eBay's filter grammar unless they are safe literals.
  z.string()
    .regex(/^[\w-]+$/)
    .max(200)
    .parse(payoutId)
  const rows = await collect(
    client,
    "transaction",
    `payoutId:{${payoutId}}`,
    ebayFinancialTransaction,
    ebayTransactionKey,
    assertOwned
  )
  if (rows.some((row) => row.payoutId !== payoutId)) {
    throw new Error("eBay payout transaction belongs to another payout")
  }
  return rows
}

export async function readEbayPayout(
  client: Pick<Ebay, "request">,
  payoutId: string,
  assertOwned: () => Promise<void>
) {
  await assertOwned()
  const row = ebayPayout.parse(
    await client.request("GET", `https://apiz.ebay.com/sell/finances/v1/payout/${encodeURIComponent(payoutId)}`)
  )
  if (row.payoutId !== payoutId) {
    throw new Error("eBay returned another payout")
  }
  return row
}
