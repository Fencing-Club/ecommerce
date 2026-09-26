import { z } from "zod"
import type { Amazon } from "./amazon"
import type { Shopify } from "./shopify"

const quantity = z.number().int().nonnegative().safe()
const id = z.string().min(1)
const pageInfo = z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() })
const decimal = z.string().regex(/^-?\d+(\.\d+)?$/)
const shopMoney = z.object({ amount: decimal, currencyCode: z.string().length(3) })
export const salesWindowSchema = z
  .strictObject({ from: z.iso.datetime(), to: z.iso.datetime() })
  .refine(
    ({ from, to }) => Date.parse(to) > Date.parse(from) && Date.parse(to) - Date.parse(from) <= 730 * 86400000,
    "Choose an increasing sales window of at most 730 days"
  )
export type SalesWindow = z.infer<typeof salesWindowSchema>
const line = z.object({
  id,
  quantity,
  currentQuantity: quantity,
  sku: z.string().nullable(),
  variant: z.object({ id }).nullable(),
  // Set on each component line when the customer bought a bundle; variantId is the bundle's variant.
  lineItemGroup: z.object({ id, quantity, variantId: z.string().nullable() }).nullable().optional(),
  // The price of one unit before discounts, and the discounts (line and order discounts) given on the whole line, in
  // the store's currency. Optional because orders stored before prices were copied lack them.
  originalUnitPriceSet: z.object({ shopMoney }).optional(),
  discountAllocations: z
    .array(z.object({ allocatedAmountSet: z.object({ shopMoney }) }))
    .max(250)
    .optional()
})
const lines = z.object({ nodes: z.array(line).max(250), pageInfo })
const fulfillmentLine = z.object({ id, quantity: quantity.nullable(), lineItem: z.object({ id }) })
const fulfillmentLines = z.object({ nodes: z.array(fulfillmentLine).max(250), pageInfo })
const fulfillment = z.object({ id, status: z.string(), location: z.object({ id }).nullable() })
const feeMoney = z.object({ amount: decimal, currencyCode: z.string().length(3) })
// A payment on the order. Shopify Payments lists its processing fees (and the tax on them); other gateways list none.
const payment = z.object({
  id,
  kind: z.string(),
  status: z.string(),
  fees: z.array(z.object({ amount: feeMoney, taxAmount: feeMoney })).max(50)
})
const header = z.object({
  id,
  // The order number shown in Shopify, such as #1001.
  name: z.string(),
  createdAt: z.iso.datetime({ offset: true }),
  cancelledAt: z.string().nullable(),
  test: z.boolean(),
  sourceName: z.string().nullable()
})
const headers = "id name createdAt cancelledAt test sourceName"
const money = "shopMoney{amount currencyCode}"
const lineFields = `id quantity currentQuantity sku variant{id} lineItemGroup{id quantity variantId} originalUnitPriceSet{${money}} discountAllocations{allocatedAmountSet{${money}}}`
const linePage = `nodes{${lineFields}} pageInfo{hasNextPage endCursor}`
const fulfillmentPage = "nodes{id quantity lineItem{id}} pageInfo{hasNextPage endCursor}"
export const shopifySalesQueries = {
  orders: `query SalesOrders($query:String!,$after:String){shop{myshopifyDomain} orders(first:100,after:$after,query:$query,sortKey:CREATED_AT){nodes{${headers}} pageInfo{hasNextPage endCursor}}}`,
  order: `query SalesOrder($id:ID!,$after:String){order(id:$id){${headers} lineItems(first:250,after:$after){${linePage}} fulfillmentsCount{count precision} fulfillments(first:250){id status location{id}} transactions(first:100){id kind status fees{amount{amount currencyCode} taxAmount{amount currencyCode}}}}}`,
  fulfillment: `query SalesFulfillment($id:ID!,$after:String){fulfillment(id:$id){id fulfillmentLineItems(first:250,after:$after){${fulfillmentPage}}}}`
}

// One budget spans every nested connection. Incomplete collections are never returned as zero sales.
function collection(assertActive?: () => Promise<void>) {
  const deadline = Date.now() + 300000
  let requests = 0,
    bytes = 0
  return async (fetchPage: () => Promise<unknown>) => {
    await assertActive?.()
    if (++requests > 2000 || Date.now() >= deadline) {
      throw new Error("Sales collection limit reached; use a shorter window")
    }
    const response = await fetchPage()
    await assertActive?.()
    bytes += Buffer.byteLength(JSON.stringify(response) ?? "")
    if (bytes > 32 * 1024 * 1024 || Date.now() >= deadline) {
      throw new Error("Sales collection limit reached; no partial result published")
    }
    return response
  }
}
function nextCursor(info: z.infer<typeof pageInfo>, seen: Set<string>) {
  if (!info.hasNextPage) {
    return null
  }
  if (!info.endCursor || seen.has(info.endCursor)) {
    throw new Error("Sales pagination did not advance")
  }
  seen.add(info.endCursor)
  return info.endCursor
}
function unique(value: string, seen: Set<string>) {
  if (seen.has(value)) {
    throw new Error("Duplicate sales identity; restart the collection")
  }
  seen.add(value)
}
function within(created: string, window: SalesWindow) {
  return Date.parse(created) >= Date.parse(window.from) && Date.parse(created) < Date.parse(window.to)
}
export type ShopifySale = z.infer<typeof header> & {
  lines: z.infer<typeof line>[]
  fulfillments: (z.infer<typeof fulfillment> & { lines: z.infer<typeof fulfillmentLine>[] })[]
  // Optional because orders stored before payments were copied lack them.
  transactions?: z.infer<typeof payment>[]
}

// Shopify Payments' processing fees on an order, with the tax on them, in minor units: null when the order was copied
// without its payments, zero when it was paid another way.
export function shopifyPaymentFees(sale: Pick<ShopifySale, "transactions">) {
  if (!sale.transactions) {
    return null
  }
  let minor = 0,
    currency: string | null = null
  for (const payment of sale.transactions) {
    if (payment.status !== "SUCCESS") {
      continue
    }
    for (const fee of payment.fees) {
      currency ??= fee.amount.currencyCode
      minor += Math.round(Number(fee.amount.amount) * 100) + Math.round(Number(fee.taxAmount.amount) * 100)
    }
  }
  return { minor, currency }
}
export async function collectShopifySales(
  client: Pick<Shopify, "graphql">,
  domain: string,
  input: SalesWindow,
  assertActive?: () => Promise<void>
) {
  const window = salesWindowSchema.parse(input),
    read = collection(assertActive)
  const result: ShopifySale[] = [],
    orderIds = new Set<string>(),
    orderCursors = new Set<string>()
  let after: string | null = null
  do {
    const response = z
      .object({
        shop: z.object({ myshopifyDomain: z.literal(domain) }),
        orders: z.object({ nodes: z.array(header).max(100), pageInfo })
      })
      .parse(
        await read(() =>
          client.graphql(shopifySalesQueries.orders, {
            // Shopify's search syntax needs the timestamps quoted; unquoted, the colons end the value early.
            query: `created_at:>='${window.from}' created_at:<'${window.to}'`,
            after
          })
        )
      )
    for (const summary of response.orders.nodes) {
      unique(summary.id, orderIds)
      if (!within(summary.createdAt, window)) {
        throw new Error("Shopify returned an order outside the sales window")
      }
      if (orderIds.size > 10000) {
        throw new Error("Sales order limit reached")
      }
      if (summary.cancelledAt || summary.test) {
        continue
      }
      const sale: ShopifySale = { ...summary, lines: [], fulfillments: [] }
      const lineIds = new Set<string>(),
        cursors = new Set<string>()
      let lineAfter: string | null = null
      do {
        const detail = z
          .object({
            order: header.extend({
              lineItems: lines,
              fulfillmentsCount: z.object({ count: quantity, precision: z.literal("EXACT") }),
              fulfillments: z.array(fulfillment).max(250),
              transactions: z.array(payment).max(100)
            })
          })
          .parse(
            await read(() => client.graphql(shopifySalesQueries.order, { id: summary.id, after: lineAfter }))
          ).order
        if (
          JSON.stringify({
            id: detail.id,
            name: detail.name,
            createdAt: detail.createdAt,
            cancelledAt: detail.cancelledAt,
            test: detail.test,
            sourceName: detail.sourceName
          }) !== JSON.stringify(summary)
        ) {
          throw new Error("Shopify order changed during sales collection")
        }
        if (detail.fulfillmentsCount.count !== detail.fulfillments.length) {
          throw new Error("Shopify fulfillments are incomplete")
        }
        if (lineAfter === null) {
          sale.fulfillments = detail.fulfillments.map((f) => ({ ...f, lines: [] }))
          sale.transactions = detail.transactions
        }
        for (const item of detail.lineItems.nodes) {
          unique(item.id, lineIds)
          sale.lines.push(item)
        }
        lineAfter = nextCursor(detail.lineItems.pageInfo, cursors)
      } while (lineAfter !== null)
      const fulfillmentIds = new Set<string>()
      for (const f of sale.fulfillments) {
        unique(f.id, fulfillmentIds)
        if (f.status !== "SUCCESS") {
          continue
        }
        const ids = new Set<string>(),
          cursors = new Set<string>()
        let after: string | null = null
        do {
          const data = z
            .object({ fulfillment: z.object({ id: z.literal(f.id), fulfillmentLineItems: fulfillmentLines }) })
            .parse(await read(() => client.graphql(shopifySalesQueries.fulfillment, { id: f.id, after })))
            .fulfillment.fulfillmentLineItems
          for (const item of data.nodes) {
            unique(item.id, ids)
            f.lines.push(item)
          }
          after = nextCursor(data.pageInfo, cursors)
        } while (after !== null)
      }
      result.push(sale)
    }
    after = nextCursor(response.orders.pageInfo, orderCursors)
  } while (after !== null)
  return result
}

const amazonMoney = z.object({ amount: decimal, currencyCode: z.string().length(3) })
const amazonItem = z.object({
  orderItemId: id,
  quantityOrdered: quantity,
  product: z.object({ sellerSku: id.optional(), asin: id.optional() }),
  fulfillment: z
    .object({ quantityFulfilled: quantity.optional(), quantityUnfulfilled: quantity.optional() })
    .optional(),
  // What the seller receives for the item, by category (ITEM, SHIPPING, TAX, DISCOUNT and so on). Optional because
  // orders stored before proceeds were copied lack them, and Amazon leaves them out until the order is priced.
  proceeds: z
    .object({
      proceedsTotal: amazonMoney.optional(),
      breakdowns: z
        .array(z.object({ type: z.string(), subtotal: amazonMoney }))
        .max(50)
        .optional()
    })
    .optional()
})
const amazonSale = z.object({
  orderId: id,
  createdTime: z.iso.datetime({ offset: true }),
  salesChannel: z.object({ channelName: z.string(), marketplaceId: z.string().optional() }),
  fulfillment: z.object({ fulfillmentStatus: z.string(), fulfilledBy: z.string().optional() }).optional(),
  orderItems: z.array(amazonItem).max(1000)
})
export type AmazonSale = z.infer<typeof amazonSale>
export async function collectAmazonSales(
  client: Pick<Amazon, "request">,
  input: SalesWindow,
  assertActive?: () => Promise<void>
) {
  const window = salesWindowSchema.parse(input)
  const query = new URLSearchParams({ createdAfter: window.from, createdBefore: window.to })
  return searchAmazonSales(client, query, assertActive, (order) => {
    // Amazon's end boundary is inclusive; use a half-open window consistently with Shopify.
    if (Date.parse(order.createdTime) === Date.parse(window.to)) {
      return false
    }
    if (!within(order.createdTime, window)) {
      throw new Error("Amazon returned an order outside the sales window")
    }
    return true
  })
}
// Every order changed at or after the time, whenever it was placed: new orders, shipments, cancellations and refunds.
export async function collectUpdatedAmazonSales(
  client: Pick<Amazon, "request">,
  updatedAfter: string,
  assertActive?: () => Promise<void>
) {
  const query = new URLSearchParams({ lastUpdatedAfter: z.iso.datetime({ offset: true }).parse(updatedAfter) })
  return searchAmazonSales(client, query, assertActive, () => true)
}
async function searchAmazonSales(
  client: Pick<Amazon, "request">,
  query: URLSearchParams,
  assertActive: (() => Promise<void>) | undefined,
  keep: (order: AmazonSale) => boolean
) {
  const read = collection(assertActive)
  query.set("marketplaceIds", "ATVPDKIKX0DER")
  // Proceeds carry the prices the Overview needs.
  query.set("includedData", "FULFILLMENT,PROCEEDS")
  query.set("maxResultsPerPage", "100")
  const result: AmazonSale[] = [],
    ids = new Set<string>(),
    tokens = new Set<string>()
  for (;;) {
    const page = z
      .object({ orders: z.array(amazonSale).max(100), pagination: z.object({ nextToken: id.optional() }).optional() })
      .parse(await read(() => client.request("GET", `/orders/2026-01-01/orders?${query}`)))
    for (const order of page.orders) {
      unique(order.orderId, ids)
      if (ids.size > 10000) {
        throw new Error("Sales order limit reached")
      }
      if (order.salesChannel.marketplaceId !== "ATVPDKIKX0DER") {
        throw new Error("Amazon returned a different marketplace")
      }
      if (!keep(order)) {
        continue
      }
      const itemIds = new Set<string>()
      for (const item of order.orderItems) {
        unique(item.orderItemId, itemIds)
      }
      result.push(order)
    }
    const token = page.pagination?.nextToken
    if (!token) {
      break
    }
    unique(token, tokens)
    query.set("paginationToken", token)
  }
  return result
}

// Money in Amazon's finance reports: a decimal number or string.
const financeAmount = z.object({
  currencyCode: z.string().length(3),
  currencyAmount: z.union([z.number(), z.string()])
})
type Breakdown = { breakdownType: string; breakdownAmount?: z.infer<typeof financeAmount>; breakdowns?: Breakdown[] }
const breakdown: z.ZodType<Breakdown> = z.lazy(() =>
  z.object({
    breakdownType: z.string(),
    breakdownAmount: financeAmount.optional(),
    breakdowns: z.array(breakdown).max(200).optional()
  })
)
const transaction = z
  .object({
    transactionId: id,
    transactionType: z.string(),
    postedDate: z.iso.datetime({ offset: true }),
    totalAmount: financeAmount,
    relatedIdentifiers: z
      .array(z.object({ relatedIdentifierName: z.string(), relatedIdentifierValue: z.string() }))
      .max(50)
      .optional(),
    breakdowns: z.array(breakdown).max(200).optional()
  })
  .loose()

// An Amazon amount in minor units.
export function minorUnits(amount: number | string) {
  const value = Math.round(Number(amount) * 100)
  if (!Number.isSafeInteger(value)) {
    throw new Error("Amazon returned an invalid amount")
  }
  return value
}

// Amazon's fees in a transaction, positive when charged: every fee or commission in its breakdown tree (such as
// AmazonFees, FBAFees and Commission). A fee category is counted whole, not again through its parts.
export function transactionFees(breakdowns: readonly Breakdown[] | undefined): number {
  let total = 0
  for (const entry of breakdowns ?? []) {
    if (/fee|commission/i.test(entry.breakdownType) && entry.breakdownAmount) {
      total -= minorUnits(entry.breakdownAmount.currencyAmount)
    } else {
      total += transactionFees(entry.breakdowns)
    }
  }
  return total
}

export type AmazonTransaction = {
  transactionId: string
  orderId: string | null
  postedAt: string
  type: string
  currency: string
  totalMinor: number
  feesMinor: number
  data: Record<string, unknown>
}

// Posted Amazon transactions (order payments, refunds and their fees) in a window of at most 180 days. No marketplace
// is named, so merchant-fulfilled US orders are included too, as Amazon's reference advises.
export async function collectAmazonTransactions(
  client: Pick<Amazon, "request">,
  input: SalesWindow,
  assertActive?: () => Promise<void>
) {
  const window = salesWindowSchema.parse(input)
  if (Date.parse(window.to) - Date.parse(window.from) > 180 * 86400000) {
    throw new Error("Amazon transactions are read at most 180 days at a time")
  }
  const read = collection(assertActive)
  const query = new URLSearchParams({ postedAfter: window.from, postedBefore: window.to })
  const result: AmazonTransaction[] = [],
    ids = new Set<string>(),
    tokens = new Set<string>()
  for (;;) {
    const page = z
      .object({
        payload: z.object({
          transactions: z.array(transaction).max(1000).optional(),
          nextToken: z.string().nullable().optional()
        })
      })
      .parse(await read(() => client.request("GET", `/finances/2024-06-19/transactions?${query}`)))
    for (const entry of page.payload.transactions ?? []) {
      unique(entry.transactionId, ids)
      if (ids.size > 50000) {
        throw new Error("Amazon transaction limit reached")
      }
      result.push({
        transactionId: entry.transactionId,
        orderId:
          entry.relatedIdentifiers?.find((identifier) => identifier.relatedIdentifierName === "ORDER_ID")
            ?.relatedIdentifierValue ?? null,
        postedAt: new Date(entry.postedDate).toISOString(),
        type: entry.transactionType,
        currency: entry.totalAmount.currencyCode,
        totalMinor: minorUnits(entry.totalAmount.currencyAmount),
        feesMinor: transactionFees(entry.breakdowns),
        data: entry
      })
    }
    const token = page.payload.nextToken
    if (!token) {
      break
    }
    unique(token, tokens)
    query.set("nextToken", token)
  }
  return result
}
