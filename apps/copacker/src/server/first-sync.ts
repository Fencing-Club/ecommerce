import { requestSalesSync } from "./sales-orders"
import { refreshStock, type stockSelection } from "./stock"
import type { Session } from "./workspace-session"

type Selection = import("zod").infer<typeof stockSelection>

// What a store's Sync now starts: its orders, and each of its stock sources.
const stockFor: Record<"shopify" | "amazon" | "ebay", Selection[]> = {
  shopify: [{ source: "shopify" }],
  amazon: [{ source: "fba", marketplaceId: "ATVPDKIKX0DER" }, { source: "awd" }],
  // eBay sells from the stock Shopify tracks, so it has none of its own to copy.
  ebay: []
}

// A store that was just connected starts copying its orders and stock at once, as Sync now would, so the pages that
// show them say they're syncing rather than empty. A part that can't start (such as orders without Shopify's order
// access) is left for its Settings row to explain, and doesn't stop the others or the connection.
export async function startFirstSync(
  org: Pick<Session["org"], "id" | "kind">,
  provider: "shopify" | "amazon" | "ebay"
) {
  const started = await Promise.allSettled([
    requestSalesSync(org, provider),
    ...stockFor[provider].map((selection) => refreshStock(org, selection))
  ])
  for (const outcome of started) {
    if (outcome.status === "rejected") {
      console.error(
        JSON.stringify({ event: "first_sync_not_started", orgId: org.id, provider, error: String(outcome.reason) })
      )
    }
  }
}
