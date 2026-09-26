"use client"

import { useDebouncedValue } from "@mantine/hooks"
import { ChevronLeft, ChevronRight, ExternalLink, RefreshCw, Search } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, errorMessage } from "@/lib/api"
import type { SalesOrderSummary, SalesSource } from "@/server/sales-orders"
import * as styles from "./sales-orders.css"
import { sx } from "@/styles/sprinkles.css"
import { srOnly } from "@/styles/utilities.css"

type SyncState = {
  source: SalesSource
  externalAccountId: string
  status: "idle" | "queued" | "running" | "failed"
  errorCode: string | null
  coveredFrom: string | null
  coveredTo: string | null
  finishedAt: string | null
  orders: number
  recent: { orders: number; units: number }
}
type OrdersPage = { orders: SalesOrderSummary[]; total: number }

const salesApi = api.injectEndpoints({
  overrideExisting: true,
  endpoints: (build) => ({
    salesStatus: build.query<{ sources: SyncState[] }, void>({ query: () => "sales", keepUnusedDataFor: 0 }),
    salesOrders: build.query<OrdersPage, { source?: SalesSource; page: number; q: string; syncKey: string }>({
      query: ({ source, page, q }) => ({
        url: "sales/orders",
        params: { ...(source ? { source } : {}), ...(q ? { q } : {}), page }
      }),
      keepUnusedDataFor: 0
    }),
    syncSales: build.mutation<{ status: string }, { source: SalesSource }>({
      query: (body) => ({ url: "sales/sync", method: "POST", body })
    })
  })
})

const titles: Record<SalesSource, string> = { shopify: "Shopify", amazon: "Amazon" }
const pageSize = 50

const failureMessages: Record<string, (title: string) => string> = {
  shopify_permissions: () => "Shopify needs more permissions. Reconnect Shopify, then sync again.",
  reconnect: (title) => `${title} needs you to sign in again. Reconnect in Settings, then sync again.`,
  provider_unavailable: (title) => `${title} is busy or unavailable. Try again in a few minutes.`
}

// Finished orders read quietly; open and cancelled ones stand out.
function statusVariant(status: string): "secondary" | "outline" | "destructive" {
  if (status === "Cancelled" || status === "Unfulfillable") {
    return "destructive"
  }
  return status === "Fulfilled" || status === "Shipped" ? "secondary" : "outline"
}

function day(value: string) {
  return new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" })
}

function SourceCard({ state, refetch }: { state: SyncState; refetch: () => void }) {
  const [sync, mutation] = salesApi.useSyncSalesMutation()
  const title = titles[state.source]
  const active = mutation.isLoading || state.status === "queued" || state.status === "running"
  async function startSync() {
    try {
      await sync({ source: state.source }).unwrap()
      refetch()
    } catch {
      // RTK Query retains the failure for the inline message.
    }
  }
  let detail = "No orders copied yet."
  if (state.coveredFrom && state.coveredTo) {
    detail = `${state.orders.toLocaleString()} orders from ${day(state.coveredFrom)} to ${day(state.coveredTo)}.`
  }
  if (active) {
    detail = state.coveredTo
      ? `Syncing, copied through ${day(state.coveredTo)} so far. You can leave this page.`
      : "Copying order history. This can take a while, and you can leave this page."
  }
  const failure = state.errorCode ? failureMessages[state.errorCode] : undefined
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription aria-live="polite">{detail}</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" onClick={startSync} disabled={active} aria-label={`Sync ${title} orders`}>
            <RefreshCw data-icon="inline-start" />
            {active ? "Syncing…" : "Sync"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className={styles.stats}>
        <span className={styles.stat}>
          <span className={styles.statValue}>{state.recent.orders.toLocaleString()}</span>
          <span className={styles.statLabel}>Orders, last 30 days</span>
        </span>
        <span className={styles.stat}>
          <span className={styles.statValue}>{state.recent.units.toLocaleString()}</span>
          <span className={styles.statLabel}>Units, last 30 days</span>
        </span>
        {state.status === "failed" && !active && (
          <p className={styles.problem}>
            {failure ? failure(title) : "Last sync failed. Try again or check your connection in Settings."}
          </p>
        )}
        {mutation.isError && (
          <p role="alert" className={styles.problem}>
            {errorMessage(mutation.error, "Couldn't start the sync. Try again.")}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function Items({ items }: { items: SalesOrderSummary["items"] }) {
  const shown = items.slice(0, 3)
  return (
    <ul className={styles.items}>
      {shown.map((item, index) => (
        <li key={`${item.sku}:${index}`}>
          <span className={styles.sku}>{item.sku ?? "Bundle"}</span> × {item.quantity}
        </li>
      ))}
      {items.length > shown.length && <li className={styles.more}>{items.length - shown.length} more</li>}
    </ul>
  )
}

function OrderList({ sources, syncKey }: { sources: SyncState[]; syncKey: string }) {
  const [source, setSource] = useState<SalesSource | "">("")
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState("")
  const [q] = useDebouncedValue(search.trim(), 300)
  const { currentData, isFetching, isError, error } = salesApi.useSalesOrdersQuery({
    source: source || undefined,
    page,
    q,
    syncKey
  })
  const total = currentData?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Orders</CardTitle>
        <CardDescription>Newest first. Open an order in Shopify or Seller Central for full details.</CardDescription>
      </CardHeader>
      <CardContent className={sx({ display: "flex", flexDirection: "column", gap: 4 })}>
        <div className={styles.filters}>
          <Field className={styles.search}>
            <FieldLabel htmlFor="orders-search">Search</FieldLabel>
            <span className={styles.searchBox}>
              <Search aria-hidden="true" />
              <Input
                id="orders-search"
                type="search"
                placeholder="Order number or SKU"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(0)
                }}
              />
            </span>
          </Field>
          {sources.length > 1 && (
            <Field className={styles.filter}>
              <FieldLabel htmlFor="orders-source">Source</FieldLabel>
              <NativeSelect
                id="orders-source"
                value={source}
                onChange={(event) => {
                  const value = event.target.value
                  setSource(value === "shopify" || value === "amazon" ? value : "")
                  setPage(0)
                }}
              >
                <NativeSelectOption value="">All sources</NativeSelectOption>
                {sources.map((state) => (
                  <NativeSelectOption key={state.source} value={state.source}>
                    {titles[state.source]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          )}
        </div>
        {isError && <p role="alert">{errorMessage(error, "Orders couldn't be loaded.")}</p>}
        {!currentData && isFetching && <p className={styles.summary}>Loading orders…</p>}
        {currentData && total === 0 && (
          <p className={styles.summary}>{q ? "No orders match." : "No orders copied yet. Sync a source above."}</p>
        )}
        {currentData && total > 0 && (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className={styles.numberCell}>Units</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentData.orders.map((order) => (
                  <TableRow key={`${order.source}:${order.orderId}`}>
                    <TableCell>
                      <span className={styles.order}>
                        <a href={order.url} target="_blank" rel="noreferrer" className={styles.orderLink}>
                          {order.number}
                          <ExternalLink aria-hidden="true" />
                          <span className={srOnly}> (opens in {titles[order.source]})</span>
                        </a>
                        <time dateTime={order.orderedAt} className={styles.date}>
                          {new Date(order.orderedAt).toLocaleString(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short"
                          })}
                        </time>
                      </span>
                    </TableCell>
                    <TableCell>
                      <Items items={order.items} />
                    </TableCell>
                    <TableCell>{order.channel}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(order.status)}>{order.status}</Badge>
                    </TableCell>
                    <TableCell className={styles.numberCell}>{order.units}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <nav aria-label="Order pages" className={styles.pager}>
              <p className={styles.summary}>
                Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total.toLocaleString()}{" "}
                orders
              </p>
              <div className={styles.pagerButtons}>
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  <ChevronLeft data-icon="inline-start" />
                  Previous
                </Button>
                <span className={styles.summary}>
                  Page {page + 1} of {totalPages}
                </span>
                <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage(page + 1)}>
                  Next
                  <ChevronRight data-icon="inline-end" />
                </Button>
              </div>
            </nav>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// Copies each source's orders into Copacker and lists them, so restock reads stored orders instead of waiting on
// Shopify and Amazon.
export function SalesOrders() {
  const { currentData, isLoading, isError, error, refetch } = salesApi.useSalesStatusQuery(undefined, {
    pollingInterval: 5000,
    skipPollingIfUnfocused: true
  })
  if (isLoading) {
    return <p className={styles.summary}>Loading orders…</p>
  }
  if (isError || !currentData) {
    return <p role="alert">{errorMessage(error, "Orders couldn't be loaded.")}</p>
  }
  if (currentData.sources.length === 0) {
    return (
      <p>
        Connect Shopify or Amazon in <Link href="/settings">Settings</Link> to copy your orders.
      </p>
    )
  }
  // Each finished period moves the covered range, which reloads the list.
  const syncKey = currentData.sources.map((state) => `${state.coveredTo ?? ""}:${state.orders}`).join("|")
  return (
    <div className={sx({ display: "flex", flexDirection: "column", gap: 6 })}>
      <div className={styles.sources}>
        {currentData.sources.map((state) => (
          <SourceCard key={state.source} state={state} refetch={() => void refetch()} />
        ))}
      </div>
      <p className={styles.summary}>
        The first sync copies the last 365 days. Later syncs add new orders and recheck the last 30 days, which picks up
        shipments and cancellations.
      </p>
      <OrderList sources={currentData.sources} syncKey={syncKey} />
    </div>
  )
}
