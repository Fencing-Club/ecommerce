import { z } from "zod"
import type { Shopify } from "./shopify"
const money = "shopMoney{amount currencyCode} presentmentMoney{amount currencyCode}"
const page = "pageInfo{hasNextPage endCursor}"
const transaction = `id kind status gateway createdAt processedAt parentTransaction{id} amountSet{${money}} fees{amount{amount currencyCode} taxAmount{amount currencyCode}}`
export const economicsQueries = {
  earliest: `query EarliestEconomicsOrder { shop { myshopifyDomain } orders(first:1,sortKey:UPDATED_AT) { nodes { updatedAt } } }`,
  orders: `query EconomicsOrders($query:String!,$after:String){shop{myshopifyDomain} orders(first:50,after:$after,query:$query,sortKey:UPDATED_AT){nodes{id updatedAt} ${page}}}`,
  order: `query EconomicsOrder($id:ID!){order(id:$id){id createdAt updatedAt cancelledAt test sourceName tags currentTotalPriceSet{${money}} currentTotalTaxSet{${money}} currentTotalDutiesSet{${money}} totalShippingPriceSet{${money}} totalDiscountsSet{${money}} transactions(first:100){${transaction}} refunds{id createdAt updatedAt processedAt totalRefundedSet{${money}}} }}`,
  refundLines: `query EconomicsRefundLines($id:ID!,$after:String){refund(id:$id){id refundLineItems(first:100,after:$after){nodes{id quantity restockType lineItem{id sku variant{id}} location{id} subtotalSet{${money}} totalTaxSet{${money}}} ${page}}}}`,
  refundShipping: `query EconomicsRefundShipping($id:ID!,$after:String){refund(id:$id){id refundShippingLines(first:100,after:$after){nodes{id shippingLine{id} subtotalAmountSet{${money}} taxAmountSet{${money}}} ${page}}}}`,
  refundAdjustments: `query EconomicsRefundAdjustments($id:ID!,$after:String){refund(id:$id){id orderAdjustments(first:100,after:$after){nodes{id reason amountSet{${money}} taxAmountSet{${money}}} ${page}}}}`,
  refundPayments: `query EconomicsRefundPayments($id:ID!,$after:String){refund(id:$id){id transactions(first:100,after:$after){nodes{${transaction}} ${page}}}}`,
  returns: `query EconomicsReturns($id:ID!,$after:String){order(id:$id){id returns(first:50,after:$after){nodes{id status} ${page}}}}`,
  returnLines: `query EconomicsReturnLines($id:ID!,$after:String){return(id:$id){id returnLineItems(first:100,after:$after){nodes{id quantity returnReason ... on ReturnLineItem{fulfillmentLineItem{id lineItem{id sku variant{id}}}}} ${page}}}}`,
  exchanges: `query EconomicsExchanges($id:ID!,$after:String){return(id:$id){id exchangeLineItems(first:100,after:$after){nodes{id quantity variantId} ${page}}}}`,
  reverseOrders: `query EconomicsReverseOrders($id:ID!,$after:String){return(id:$id){id reverseFulfillmentOrders(first:50,after:$after){nodes{id status} ${page}}}}`,
  reverseLines: `query EconomicsReverseLines($id:ID!,$after:String){reverseFulfillmentOrder(id:$id){id lineItems(first:100,after:$after){nodes{id totalQuantity fulfillmentLineItem{id} dispositions{type quantity location{id}}} ${page}}}}`
}
const node = z.record(z.string(), z.unknown()).and(z.object({ id: z.string().min(1) }))
const info = z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() })
// Only queried financial identifiers and amounts are retained, never addresses or customer comments.
export async function collectShopifyEconomics(
  client: Pick<Shopify, "graphql">,
  orderId: string,
  returns: boolean,
  assertActive: () => Promise<void>
) {
  let requests = 0,
    bytes = 0
  const deadline = Date.now() + 300000
  const read = async (query: string, variables: Record<string, unknown>) => {
    await assertActive()
    if (++requests > 1000 || Date.now() > deadline) {
      throw new Error("Shopify economics collection limit")
    }
    const data: unknown = await client.graphql(query, variables)
    bytes += Buffer.byteLength(JSON.stringify(data))
    if (bytes > 16 * 1024 * 1024) {
      throw new Error("Shopify economics size limit")
    }
    return z.record(z.string(), z.unknown()).parse(data)
  }
  const connection = async (query: string, root: string, field: string, id: string) => {
    const rows: z.infer<typeof node>[] = [],
      seen = new Set<string>(),
      cursors = new Set<string>()
    let after: string | null = null
    do {
      const container = node.parse((await read(query, { id, after }))[root])
      if (container.id !== id) {
        throw new Error("Shopify economics identity changed")
      }
      const result = z.object({ nodes: z.array(node), pageInfo: info }).parse(container[field])
      for (const row of result.nodes) {
        if (seen.has(row.id)) {
          throw new Error("Duplicate Shopify economics identity")
        }
        seen.add(row.id)
        rows.push(row)
      }
      after = result.pageInfo.hasNextPage ? result.pageInfo.endCursor : null
      if (result.pageInfo.hasNextPage && (!after || cursors.has(after))) {
        throw new Error("Shopify economics pagination stalled")
      }
      if (after) {
        cursors.add(after)
      }
    } while (after)
    return rows
  }
  const order = node
    .and(
      z.object({
        updatedAt: z.iso.datetime({ offset: true }),
        transactions: z.array(node).max(99),
        refunds: z.array(node).max(249),
        tags: z.array(z.string()),
        test: z.boolean()
      })
    )
    .parse((await read(economicsQueries.order, { id: orderId })).order)
  if (order.id !== orderId) {
    throw new Error("Shopify order identity changed")
  }
  for (const refund of order.refunds) {
    refund.lines = await connection(economicsQueries.refundLines, "refund", "refundLineItems", refund.id)
    refund.shipping = await connection(economicsQueries.refundShipping, "refund", "refundShippingLines", refund.id)
    refund.adjustments = await connection(economicsQueries.refundAdjustments, "refund", "orderAdjustments", refund.id)
    refund.payments = await connection(economicsQueries.refundPayments, "refund", "transactions", refund.id)
  }
  const returnRows = returns ? await connection(economicsQueries.returns, "order", "returns", orderId) : null
  for (const row of returnRows ?? []) {
    row.lines = await connection(economicsQueries.returnLines, "return", "returnLineItems", row.id)
    row.exchanges = await connection(economicsQueries.exchanges, "return", "exchangeLineItems", row.id)
    const reverse = await connection(economicsQueries.reverseOrders, "return", "reverseFulfillmentOrders", row.id)
    for (const r of reverse) {
      r.lines = await connection(economicsQueries.reverseLines, "reverseFulfillmentOrder", "lineItems", r.id)
    }
    row.reverseFulfillmentOrders = reverse
  }
  const final = node.parse((await read(economicsQueries.order, { id: orderId })).order)
  if (final.updatedAt !== order.updatedAt) {
    throw new Error("Shopify economics changed during collection")
  }
  return { ...order, returns: returnRows, returnsCoverage: returns ? "imported" : "missing_scope" }
}
