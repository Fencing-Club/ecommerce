import { z } from "zod"
import type { Amazon } from "./amazon"
import type { Shopify } from "./shopify"

const quantity = z.number().int().nonnegative().safe()
const id = z.string().min(1)
const pageInfo = z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() })
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
  lineItemGroup: z.object({ id, quantity, variantId: z.string().nullable() }).nullable().optional()
})
const lines = z.object({ nodes: z.array(line).max(250), pageInfo })
const fulfillmentLine = z.object({ id, quantity: quantity.nullable(), lineItem: z.object({ id }) })
const fulfillmentLines = z.object({ nodes: z.array(fulfillmentLine).max(250), pageInfo })
const fulfillment = z.object({ id, status: z.string(), location: z.object({ id }).nullable() })
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
const lineFields = "id quantity currentQuantity sku variant{id} lineItemGroup{id quantity variantId}"
const linePage = `nodes{${lineFields}} pageInfo{hasNextPage endCursor}`
const fulfillmentPage = "nodes{id quantity lineItem{id}} pageInfo{hasNextPage endCursor}"
export const shopifySalesQueries = {
  orders: `query SalesOrders($query:String!,$after:String){shop{myshopifyDomain} orders(first:100,after:$after,query:$query,sortKey:CREATED_AT){nodes{${headers}} pageInfo{hasNextPage endCursor}}}`,
  order: `query SalesOrder($id:ID!,$after:String){order(id:$id){${headers} lineItems(first:250,after:$after){${linePage}} fulfillmentsCount{count precision} fulfillments(first:250){id status location{id}}}}`,
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
              fulfillments: z.array(fulfillment).max(250)
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

const amazonItem = z.object({
  orderItemId: id,
  quantityOrdered: quantity,
  product: z.object({ sellerSku: id.optional(), asin: id.optional() }),
  fulfillment: z.object({ quantityFulfilled: quantity.optional(), quantityUnfulfilled: quantity.optional() }).optional()
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
  const window = salesWindowSchema.parse(input),
    read = collection(assertActive)
  const query = new URLSearchParams({
    createdAfter: window.from,
    createdBefore: window.to,
    marketplaceIds: "ATVPDKIKX0DER",
    includedData: "FULFILLMENT",
    maxResultsPerPage: "100"
  })
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
      // Amazon's end boundary is inclusive; use a half-open window consistently with Shopify.
      if (Date.parse(order.createdTime) === Date.parse(window.to)) {
        continue
      }
      if (!within(order.createdTime, window)) {
        throw new Error("Amazon returned an order outside the sales window")
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
