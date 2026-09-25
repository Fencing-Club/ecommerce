"use client"

import { RefreshCw } from "lucide-react"
import Link from "next/link"
import { InventoryProducts } from "@/components/inventory-products"
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
const sources = [
  { title: "Shopify", provider: "shopify", selection: { source: "shopify" } },
  { title: "Amazon FBA", provider: "amazon", selection: { source: "fba", marketplaceId: "ATVPDKIKX0DER" } },
  { title: "Amazon AWD", provider: "amazon", selection: { source: "awd" } }
] as const satisfies { title: string; provider: string; selection: Selection }[]
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

// Polls a source's saved sync status. Provider calls happen only through the Sync button.
function useSource({ selection }: Source, connected: boolean) {
  const status = stockApi.useInventoryStatusQuery(selection, {
    pollingInterval: 5000,
    skipPollingIfUnfocused: true,
    skip: !connected
  })
  return status
}

function SourceRow({
  source,
  status,
  refetch
}: {
  source: Source
  status: ReturnType<typeof useSource>
  refetch: () => void
}) {
  const [sync, mutation] = stockApi.useSyncInventoryMutation()
  const data = status.currentData
  const active = mutation.isLoading || data?.refresh.status === "queued" || data?.refresh.status === "running"
  async function startSync() {
    try {
      await sync(source.selection).unwrap()
      refetch()
    } catch {
      // RTK Query retains the failure for the inline message.
    }
  }
  let state = "Not synced yet"
  if (status.isLoading) {
    state = "Loading sync status…"
  } else if (status.isError) {
    state = "Sync status is unavailable."
  } else if (active) {
    state = "Syncing. You can leave this page."
  }
  return (
    <li className={styles.source}>
      <span className={styles.sourceName}>
        <span className={styles.title}>{source.title}</span>
        <span className={styles.detail} aria-live="polite">
          {data?.observedAt && !active ? (
            <>
              Synced{" "}
              <time dateTime={data.observedAt}>
                {new Date(data.observedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
              </time>
            </>
          ) : (
            state
          )}
        </span>
        {data?.refresh.status === "failed" && !active && (
          <span className={styles.problem}>{failureMessage(source.title, data.refresh.errorCode)}</span>
        )}
        {mutation.isError && (
          <span role="alert" className={styles.problem}>
            {errorMessage(mutation.error, "Couldn't start the sync. Try again.")}
          </span>
        )}
      </span>
      <span className={styles.sourceActions}>
        {source.selection.source === "shopify" && data?.refresh.status === "failed" && (
          <form action="/api/connections/shopify">
            <input type="hidden" name="shop" value={data.externalAccountId ?? ""} />
            <Button type="submit" variant="outline" size="sm">
              Reconnect Shopify
            </Button>
          </form>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={startSync}
          disabled={active || status.isLoading || !data?.externalAccountId}
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
  const shopify = useSource(sources[0], providers.includes("shopify"))
  const fba = useSource(sources[1], providers.includes("amazon"))
  const awd = useSource(sources[2], providers.includes("amazon"))
  const statuses = [shopify, fba, awd]
  if (providers.length === 0) {
    return (
      <p>
        Connect Shopify or Amazon in <Link href="/settings">Settings</Link> to see inventory.
      </p>
    )
  }
  const connected = sources.flatMap((source, index) =>
    providers.includes(source.provider) ? [{ source, status: statuses[index]! }] : []
  )
  // A finished sync of any source changes this, which reloads the product list.
  const syncKey = connected.map(({ status }) => status.currentData?.observedAt ?? "").join("|")
  const anySynced = connected.some(({ status }) => status.currentData?.observedAt)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Stock</CardTitle>
        <CardDescription>Totals across your Shopify locations and Amazon. Sync a source to refresh it.</CardDescription>
      </CardHeader>
      <CardContent className={sx({ display: "flex", flexDirection: "column", gap: 6 })}>
        <ul className={styles.sources} aria-label="Sources">
          {connected.map(({ source, status }) => (
            <SourceRow key={source.title} source={source} status={status} refetch={() => void status.refetch()} />
          ))}
        </ul>
        {anySynced ? (
          <InventoryProducts syncKey={syncKey} />
        ) : (
          <p className={styles.detail}>Sync a source to see your inventory.</p>
        )}
      </CardContent>
    </Card>
  )
}
