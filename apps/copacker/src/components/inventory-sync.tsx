"use client"

import { RefreshCw } from "lucide-react"
import Link from "next/link"
import { InventoryProducts } from "@/components/inventory-products"
import { ProductsWithoutSupplier } from "@/components/products-without-supplier"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { api, errorMessage } from "@/lib/api"
import * as styles from "./inventory-sync.css"
import { sx } from "@/styles/sprinkles.css"

type Selection = { source: "shopify" | "awd" | "fba"; marketplaceId?: string }
type StockStatus = {
  externalAccountId: string | null
  observedAt: string | null
  refresh: { status: string; errorCode: string | null }
}
const stockApi = api.injectEndpoints({
  overrideExisting: true,
  endpoints: (build) => ({
    // Only the sync status is needed here; the product list reads stock itself.
    inventoryStatus: build.query<StockStatus, Selection>({
      query: (selection) => ({ url: "inventory", params: { ...selection, limit: 1 } }),
      keepUnusedDataFor: 0
    }),
    syncInventory: build.mutation<{ status: string }, Selection>({
      query: (body) => ({ url: "inventory/refresh", method: "POST", body })
    })
  })
})
// Amazon is one source to the buyer: its sync refreshes FBA and AWD together.
const sources = [
  { title: "Shopify", provider: "shopify", selections: [{ source: "shopify" }] },
  {
    title: "Amazon",
    provider: "amazon",
    selections: [{ source: "fba", marketplaceId: "ATVPDKIKX0DER" }, { source: "awd" }]
  }
] as const satisfies { title: string; provider: string; selections: Selection[] }[]
type Source = (typeof sources)[number]

const failureMessages: Record<string, (title: string) => string> = {
  shopify_permissions: () => "Shopify needs permission to read location names. Reconnect Shopify, then sync again.",
  reconnect: (title) => `${title} needs you to sign in again. Reconnect in Settings, then sync again.`,
  provider_unavailable: (title) => `${title} is busy or unavailable. Try again in a few minutes.`
}
function failureMessage(title: string, errorCode: string | null) {
  const message = errorCode ? failureMessages[errorCode] : undefined
  return message ? message(title) : "Last sync failed. Try again or check your connection in Settings."
}

// Polls a selection's saved sync status. Provider calls happen only through the Sync button.
function useSelection(selection: Selection, connected: boolean) {
  return stockApi.useInventoryStatusQuery(selection, {
    pollingInterval: 5000,
    skipPollingIfUnfocused: true,
    skip: !connected
  })
}
type Status = ReturnType<typeof useSelection>

function SourceRow({ source, statuses }: { source: Source; statuses: Status[] }) {
  const [sync, mutation] = stockApi.useSyncInventoryMutation()
  const data = statuses.map((status) => status.currentData)
  const active =
    mutation.isLoading || data.some((item) => item?.refresh.status === "queued" || item?.refresh.status === "running")
  const failed = data.find((item) => item?.refresh.status === "failed")
  // The source is as fresh as its oldest part; it counts as synced once every part has been.
  const observed = data.map((item) => item?.observedAt ?? null)
  const observedAt = observed.every((value) => value !== null) ? observed.toSorted()[0]! : null
  const externalAccountId = data.find((item) => item?.externalAccountId)?.externalAccountId ?? null
  async function startSync() {
    try {
      await Promise.all(source.selections.map((selection) => sync(selection).unwrap()))
      for (const status of statuses) {
        void status.refetch()
      }
    } catch {
      // RTK Query retains the failure for the inline message.
    }
  }
  let state = "Not synced yet"
  if (statuses.some((status) => status.isLoading)) {
    state = "Loading sync status…"
  } else if (statuses.some((status) => status.isError)) {
    state = "Sync status is unavailable."
  } else if (active) {
    state = "Syncing. You can leave this page."
  }
  return (
    <li className={styles.source}>
      <span className={styles.sourceName}>
        <span className={styles.title}>{source.title}</span>
        <span className={styles.detail} aria-live="polite">
          {observedAt && !active ? (
            <>
              Synced{" "}
              <time dateTime={observedAt}>
                {new Date(observedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
              </time>
            </>
          ) : (
            state
          )}
        </span>
        {failed && !active && (
          <span className={styles.problem}>{failureMessage(source.title, failed.refresh.errorCode)}</span>
        )}
        {mutation.isError && (
          <span role="alert" className={styles.problem}>
            {errorMessage(mutation.error, "Couldn't start the sync. Try again.")}
          </span>
        )}
      </span>
      <span className={styles.sourceActions}>
        {source.provider === "shopify" && failed && (
          <form action="/api/connections/shopify">
            <input type="hidden" name="shop" value={externalAccountId ?? ""} />
            <Button type="submit" variant="outline" size="sm">
              Reconnect Shopify
            </Button>
          </form>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={startSync}
          disabled={active || statuses.some((status) => status.isLoading) || !externalAccountId}
          aria-label={`Sync ${source.title}`}
        >
          <RefreshCw data-icon="inline-start" />
          {active ? "Syncing…" : "Sync"}
        </Button>
      </span>
    </li>
  )
}

// One view of stock across Shopify and Amazon: each source's sync, then the combined product list.
export function InventorySync({ providers }: { providers: string[] }) {
  const shopify = useSelection(sources[0].selections[0], providers.includes("shopify"))
  const fba = useSelection(sources[1].selections[0], providers.includes("amazon"))
  const awd = useSelection(sources[1].selections[1], providers.includes("amazon"))
  if (providers.length === 0) {
    return (
      <p>
        Connect Shopify or Amazon in <Link href="/settings">Settings</Link> to see inventory.
      </p>
    )
  }
  const connected = [
    { source: sources[0], statuses: [shopify] },
    { source: sources[1], statuses: [fba, awd] }
  ].filter(({ source }) => providers.includes(source.provider))
  const all = connected.flatMap(({ statuses }) => statuses)
  // A finished sync of any part changes this, which reloads the product list.
  const syncKey = all.map((status) => status.currentData?.observedAt ?? "").join("|")
  const anySynced = all.some((status) => status.currentData?.observedAt)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Stock</CardTitle>
        <CardDescription>Totals across your Shopify locations and Amazon. Sync a source to refresh it.</CardDescription>
      </CardHeader>
      <CardContent className={sx({ display: "flex", flexDirection: "column", gap: 6 })}>
        <ul className={styles.sources} aria-label="Sources">
          {connected.map(({ source, statuses }) => (
            <SourceRow key={source.title} source={source} statuses={statuses} />
          ))}
        </ul>
        {anySynced ? (
          <>
            <ProductsWithoutSupplier syncKey={syncKey} />
            <InventoryProducts syncKey={syncKey} />
          </>
        ) : (
          <p className={styles.detail}>Sync a source to see your inventory.</p>
        )}
      </CardContent>
    </Card>
  )
}
