import { eq } from "drizzle-orm"
import { db } from "@/db"
import { connections, jobs, organizations, stockSnapshots } from "@/db/schema"
import { withJobWake } from "@/server/job-delivery"
import { queueAdsSync } from "./amazon-ads"
import { queueAmazonSubscription } from "./amazon-notifications"
import { demoShopDomain } from "./demo-shopify"
import { queueEbaySubscription } from "./ebay-events"
import { stockScopes } from "./inventory-connectors"
import { jobRow, type JobInput } from "./job-payloads"
import type { JobContext } from "./job-runtime"
import { requestSalesSync, SalesSyncError } from "./sales-orders"
import { queueShopifySubscription } from "./shopify-webhooks"
import { refreshStock, stockSelection } from "./stock"

// Once a day every connected account's orders and stock are read again. That catches changes whose webhook never
// arrived and keeps sources without webhooks current. It runs at 07:00 UTC, overnight in the US.
export async function queueReconciliation(now = new Date()) {
  const date = now.toISOString().slice(0, 10)
  await withJobWake(
    db()
      .insert(jobs)
      .values(jobRow("reconcile", `reconcile:${date}`, { date }, { runAt: new Date(`${date}T07:00:00Z`) }))
      .onConflictDoNothing()
  )
}

// Worker job: starts a sales sync and a refresh of each stock scope already in use for every buyer connection, and
// renews Shopify webhook, Amazon notification and eBay notification subscriptions. Work already waiting or running is
// left as it is.
export async function reconcileJob({ date }: JobInput<"reconcile">, { assertOwned }: Pick<JobContext, "assertOwned">) {
  const accounts = await db()
    .select({
      orgId: connections.orgId,
      provider: connections.provider,
      externalId: connections.externalId,
      kind: organizations.kind
    })
    .from(connections)
    .innerJoin(organizations, eq(organizations.id, connections.orgId))
    .where(eq(organizations.kind, "buyer"))
  const scopes = await db()
    .select({
      orgId: stockSnapshots.orgId,
      source: stockSnapshots.source,
      externalAccountId: stockSnapshots.externalAccountId,
      scopeKey: stockSnapshots.scopeKey
    })
    .from(stockSnapshots)
  for (const account of accounts) {
    // Seeded demonstrations have no remote subscriptions or sales history to reconcile.
    if (account.provider === "shopify" && account.externalId === demoShopDomain) {
      continue
    }
    await assertOwned()
    const org = { id: account.orgId, kind: account.kind }
    try {
      await requestSalesSync(org, account.provider)
    } catch (error) {
      // The connection can't read orders; Settings already asks the buyer to reconnect.
      if (!(error instanceof SalesSyncError)) {
        throw error
      }
    }
    for (const scope of scopes) {
      if (
        scope.orgId !== account.orgId ||
        scope.externalAccountId !== account.externalId ||
        stockScopes[scope.source].provider !== account.provider
      ) {
        continue
      }
      const selection = stockSelection.safeParse(
        scope.source === "fba" ? { source: "fba", marketplaceId: scope.scopeKey } : { source: scope.source }
      )
      if (selection.success) {
        await refreshStock(org, selection.data)
      }
    }
    if (account.provider === "shopify") {
      await queueShopifySubscription(account.orgId, date)
    } else if (account.provider === "ebay") {
      await queueEbaySubscription(account.orgId, date)
    } else {
      await queueAmazonSubscription(account.orgId, date)
      await queueAdsSync(account.orgId)
    }
  }
}
