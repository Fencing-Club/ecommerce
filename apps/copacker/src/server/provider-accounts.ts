import { and, eq, sql } from "drizzle-orm"
import { db, type Executor } from "@/db"
import { connections, stockSnapshots } from "@/db/schema"
import { LocalizedError } from "@/i18n/errors"

export type Provider = "amazon" | "shopify" | "ebay"

type AccountOptions = {
  executor?: Executor
  // Only this account: a background copy started for one account must not write to its replacement.
  externalId?: string
  // Lock the row for the rest of the caller's transaction, so a disconnect waits for the write, or the write sees it.
  lock?: "update" | "share"
}

// The workspace's connected account for a provider, or null when it isn't connected.
export async function connectedAccount(
  orgId: string,
  provider: Provider,
  { executor = db(), externalId, lock }: AccountOptions = {}
) {
  const query = executor
    .select()
    .from(connections)
    .where(
      and(
        eq(connections.orgId, orgId),
        eq(connections.provider, provider),
        externalId === undefined ? undefined : eq(connections.externalId, externalId)
      )
    )
  const [account] = await (lock ? query.for(lock) : query)
  return account ?? null
}

// The connected account, or a "Connect … in Settings first" error.
export async function requireConnectedAccount(orgId: string, provider: Provider, options: AccountOptions = {}) {
  const account = await connectedAccount(orgId, provider, options)
  if (!account) {
    throw new LocalizedError("connectInSettings", { provider })
  }
  return account
}

// The permissions a connection was granted, from its stored list (separated by commas or spaces).
export function grantedScopes(scopes: string): ReadonlySet<string> {
  return new Set(scopes.split(/[,\s]+/))
}

// The Shopify store's catalog snapshot, the stock refresh that reads every product and variant, as a condition for a
// query builder or raw SQL.
export function shopifyStoreSnapshot(orgId: string, domain: string) {
  const conditions = [
    eq(stockSnapshots.orgId, orgId),
    eq(stockSnapshots.source, "shopify"),
    eq(stockSnapshots.externalAccountId, domain),
    eq(stockSnapshots.scopeKey, "store")
  ]
  return sql`(${sql.join(conditions, sql` and `)})`
}
