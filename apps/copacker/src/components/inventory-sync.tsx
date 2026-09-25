"use client"

import type { Amazon } from "@repo/aisle/amazon"
import type { Shopify } from "@repo/aisle/shopify"
import { RefreshCw } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { InventoryProducts } from "@/components/inventory-products"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, errorMessage } from "@/lib/api"
import { sx } from "@/styles/sprinkles.css"

type Selection = { source: "shopify" | "awd" | "fba"; marketplaceId?: string }
type StockStatus = {
  externalAccountId: string | null
  rows: Awaited<ReturnType<Amazon["awdStock"] | Amazon["fbaStock"] | Shopify["stock"]>>["rows"]
  locations: { id: string; name: string }[]
  nextCursor: string | null
  observedAt: string | null
  refresh: { status: string; errorCode: string | null }
}
const stockApi = api.injectEndpoints({
  overrideExisting: true,
  endpoints: (build) => ({
    inventoryStatus: build.query<StockStatus, Selection & { cursor?: string; locationId?: string }>({
      query: (selection) => ({ url: "inventory", params: { ...selection, limit: 100 } }),
      keepUnusedDataFor: 0
    }),
    syncInventory: build.mutation<{ status: string }, Selection>({
      query: (body) => ({ url: "inventory/refresh", method: "POST", body })
    })
  })
})
const sources: { title: string; description: string; selection: Selection }[] = [
  { title: "Shopify", description: "Inventory across your Shopify locations.", selection: { source: "shopify" } },
  {
    title: "Amazon FBA",
    description: "US fulfillment center inventory.",
    selection: { source: "fba", marketplaceId: "ATVPDKIKX0DER" }
  },
  { title: "Amazon AWD", description: "US warehousing and distribution inventory.", selection: { source: "awd" } }
]
const failureMessages: Record<string, (title: string) => string> = {
  shopify_permissions: () => "Shopify needs permission to read location names. Reconnect Shopify, then sync again.",
  reconnect: (title) => `${title} needs you to sign in again. Reconnect in Settings, then sync again.`,
  provider_unavailable: (title) => `${title} is busy or unavailable. Try again in a few minutes.`
}
function failureMessage(title: string, errorCode: string | null) {
  const message = errorCode ? failureMessages[errorCode] : undefined
  return message ? message(title) : "Last sync failed. Try again or check your connection in Settings."
}
function SourceSync({ title, description, selection }: (typeof sources)[number]) {
  const [cursor, setCursor] = useState<string | undefined>()
  // Poll saved status only. Provider calls happen exclusively through the explicit mutation.
  const {
    currentData: data,
    isLoading: initialLoading,
    isError,
    refetch
  } = stockApi.useInventoryStatusQuery(
    { ...selection, cursor },
    {
      pollingInterval: 5000,
      skipPollingIfUnfocused: true
    }
  )
  const isLoading = initialLoading || (!data && !isError)
  const [sync, mutation] = stockApi.useSyncInventoryMutation()
  const active = mutation.isLoading || data?.refresh.status === "queued" || data?.refresh.status === "running"
  async function startSync() {
    try {
      setCursor(undefined)
      await sync(selection).unwrap()
      await refetch()
    } catch {
      // RTK Query retains the failure for the inline message.
    }
  }
  if (data && !data.externalAccountId) {
    return null
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{data?.externalAccountId ?? description}</CardDescription>
        {!isLoading && !isError && data?.externalAccountId && (
          <CardAction>
            <Button onClick={startSync} disabled={active} aria-label={`Sync ${title}`}>
              <RefreshCw data-icon="inline-start" />
              {active ? "Syncing…" : "Sync"}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className={sx({ display: "flex", flexDirection: "column", gap: 4 })}>
        <div aria-live="polite">
          {isLoading && "Loading sync status..."}
          {!isLoading && isError && "Sync status is unavailable."}
          {!isLoading && !isError && !data?.observedAt && "Not synced yet"}
          {!isLoading && !isError && data?.observedAt && (
            <>
              Last successful sync:{" "}
              <time dateTime={data.observedAt}>
                {new Date(data.observedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
              </time>
            </>
          )}
          {active && <p>Sync in progress. You can leave this page.</p>}
          {data?.refresh.status === "failed" && <p>{failureMessage(title, data.refresh.errorCode)}</p>}
        </div>
        {mutation.isError && <p role="alert">{errorMessage(mutation.error, "Couldn't start the sync. Try again.")}</p>}
        {!isLoading && !isError && !data?.externalAccountId && <Link href="/settings">Connect in Settings</Link>}
        {selection.source === "shopify" && data?.refresh.status === "failed" && (
          <form action="/api/connections/shopify">
            <input type="hidden" name="shop" value={data.externalAccountId ?? ""} />
            <Button type="submit" variant="outline">
              Reconnect Shopify
            </Button>
          </form>
        )}
        {selection.source === "shopify" && data?.observedAt && <InventoryProducts observedAt={data.observedAt} />}
        {selection.source !== "shopify" && data?.rows && data.rows.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Available</TableHead>
                <TableHead>On hand / Total</TableHead>
                <TableHead>Incoming</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.flatMap((row) => {
                if ("levels" in row) {
                  return row.levels.length
                    ? row.levels.map((level) => (
                        <TableRow key={`${row.variantId}:${level.locationId}`}>
                          <TableCell>{row.buyerSku ?? row.variantId}</TableCell>
                          <TableCell>{level.locationName}</TableCell>
                          <TableCell>{level.available ?? "Unknown"}</TableCell>
                          <TableCell>{level.onHand ?? "Unknown"}</TableCell>
                          <TableCell>{level.incoming ?? "Unknown"}</TableCell>
                        </TableRow>
                      ))
                    : [
                        <TableRow key={row.variantId}>
                          <TableCell>{row.buyerSku ?? row.variantId}</TableCell>
                          <TableCell colSpan={4}>
                            {row.tracked ? "No location inventory reported" : "Inventory not tracked"}
                          </TableCell>
                        </TableRow>
                      ]
                }
                if ("onHand" in row) {
                  return [
                    <TableRow key={row.sellerSku}>
                      <TableCell>{row.sellerSku}</TableCell>
                      <TableCell>AWD US</TableCell>
                      <TableCell>{row.availableDistributable ?? "Unknown"}</TableCell>
                      <TableCell>{row.onHand ?? "Unknown"}</TableCell>
                      <TableCell>{row.inbound ?? "Unknown"}</TableCell>
                    </TableRow>
                  ]
                }
                return [
                  <TableRow key={`${row.sellerSku}:${row.fnSku}:${row.condition}`}>
                    <TableCell>{row.sellerSku}</TableCell>
                    <TableCell>FBA US</TableCell>
                    <TableCell>{row.inventoryDetails?.fulfillableQuantity ?? "Unknown"}</TableCell>
                    <TableCell>{row.totalQuantity ?? "Unknown"}</TableCell>
                    <TableCell>
                      Working: {row.inventoryDetails?.inboundWorkingQuantity ?? "Unknown"}; shipped:{" "}
                      {row.inventoryDetails?.inboundShippedQuantity ?? "Unknown"}; receiving:{" "}
                      {row.inventoryDetails?.inboundReceivingQuantity ?? "Unknown"}
                    </TableCell>
                  </TableRow>
                ]
              })}
            </TableBody>
          </Table>
        )}
        {selection.source !== "shopify" && data?.observedAt && data.rows.length === 0 && (
          <p>No inventory was reported for this selection.</p>
        )}
        {selection.source !== "shopify" && cursor && (
          <Button variant="outline" onClick={() => setCursor(undefined)}>
            First page
          </Button>
        )}
        {selection.source !== "shopify" && data?.nextCursor && (
          <Button variant="outline" onClick={() => setCursor(data.nextCursor ?? undefined)}>
            Next page
          </Button>
        )}
        {isError && (
          <Button variant="outline" onClick={() => refetch()}>
            Retry status
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
export function InventorySync({ providers }: { providers: string[] }) {
  return (
    <div className={sx({ display: "grid", gap: 6 })}>
      {providers.length === 0 && (
        <p>
          Connect Shopify or Amazon in <Link href="/settings">Settings</Link> to see inventory.
        </p>
      )}
      {sources
        .filter((source) => providers.includes(source.selection.source === "shopify" ? "shopify" : "amazon"))
        .map((source) => (
          <SourceSync key={source.selection.source} {...source} />
        ))}
    </div>
  )
}
