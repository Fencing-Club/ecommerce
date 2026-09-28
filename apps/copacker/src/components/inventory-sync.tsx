"use client"

import { CircleAlert } from "lucide-react"
import Link from "next/link"
import { useIsAdmin } from "@/components/access"
import { EmptyState } from "@/components/common"
import { InventoryProducts, ProductsSkeleton } from "@/components/inventory-products"
import { ProductsWithoutSupplier } from "@/components/products-without-supplier"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { api, errorMessage } from "@/lib/api"
import { DetailRow } from "./inventory-locations"
import { SyncedAt, SyncMenu } from "./sync-menu"

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

// Polls a selection's saved sync status. Syncs run on their own (webhooks, and every account again each night); Sync
// now in Settings starts one at once.
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

// A source's sync from its parts' statuses: whether one is running, what went wrong if the last one failed, and when
// the source last synced, which is when its oldest part did.
function sourceState(statuses: Status[]) {
  const data = statuses.map((status) => status.currentData)
  const active = data.some((item) => item?.refresh.status === "queued" || item?.refresh.status === "running")
  const failed = data.find((item) => item?.refresh.status === "failed")
  const observed = data.map((item) => item?.observedAt ?? null)
  return {
    active,
    problem: failed && !active ? failure(failed.refresh.errorCode) : null,
    observedAt: observed.every((value) => value !== null) ? observed.toSorted()[0]! : null,
    externalAccountId: data.find((item) => item?.externalAccountId)?.externalAccountId ?? null,
    loading: statuses.some(isPending),
    unavailable: statuses.some((status) => status.isError)
  }
}

// A store's inventory sync in its Settings: when it last synced or what went wrong, with Sync now and Reconnect.
export function InventorySyncRow({ provider }: { provider: Source["provider"] }) {
  const source = sources.find((item) => item.provider === provider)!
  const selections: readonly Selection[] = source.selections
  const first = useSelection(selections[0]!, true)
  const second = useSelection(selections[1] ?? selections[0]!, selections.length > 1)
  const statuses = selections.length > 1 ? [first, second] : [first]
  const [sync, mutation] = stockApi.useSyncInventoryMutation()
  const state = sourceState(statuses)
  const syncing = mutation.isLoading || state.active
  async function startSync() {
    try {
      await Promise.all(selections.map((selection) => sync(selection).unwrap()))
      for (const status of statuses) {
        void status.refetch()
      }
    } catch {
      // RTK Query retains the failure for the inline message.
    }
  }
  let text: React.ReactNode = "Not synced yet"
  if (syncing) {
    text = "Syncing…"
  } else if (mutation.isError) {
    text = <span className="text-destructive">{errorMessage(mutation.error, "Couldn’t start the sync")}</span>
  } else if (state.problem) {
    text = <span className="text-destructive">{state.problem.message}</span>
  } else if (state.loading) {
    text = "Loading…"
  } else if (state.unavailable) {
    text = "Status unavailable"
  } else if (state.observedAt) {
    text = <SyncedAt at={state.observedAt} />
  }
  let reconnect: string | null = null
  if (state.problem?.reconnect) {
    reconnect =
      provider === "shopify"
        ? `/api/connections/shopify?shop=${encodeURIComponent(state.externalAccountId ?? "")}`
        : "/api/connections/amazon"
  }
  return (
    <DetailRow
      title="Inventory"
      action={
        <SyncMenu
          label={`${source.title} inventory`}
          syncing={syncing || state.loading || !state.externalAccountId}
          onSync={() => void startSync()}
          reconnect={reconnect}
        />
      }
    >
      <span aria-live="polite">{text}</span>
    </DetailRow>
  )
}

// Stock across Shopify and Amazon: each source's sync in one strip, then the combined product list. `search` starts
// the list's search, such as a product chosen in the header's search.
export function InventorySync({ providers, search = "" }: { providers: string[]; search?: string }) {
  const shopify = useSelection(sources[0].selections[0], providers.includes("shopify"))
  const fba = useSelection(sources[1].selections[0], providers.includes("amazon"))
  const awd = useSelection(sources[1].selections[1], providers.includes("amazon"))
  // The owner and admins connect stores; everyone else is told who can.
  const admin = useIsAdmin()
  if (providers.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No store connected"
          description={admin ? "Connect Shopify or Amazon to see your products" : "Ask an admin to connect one"}
        >
          {admin && (
            <Button nativeButton={false} render={<Link href="/settings#integrations" />}>
              Open settings
            </Button>
          )}
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
      {connected.map(({ source, statuses }) => (
        <SyncProblem key={source.title} source={source} statuses={statuses} />
      ))}
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
          <EmptyState title="No products yet" description="They appear after the first sync" />
        </Card>
      )}
    </div>
  )
}

// A store whose last inventory sync failed, so its stock may be out of date. Settings has Reconnect and Sync now, for
// the owner and admins.
function SyncProblem({ source, statuses }: { source: Source; statuses: Status[] }) {
  const { problem } = sourceState(statuses)
  const admin = useIsAdmin()
  if (!problem) {
    return null
  }
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>{source.title} inventory didn’t sync</AlertTitle>
      <AlertDescription>{problem.message}</AlertDescription>
      {admin && (
        <AlertAction>
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/settings#integrations" />}>
            Open settings
          </Button>
        </AlertAction>
      )}
    </Alert>
  )
}
