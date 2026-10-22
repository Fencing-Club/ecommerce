import { grantedScopes, recentOrderDays } from "@repo/copacker-marketplaces/shopify-auth"
import { collectShopifyEconomics, economicsQueries } from "@repo/copacker-marketplaces/shopify-economics"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { analyticsFeeds } from "@/db/schema"
import { publishAnalyticsFeed } from "./analytics-feed-store"
import { shopifyFor } from "./connections"
const dataset = "order_economics"
export async function syncShopifyEconomics(
  input: { orgId: string; externalAccountId: string; revision: number; scopes: string },
  assertOwned: () => Promise<void>,
  now = new Date()
) {
  const { orgId, externalAccountId, revision, scopes } = input
  const scope = and(
    eq(analyticsFeeds.orgId, orgId),
    eq(analyticsFeeds.source, "shopify"),
    eq(analyticsFeeds.externalAccountId, externalAccountId),
    eq(analyticsFeeds.dataset, dataset)
  )
  const [prior] = await db().select().from(analyticsFeeds).where(scope)
  const granted = grantedScopes(scopes)
  const canReturn = granted.has("read_returns") || granted.has("write_returns")
  const allOrders = granted.has("read_all_orders")
  const end = new Date(now.getTime() - 180000).toISOString()
  const previous = prior?.state.scopes === scopes && prior.state.history === "available" ? prior.state : undefined
  let state: typeof analyticsFeeds.$inferInsert.state = previous?.to
    ? { ...previous }
    : {
        from: previous?.coveredTo
          ? new Date(Date.parse(previous.coveredTo) - 86400000).toISOString()
          : new Date(now.getTime() - recentOrderDays * 86400000).toISOString(),
        to: end,
        after: null,
        coveredFrom: previous?.coveredFrom,
        coveredTo: previous?.coveredTo,
        scopes,
        history: "available"
      }
  const publish = (rows: { id: string; data: Record<string, unknown> }[]) =>
    publishAnalyticsFeed(
      { orgId, source: "shopify", externalAccountId, revision },
      dataset,
      rows,
      state,
      assertOwned,
      now
    )
  let initialState = { ...state }
  try {
    const client = await shopifyFor(orgId, externalAccountId)
    if (!previous && allOrders) {
      await assertOwned()
      const first = z
        .object({
          shop: z.object({ myshopifyDomain: z.literal(externalAccountId) }),
          orders: z.object({ nodes: z.array(z.object({ updatedAt: z.iso.datetime({ offset: true }) })).max(1) })
        })
        .parse(await client.graphql(economicsQueries.earliest))
      state.from = new Date(
        Math.min(Date.parse(first.orders.nodes[0]?.updatedAt ?? end), Date.parse(end))
      ).toISOString()
    }
    // Bounded windows avoid one enormous search spanning years. Completing a window
    // immediately schedules the next one; the overlap catches edits near its boundary.
    if (!previous?.to && allOrders) {
      state.to = new Date(Math.min(Date.parse(end), Date.parse(state.from!) + 31 * 86400000)).toISOString()
    }
    initialState = { ...state }
    const seen = new Set<string>()
    // One page per sync is checkpointed; a later run continues the same bounded window.
    const result = z
      .object({
        shop: z.object({ myshopifyDomain: z.literal(externalAccountId) }),
        orders: z.object({
          nodes: z.array(z.object({ id: z.string(), updatedAt: z.iso.datetime({ offset: true }) })).max(50),
          pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() })
        })
      })
      .parse(
        await client.graphql(economicsQueries.orders, {
          query: `updated_at:>='${state.from}' updated_at:<'${state.to}'`,
          after: state.after ?? null
        })
      )
    const rows = []
    for (const order of result.orders.nodes) {
      if (
        seen.has(order.id) ||
        Date.parse(order.updatedAt) < Date.parse(state.from!) ||
        Date.parse(order.updatedAt) >= Date.parse(state.to!)
      ) {
        throw new Error("Shopify economics search scope mismatch")
      }
      seen.add(order.id)
      rows.push({ id: order.id, data: await collectShopifyEconomics(client, order.id, canReturn, assertOwned) })
    }
    const page = result.orders.pageInfo
    if (page.hasNextPage && (!result.orders.nodes.length || !page.endCursor || page.endCursor === state.after)) {
      throw new Error("Shopify economics cursor stalled")
    }
    state = page.hasNextPage
      ? { ...state, after: page.endCursor, error: null }
      : { scopes, history: "available", coveredFrom: state.coveredFrom ?? state.from, coveredTo: state.to, error: null }
    await publish(rows)
    return {
      hasMore: page.hasNextPage || Date.parse(state.coveredTo ?? end) < Date.parse(end) - 86400000,
      failed: false
    }
  } catch {
    state = { ...initialState, error: "collection_failed" }
    await publish([])
    return { hasMore: false, failed: true }
  }
}
