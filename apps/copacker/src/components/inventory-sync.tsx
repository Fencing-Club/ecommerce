"use client"

import { CircleAlert, CircleCheck, CircleDashed, RefreshCw } from "lucide-react"
import Link from "next/link"
import { EmptyState } from "@/components/common"
import { InventoryProducts, ProductsSkeleton } from "@/components/inventory-products"
import { ProductsWithoutSupplier } from "@/components/products-without-supplier"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { api, errorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"

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

// What went wrong with the last sync, and whether signing in again fixes it.
function failure(errorCode: string | null) {
  switch (errorCode) {
    case "shopify_permissions":
      return { message: "Needs access to location names", reconnect: true }
    case "reconnect":
      return { message: "Sign-in expired", reconnect: true }
    case "provider_unavailable":
      return { message: "Unavailable, try again in a few minutes", reconnect: false }
    default:
      return { message: "Last sync failed", reconnect: false }
  }
}

// Signs in to the source again: Shopify from here, Amazon in Settings.
function Reconnect({ source, shop }: { source: Source; shop: string | null }) {
  if (source.provider === "amazon") {
    return (
      <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/settings#integrations" />}>
        Reconnect
      </Button>
    )
  }
  return (
    <form action="/api/connections/shopify">
      <input type="hidden" name="shop" value={shop ?? ""} />
      <Button type="submit" variant="outline" size="sm">
        Reconnect
      </Button>
    </form>
  )
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
// A status that hasn't loaded yet, including before its first request starts.
const isPending = (status: Status) => status.isLoading || status.isUninitialized

const syncedAt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })

// One source in the strip: when it last synced, what went wrong if the last sync failed, and its actions.
function SourceStatus({ source, statuses }: { source: Source; statuses: Status[] }) {
  const [sync, mutation] = stockApi.useSyncInventoryMutation()
  const data = statuses.map((status) => status.currentData)
  const loading = statuses.some(isPending)
  const unavailable = statuses.some((status) => status.isError)
  const active =
    mutation.isLoading || data.some((item) => item?.refresh.status === "queued" || item?.refresh.status === "running")
  const failed = data.find((item) => item?.refresh.status === "failed")
  const problem = failed && !active ? failure(failed.refresh.errorCode) : null
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

  let icon = <CircleDashed className="text-muted-foreground" />
  if (problem || mutation.isError) {
    icon = <CircleAlert className="text-destructive" />
  } else if (observedAt) {
    icon = <CircleCheck className="text-success" />
  }
  let state: React.ReactNode = "Not synced yet"
  if (loading) {
    state = "Loading…"
  } else if (unavailable) {
    state = "Status unavailable"
  } else if (observedAt) {
    state = (
      <>
        Synced{" "}
        <time
          dateTime={observedAt}
          title={new Date(observedAt).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })}
        >
          {syncedAt(observedAt)}
        </time>
      </>
    )
  }

  return (
    <li className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
      <span className="flex shrink-0 [&_svg]:size-4" aria-hidden="true">
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium">{source.title}</span>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {state}
          {active && <span className="sr-only">, syncing</span>}
        </span>
        {problem && <span className="text-xs text-destructive">{problem.message}</span>}
        {mutation.isError && (
          <span role="alert" className="text-xs text-destructive">
            {errorMessage(mutation.error, "Couldn't start the sync. Try again.")}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {problem?.reconnect && <Reconnect source={source} shop={externalAccountId} />}
        <Button
          variant="outline"
          size="sm"
          onClick={startSync}
          disabled={active || loading || !externalAccountId}
          aria-label={`Sync ${source.title}`}
        >
          <RefreshCw data-icon="inline-start" className={cn(active && "animate-spin")} />
          {active ? "Syncing…" : "Sync"}
        </Button>
      </div>
    </li>
  )
}

// Stock across Shopify and Amazon: each source's sync in one strip, then the combined product list. `search` starts
// the list's search, such as a product chosen in the header's search.
export function InventorySync({ providers, search = "" }: { providers: string[]; search?: string }) {
  const shopify = useSelection(sources[0].selections[0], providers.includes("shopify"))
  const fba = useSelection(sources[1].selections[0], providers.includes("amazon"))
  const awd = useSelection(sources[1].selections[1], providers.includes("amazon"))
  if (providers.length === 0) {
    return (
      <Card>
        <EmptyState title="No store connected" description="Connect Shopify or Amazon to see your products.">
          <Button nativeButton={false} render={<Link href="/settings#integrations" />}>
            Open Settings
          </Button>
        </EmptyState>
      </Card>
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
    <div className="flex flex-col gap-4">
      <ul
        aria-label="Sources"
        className="flex flex-col divide-y overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 sm:flex-row sm:divide-x sm:divide-y-0"
      >
        {connected.map(({ source, statuses }) => (
          <SourceStatus key={source.title} source={source} statuses={statuses} />
        ))}
      </ul>
      {anySynced && (
        <>
          <ProductsWithoutSupplier syncKey={syncKey} />
          {/* A new search from the header replaces the one in the list. */}
          <InventoryProducts key={search} syncKey={syncKey} search={search} />
        </>
      )}
      {!anySynced && all.some(isPending) && <ProductsSkeleton />}
      {!anySynced && !all.some(isPending) && (
        <Card>
          <EmptyState title="No products yet" description="Sync a source to load your products." />
        </Card>
      )}
    </div>
  )
}
