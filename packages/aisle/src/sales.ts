import { z } from "zod"
import type { Amazon } from "./amazon"
import type { Ebay } from "./ebay"
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
  sourceName: z.string().nullable(),
  // Orders copied before tags were read don't have them.
  tags: z.array(z.string().max(255)).max(250).optional()
})
const headers = "id name createdAt cancelledAt test sourceName tags"
const money = "shopMoney{amount currencyCode}"
const lineFields = `id quantity currentQuantity sku variant{id} lineItemGroup{id quantity variantId} originalUnitPriceSet{${money}} discountAllocations{allocatedAmountSet{${money}}}`
const linePage = `nodes{${lineFields}} pageInfo{hasNextPage endCursor}`
const fulfillmentPage = "nodes{id quantity lineItem{id}} pageInfo{hasNextPage endCursor}"
export const shopifySalesQueries = {
  orders: `query SalesOrders($query:String!,$after:String){shop{myshopifyDomain} orders(first:100,after:$after,query:$query,sortKey:CREATED_AT){nodes{${headers}} pageInfo{hasNextPage endCursor}}}`,
  order: `query SalesOrder($id:ID!,$after:String){order(id:$id){${headers} lineItems(first:250,after:$after){${linePage}} fulfillmentsCount{count precision} fulfillments(first:250){id status location{id}} transactions(first:100){id kind status fees{amount{amount currencyCode} taxAmount{amount currencyCode}}}}}`,
  fulfillment: `query SalesFulfillment($id:ID!,$after:String){fulfillment(id:$id){id fulfillmentLineItems(first:250,after:$after){${fulfillmentPage}}}}`
}
// The order query with the order's customer, by ID only: never a name, email or address. Used only when the store
// granted read_customers, so repeat customers and lifetime value can be counted.
export const shopifyOrderWithCustomerQuery = shopifySalesQueries.order.replace(
  "{order(id:$id){",
  "{order(id:$id){customer{id} "
)
// Orders whose details are read at once. Shopify's rate limit (handled by the client) still paces them.
const detailConcurrency = 6

// Runs `work` on each item, at most `limit` at a time, keeping the items' order in the results.
async function mapLimit<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>) {
  const results = Array.from<R>({ length: items.length })
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await work(items[index]!)
    }
  })
  await Promise.all(runners)
  return results
}

// One budget spans every nested connection. Incomplete collections are never returned as zero sales.
function collection(assertActive?: () => Promise<void>, limits = { requests: 2000, ms: 300000 }) {
  const deadline = Date.now() + limits.ms
  let requests = 0,
    bytes = 0
  return async (fetchPage: () => Promise<unknown>) => {
    await assertActive?.()
    if (++requests > limits.requests || Date.now() >= deadline) {
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
  // The Shopify customer's ID, null for an order without one. Absent when customers weren't read.
  customerId?: string | null
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
  assertActive?: () => Promise<void>,
  // Also copy each order's customer ID (needs read_customers).
  options: { customers?: boolean } = {}
) {
  const window = salesWindowSchema.parse(input),
    read = collection(assertActive)
  const result: ShopifySale[] = [],
    orderIds = new Set<string>(),
    orderCursors = new Set<string>()
  const detailQuery = options.customers ? shopifyOrderWithCustomerQuery : shopifySalesQueries.order
  // One order's lines, fulfillments with their lines, payments and (when asked) customer.
  const orderDetails = async (summary: z.infer<typeof header>) => {
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
            transactions: z.array(payment).max(100),
            customer: z.object({ id }).nullable().optional()
          })
        })
        .parse(await read(() => client.graphql(detailQuery, { id: summary.id, after: lineAfter }))).order
      if (
        JSON.stringify({
          id: detail.id,
          name: detail.name,
          createdAt: detail.createdAt,
          cancelledAt: detail.cancelledAt,
          test: detail.test,
          sourceName: detail.sourceName,
          tags: detail.tags
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
        if (options.customers) {
          sale.customerId = detail.customer?.id ?? null
        }
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
    return sale
  }
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
    const wanted: typeof response.orders.nodes = []
    for (const summary of response.orders.nodes) {
      unique(summary.id, orderIds)
      if (!within(summary.createdAt, window)) {
        throw new Error("Shopify returned an order outside the sales window")
      }
      if (orderIds.size > 10000) {
        throw new Error("Sales order limit reached")
      }
      if (!summary.cancelledAt && !summary.test) {
        wanted.push(summary)
      }
    }
    result.push(...(await mapLimit(wanted, detailConcurrency, (summary) => orderDetails(summary))))
    after = nextCursor(response.orders.pageInfo, orderCursors)
  } while (after !== null)
  return result
}

// Shopify's bulk export of every order in a window (with lines, fulfillments, payments and, when asked, the customer's
// ID), for backfilling a year of orders in one export instead of several requests per order. Shopify builds a JSON
// Lines file, one object per line; a line item names its order in `__parentId`. The export can't include what each
// fulfillment shipped (a connection inside a list), so that's read afterwards, a few fulfillments at a time.
const bulkPollMs = 5000
const bulkDeadlineMs = 30 * 60000
function bulkOrdersQuery(window: SalesWindow, customers: boolean) {
  const search = `created_at:>='${window.from}' created_at:<'${window.to}'`
  return `{orders(query:${JSON.stringify(search)}){edges{node{${headers}${customers ? " customer{id}" : ""} lineItems{edges{node{${lineFields}}}} fulfillments{id status location{id}} transactions{id kind status fees{amount{amount currencyCode} taxAmount{amount currencyCode}}}}}}}`
}
export const shopifyBulkQueries = {
  run: `mutation SalesBulk($query:String!){bulkOperationRunQuery(query:$query){bulkOperation{id status} userErrors{field message}}}`,
  status: `query SalesBulkStatus($id:ID!){bulkOperation(id:$id){... on BulkOperation{id status errorCode url objectCount}}}`
}
export async function collectShopifySalesBulk(
  client: Pick<Shopify, "graphql">,
  input: SalesWindow,
  assertActive?: () => Promise<void>,
  options: { customers?: boolean; download?: typeof fetch; sleep?: (ms: number) => Promise<void> } = {}
): Promise<ShopifySale[]> {
  const window = salesWindowSchema.parse(input)
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))
  const started = z
    .object({
      bulkOperationRunQuery: z.object({
        bulkOperation: z.object({ id }).nullable(),
        userErrors: z.array(z.object({ message: z.string() })).max(20)
      })
    })
    .parse(
      await client.graphql(shopifyBulkQueries.run, { query: bulkOrdersQuery(window, Boolean(options.customers)) })
    ).bulkOperationRunQuery
  if (!started.bulkOperation || started.userErrors.length) {
    throw new Error(
      `Shopify didn't start the order export: ${started.userErrors.map((error) => error.message).join("; ")}`
    )
  }
  const deadline = Date.now() + bulkDeadlineMs
  let url: string | null = null
  for (;;) {
    await assertActive?.()
    const operation = z
      .object({
        bulkOperation: z.object({
          status: z.string(),
          errorCode: z.string().nullable().optional(),
          url: z.string().nullable().optional()
        })
      })
      .parse(await client.graphql(shopifyBulkQueries.status, { id: started.bulkOperation.id })).bulkOperation
    if (operation.status === "COMPLETED") {
      url = operation.url ?? null
      break
    }
    if (!["CREATED", "RUNNING"].includes(operation.status)) {
      throw new Error(
        `Shopify's order export ended ${operation.status.toLowerCase()} (${operation.errorCode ?? "no code"})`
      )
    }
    if (Date.now() + bulkPollMs > deadline) {
      throw new Error("Shopify's order export is taking too long")
    }
    await sleep(bulkPollMs)
  }
  // No file means no orders in the window.
  if (!url) {
    return []
  }
  const response = await (options.download ?? fetch)(url, { signal: AbortSignal.timeout(300000) })
  if (!response.ok) {
    throw new Error(`Shopify's order export download failed (${response.status})`)
  }
  const exported = header.extend({
    customer: z.object({ id }).nullable().optional(),
    fulfillments: z.array(fulfillment).max(250),
    transactions: z.array(payment).max(100)
  })
  const orders = new Map<string, ShopifySale>()
  const lineIds = new Set<string>()
  for (const row of (await response.text()).split("\n")) {
    if (!row.trim()) {
      continue
    }
    const value = JSON.parse(row) as Record<string, unknown>
    const parent = typeof value.__parentId === "string" ? value.__parentId : null
    if (!parent) {
      const order = exported.parse(value)
      if (orders.has(order.id)) {
        throw new Error("Duplicate sales identity; restart the collection")
      }
      if (!within(order.createdAt, window)) {
        throw new Error("Shopify returned an order outside the sales window")
      }
      const sale: ShopifySale = {
        id: order.id,
        name: order.name,
        createdAt: order.createdAt,
        cancelledAt: order.cancelledAt,
        test: order.test,
        sourceName: order.sourceName,
        tags: order.tags,
        lines: [],
        fulfillments: order.fulfillments.map((entry) => ({ ...entry, lines: [] })),
        transactions: order.transactions,
        ...(options.customers && { customerId: order.customer?.id ?? null })
      }
      orders.set(order.id, sale)
    } else if (orders.has(parent)) {
      const item = line.parse(value)
      unique(item.id, lineIds)
      orders.get(parent)!.lines.push(item)
    } else {
      throw new Error("Shopify's order export named a parent it didn't include")
    }
  }
  if (orders.size > 20000) {
    throw new Error("Sales order limit reached")
  }
  const kept = [...orders.values()].filter((sale) => !sale.cancelledAt && !sale.test)
  // A year's fulfillments: more requests and time than one period's reader allows.
  const read = collection(assertActive, { requests: 40000, ms: 60 * 60000 })
  const shipped = kept.flatMap((sale) => sale.fulfillments.filter((entry) => entry.status === "SUCCESS"))
  await mapLimit(shipped, detailConcurrency, async (entry) => {
    const ids = new Set<string>(),
      cursors = new Set<string>()
    let after: string | null = null
    do {
      const data = z
        .object({ fulfillment: z.object({ id: z.literal(entry.id), fulfillmentLineItems: fulfillmentLines }) })
        .parse(await read(() => client.graphql(shopifySalesQueries.fulfillment, { id: entry.id, after })))
        .fulfillment.fulfillmentLineItems
      for (const item of data.nodes) {
        unique(item.id, ids)
        entry.lines.push(item)
      }
      after = nextCursor(data.pageInfo, cursors)
    } while (after !== null)
  })
  return kept
}

const usMarketplace = "ATVPDKIKX0DER"
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
      // A DISCOUNT names what it was for (ITEM or SHIPPING, say) in its detailed breakdowns, so free shipping isn't
      // taken off product sales.
      breakdowns: z
        .array(
          z.object({
            type: z.string(),
            subtotal: amazonMoney,
            detailedBreakdowns: z
              .array(z.object({ subtype: z.string(), value: amazonMoney }))
              .max(20)
              .optional()
          })
        )
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
  // Orders this one is linked to: a replacement names the order it replaces (REPLACEMENT_ORIGINAL_ID).
  associatedOrders: z
    .array(z.object({ orderId: z.string(), associationType: z.string() }))
    .max(50)
    .optional(),
  orderItems: z.array(amazonItem).max(1000)
})
export type AmazonSale = z.infer<typeof amazonSale>
// Orders from the given marketplaces (the US alone by default).
export async function collectAmazonSales(
  client: Pick<Amazon, "request">,
  input: SalesWindow,
  assertActive?: () => Promise<void>,
  marketplaceIds: readonly string[] = [usMarketplace]
) {
  const window = salesWindowSchema.parse(input)
  const query = new URLSearchParams({ createdAfter: window.from, createdBefore: window.to })
  return searchAmazonSales(client, query, marketplaceIds, assertActive, (order) => {
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
  assertActive?: () => Promise<void>,
  marketplaceIds: readonly string[] = [usMarketplace]
) {
  const query = new URLSearchParams({ lastUpdatedAfter: z.iso.datetime({ offset: true }).parse(updatedAfter) })
  return searchAmazonSales(client, query, marketplaceIds, assertActive, () => true)
}
async function searchAmazonSales(
  client: Pick<Amazon, "request">,
  query: URLSearchParams,
  marketplaceIds: readonly string[],
  assertActive: (() => Promise<void>) | undefined,
  keep: (order: AmazonSale) => boolean
) {
  const read = collection(assertActive)
  if (!marketplaceIds.length) {
    throw new Error("Choose at least one Amazon marketplace")
  }
  query.set("marketplaceIds", marketplaceIds.join(","))
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
      if (!marketplaceIds.includes(order.salesChannel.marketplaceId ?? "")) {
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

// eBay orders as the Fulfillment API lists them, without the buyer: no username, address or tax details are copied.
const ebayMoney = z.object({ value: decimal, currency: z.string().length(3) })
const ebayLine = z.object({
  lineItemId: id,
  legacyItemId: z.string().optional(),
  legacyVariationId: z.string().optional(),
  // The seller's custom label, which is the SKU when the listing has one.
  sku: z.string().optional(),
  title: z.string().max(500).optional(),
  quantity,
  // The price of the whole line before discounts, and the seller's promotions taken off it.
  lineItemCost: ebayMoney,
  appliedPromotions: z
    .array(z.object({ discountAmount: ebayMoney.optional() }))
    .max(50)
    .optional(),
  lineItemFulfillmentStatus: z.string().optional(),
  refunds: z
    .array(z.object({ amount: ebayMoney.optional() }))
    .max(50)
    .optional()
})
const ebaySale = z.object({
  orderId: id,
  creationDate: z.iso.datetime({ offset: true }),
  lastModifiedDate: z.iso.datetime({ offset: true }).optional(),
  orderFulfillmentStatus: z.string(),
  orderPaymentStatus: z.string().optional(),
  cancelStatus: z.object({ cancelState: z.string(), cancelledDate: z.string().optional() }).optional(),
  // The seller's sales record number, shown in Seller Hub.
  salesRecordReference: z.string().optional(),
  // eBay's fees on the order.
  totalMarketplaceFee: ebayMoney.optional(),
  // Every refund on the order, including those eBay also lists on its lines. Optional because orders stored before
  // refunds were copied lack them.
  paymentSummary: z
    .object({
      refunds: z
        .array(z.object({ amount: ebayMoney.optional(), refundStatus: z.string().optional() }))
        .max(50)
        .optional()
    })
    .optional(),
  lineItems: z.array(ebayLine).max(1000)
})
export type EbaySale = z.infer<typeof ebaySale>
// Orders placed in the window. Cancelled orders are left out, as Shopify's are.
export async function collectEbaySales(
  client: Pick<Ebay, "request">,
  input: SalesWindow,
  assertActive?: () => Promise<void>
) {
  const window = salesWindowSchema.parse(input)
  const read = collection(assertActive)
  const result: EbaySale[] = [],
    ids = new Set<string>()
  const limit = 200
  for (let offset = 0; ; offset += limit) {
    const query = new URLSearchParams({
      filter: `creationdate:[${window.from}..${window.to}]`,
      limit: String(limit),
      offset: String(offset)
    })
    const page = z
      .object({ orders: z.array(ebaySale).max(limit).optional(), total: quantity })
      .parse(await read(() => client.request("GET", `/sell/fulfillment/v1/order?${query}`)))
    const orders = page.orders ?? []
    for (const order of orders) {
      unique(order.orderId, ids)
      if (ids.size > 10000) {
        throw new Error("Sales order limit reached")
      }
      // eBay's end boundary is inclusive; the window is half-open, as it is for the other sources.
      if (Date.parse(order.creationDate) === Date.parse(window.to)) {
        continue
      }
      if (!within(order.creationDate, window)) {
        throw new Error("eBay returned an order outside the sales window")
      }
      const lineIds = new Set<string>()
      for (const line of order.lineItems) {
        unique(line.lineItemId, lineIds)
      }
      if (order.cancelStatus?.cancelState !== "CANCELED") {
        result.push(order)
      }
    }
    if (orders.length < limit || offset + orders.length >= page.total) {
      break
    }
  }
  return result
}

// Amazon's order report (every order line placed in a period), read into the same shape as the order search, for
// backfilling history faster than the order search allows: one report per period instead of a request every few
// minutes. Only what the order search gives is kept; the report's shipping city, state and postcode are dropped.
// Orders from other channels (multi-channel fulfillment) and marketplaces not asked for are left out.
const marketplaceNames: Record<string, string> = {
  "Amazon.com": "ATVPDKIKX0DER",
  "Amazon.ca": "A2EUQ1WTGCTBG2",
  "Amazon.com.mx": "A1AM78C64UM0Y8",
  "Amazon.com.br": "A2Q3Y263D00KWC"
}
const reportStatuses: Record<string, string> = {
  Pending: "PENDING",
  Unshipped: "UNSHIPPED",
  "Partially Shipped": "PARTIALLY_SHIPPED",
  Shipping: "PARTIALLY_SHIPPED",
  Shipped: "SHIPPED",
  Cancelled: "CANCELLED"
}
export async function collectAmazonSalesReport(
  client: Pick<Amazon, "report">,
  input: SalesWindow,
  marketplaceIds: readonly string[],
  assertActive?: () => Promise<void>
): Promise<AmazonSale[] | null> {
  const window = salesWindowSchema.parse(input)
  const text = await client.report(
    {
      reportType: "GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL",
      marketplaceIds: [...marketplaceIds],
      dataStartTime: window.from,
      dataEndTime: window.to
    },
    { deadline: Date.now() + 15 * 60000, pollMs: 10000, assertActive }
  )
  if (text === null) {
    return null
  }
  const [head, ...body] = text.split(/\r?\n/).filter((row) => row.length > 0)
  const columns = (head ?? "").split("\t")
  const column = (name: string) => {
    const index = columns.indexOf(name)
    if (index < 0) {
      throw new Error(`Amazon's order report has no ${name} column`)
    }
    return index
  }
  const at = {
    order: column("amazon-order-id"),
    purchased: column("purchase-date"),
    status: column("order-status"),
    channel: column("fulfillment-channel"),
    marketplace: column("sales-channel"),
    item: column("order-item-id"),
    sku: column("sku"),
    asin: column("asin"),
    itemStatus: column("item-status"),
    quantity: column("quantity"),
    currency: column("currency"),
    price: column("item-price"),
    tax: column("item-tax"),
    shipping: column("shipping-price"),
    discount: column("item-promotion-discount"),
    shippingDiscount: column("ship-promotion-discount")
  }
  const orders = new Map<string, AmazonSale>()
  for (const row of body) {
    const cells = row.split("\t")
    const cell = (index: number) => cells[index]?.trim() ?? ""
    const marketplaceId = marketplaceNames[cell(at.marketplace)]
    const purchased = cell(at.purchased)
    // A half-open window, like the order search.
    if (!marketplaceId || !marketplaceIds.includes(marketplaceId) || !within(purchased, window)) {
      continue
    }
    const orderId = cell(at.order)
    const status = reportStatuses[cell(at.status)] ?? cell(at.status).toUpperCase()
    const sale = orders.get(orderId) ?? {
      orderId,
      createdTime: new Date(purchased).toISOString(),
      salesChannel: { channelName: "AMAZON", marketplaceId },
      fulfillment: {
        fulfillmentStatus: status,
        fulfilledBy: cell(at.channel) === "Amazon" ? "AMAZON" : "MERCHANT"
      },
      orderItems: []
    }
    const quantityOrdered = quantity.parse(Number(cell(at.quantity) || 0))
    const currencyCode = cell(at.currency)
    const money = (value: string) => ({ amount: String(Math.abs(Number(value))), currencyCode })
    // The item's and the shipping's promotions, as the order search reports them: one DISCOUNT, split by subtype.
    const discounts = [
      { subtype: "ITEM", value: cell(at.discount) },
      { subtype: "SHIPPING", value: cell(at.shippingDiscount) }
    ].filter((part) => part.value !== "" && Number(part.value) !== 0)
    // Amazon prices a line once the order is paid; until then it has no price, as in the order search.
    const priced = cell(at.price) !== "" && currencyCode.length === 3
    const breakdowns = priced
      ? [
          { type: "ITEM", subtotal: money(cell(at.price)) },
          ...(discounts.length
            ? [
                {
                  type: "DISCOUNT",
                  subtotal: money(String(discounts.reduce((sum, part) => sum + Math.abs(Number(part.value)), 0))),
                  detailedBreakdowns: discounts.map((part) => ({ subtype: part.subtype, value: money(part.value) }))
                }
              ]
            : []),
          ...(cell(at.shipping) ? [{ type: "SHIPPING", subtotal: money(cell(at.shipping)) }] : []),
          ...(cell(at.tax) ? [{ type: "TAX", subtotal: money(cell(at.tax)) }] : [])
        ]
      : null
    const shipped = cell(at.itemStatus) === "Shipped"
    sale.orderItems.push({
      orderItemId: cell(at.item) || `${orderId}:${sale.orderItems.length + 1}`,
      quantityOrdered,
      product: { sellerSku: cell(at.sku) || undefined, asin: cell(at.asin) || undefined },
      fulfillment: {
        quantityFulfilled: shipped ? quantityOrdered : 0,
        quantityUnfulfilled: shipped ? 0 : quantityOrdered
      },
      ...(breakdowns && { proceeds: { breakdowns } })
    })
    orders.set(orderId, sale)
  }
  if (orders.size > 10000) {
    throw new Error("Sales order limit reached")
  }
  return [...orders.values()]
}

// Money in Amazon's finance reports: a decimal number or string.
const financeAmount = z.object({
  currencyCode: z.string().length(3),
  currencyAmount: z.union([z.number(), z.string()])
})
// Amazon sends null, not an empty list, for a breakdown with no parts.
type Breakdown = {
  breakdownType: string
  breakdownAmount?: z.infer<typeof financeAmount> | null
  breakdowns?: Breakdown[] | null
}
const breakdown: z.ZodType<Breakdown> = z.lazy(() =>
  z.object({
    breakdownType: z.string(),
    breakdownAmount: financeAmount.nullable().optional(),
    breakdowns: z.array(breakdown).max(200).nullable().optional()
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
      .nullable()
      .optional(),
    breakdowns: z.array(breakdown).max(200).nullable().optional()
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
export function transactionFees(breakdowns: readonly Breakdown[] | null | undefined): number {
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
      const related = (name: string) =>
        entry.relatedIdentifiers?.find((identifier) => identifier.relatedIdentifierName === name)
          ?.relatedIdentifierValue ?? null
      result.push({
        transactionId: entry.transactionId,
        orderId: related("ORDER_ID"),
        postedAt: new Date(entry.postedDate).toISOString(),
        type: entry.transactionType,
        currency: entry.totalAmount.currencyCode,
        totalMinor: minorUnits(entry.totalAmount.currencyAmount),
        // Amazon lists a deferred payment again when it releases it, with the same fees; the release names the deferred
        // transaction, which already counts them.
        feesMinor: related("DEFERRED_TRANSACTION_ID") ? 0 : transactionFees(entry.breakdowns),
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

// Shopify Payments balance transactions: what Shopify added to or took from the payout balance, such as shipping
// labels, the Shopify bill paid from payouts, and dispute fees. Payouts themselves are left out.
const balanceMoney = z.object({ amount: decimal, currencyCode: z.string().length(3) })
const balanceTransaction = z
  .object({
    id,
    type: z.string(),
    test: z.boolean(),
    transactionDate: z.iso.datetime({ offset: true }),
    amount: balanceMoney,
    fee: balanceMoney,
    net: balanceMoney,
    associatedOrder: z.object({ id }).nullable().optional(),
    adjustmentReason: z.string().nullable().optional()
  })
  .loose()
export const shopifyBalanceQuery = `query Balance($query:String!,$after:String){shopifyPaymentsAccount{balanceTransactions(first:100,after:$after,query:$query,hideTransfers:true){nodes{id type test transactionDate amount{amount currencyCode} fee{amount currencyCode} net{amount currencyCode} associatedOrder{id} adjustmentReason} pageInfo{hasNextPage endCursor}}}}`

export type ShopifyBalanceTransaction = {
  transactionId: string
  type: string
  processedAt: string
  orderId: string | null
  currency: string
  amountMinor: number
  feeMinor: number
  netMinor: number
  data: Record<string, unknown>
}

// Balance transactions processed in a window. A store without Shopify Payments has none.
export async function collectShopifyBalanceTransactions(
  client: Pick<Shopify, "graphql">,
  input: SalesWindow,
  assertActive?: () => Promise<void>
) {
  const window = salesWindowSchema.parse(input)
  const read = collection(assertActive)
  const result: ShopifyBalanceTransaction[] = [],
    ids = new Set<string>(),
    cursors = new Set<string>()
  let after: string | null = null
  do {
    const account = z
      .object({
        shopifyPaymentsAccount: z
          .object({ balanceTransactions: z.object({ nodes: z.array(balanceTransaction).max(100), pageInfo }) })
          .nullable()
      })
      .parse(
        await read(() =>
          client.graphql(shopifyBalanceQuery, {
            query: `processed_at:>='${window.from}' processed_at:<'${window.to}'`,
            after
          })
        )
      ).shopifyPaymentsAccount
    if (!account) {
      return result
    }
    for (const entry of account.balanceTransactions.nodes) {
      unique(entry.id, ids)
      if (entry.test) {
        continue
      }
      result.push({
        transactionId: entry.id,
        type: entry.type,
        processedAt: new Date(entry.transactionDate).toISOString(),
        orderId: entry.associatedOrder?.id ?? null,
        currency: entry.net.currencyCode,
        amountMinor: minorUnits(entry.amount.amount),
        feeMinor: minorUnits(entry.fee.amount),
        netMinor: minorUnits(entry.net.amount),
        data: entry
      })
    }
    after = nextCursor(account.balanceTransactions.pageInfo, cursors)
  } while (after !== null)
  return result
}
