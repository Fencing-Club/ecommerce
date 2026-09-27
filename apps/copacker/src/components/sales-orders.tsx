"use client"

import { useDebouncedValue } from "@mantine/hooks"
import { money } from "@repo/aisle"
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock,
  ExternalLink,
  RefreshCw,
  Search
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, errorMessage } from "@/lib/api"
import type { SalesOrderSummary, SalesSource } from "@/server/sales-orders"
import * as styles from "./sales-orders.css"
import { sx } from "@/styles/sprinkles.css"

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
  shopify_permissions: () => "Reconnect Shopify in Settings.",
  reconnect: (title) => `Reconnect ${title} in Settings.`,
  provider_unavailable: (title) => `${title} is unavailable. Try again later.`
}

// An order's status as an outline badge with an icon: done orders get a check, cancelled ones a warning, the rest a
// clock while they're still open.
function OrderStatus({ status }: { status: string }) {
  let icon = <Clock />
  if (status === "Cancelled" || status === "Unfulfillable") {
    icon = <CircleAlert className="text-destructive" />
  } else if (status === "Fulfilled" || status === "Shipped") {
    icon = <CircleCheck className="text-success" />
  }
  return (
    <Badge variant="outline" className="gap-1 px-1.5 text-muted-foreground">
      {icon}
      {status}
    </Badge>
  )
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
  let detail = state.coveredTo ? "Last 30 days" : "Not synced yet"
  if (active && state.coveredTo) {
    detail = `Synced through ${day(state.coveredTo)}`
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
          <span className={styles.statLabel}>Orders</span>
        </span>
        <span className={styles.stat}>
          <span className={styles.statValue}>{state.recent.units.toLocaleString()}</span>
          <span className={styles.statLabel}>Units</span>
        </span>
        {state.status === "failed" && !active && (
          <p className={styles.problem}>{failure ? failure(title) : "Last sync failed."}</p>
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
        <li key={`${item.sku}:${index}`} className="flex flex-col">
          <span>
            {item.name ?? item.sku ?? "Bundle"}{" "}
            <span className="whitespace-nowrap text-muted-foreground">× {item.quantity}</span>
          </span>
          {item.name && item.sku && <span className="text-xs break-all text-muted-foreground">{item.sku}</span>}
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
        <CardTitle>All orders</CardTitle>
      </CardHeader>
      <CardContent className={sx({ display: "flex", flexDirection: "column", gap: 4 })}>
        <div className={styles.filters}>
          <Field className={styles.search}>
            <span className={styles.searchBox}>
              <Search aria-hidden="true" />
              <Input
                id="orders-search"
                type="search"
                aria-label="Search orders"
                placeholder="Search orders, products or SKUs"
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
              <NativeSelect
                id="orders-source"
                aria-label="Source"
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
        {currentData && total === 0 && <p className={styles.summary}>{q ? "No orders match." : "No orders yet."}</p>}
        {currentData && total > 0 && (
          <>
            {/* Framed like shadcn's data table. Narrower, channel and status move under the order; on a phone each
                order stacks. */}
            <div className="@container">
              <Table className="@max-md:block">
                <TableHeader className="@max-md:hidden">
                  <TableRow>
                    <TableHead className="pl-4">Order</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead className="hidden @2xl:table-cell">Channel</TableHead>
                    <TableHead className="hidden @2xl:table-cell">Status</TableHead>
                    <TableHead className="hidden text-right @2xl:table-cell">Units</TableHead>
                    <TableHead className="text-right" title="After discounts, before tax and shipping">
                      Sales
                    </TableHead>
                    <TableHead className="hidden pr-4 text-right @2xl:table-cell">Fees</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="@max-md:block">
                  {currentData.orders.map((order) => (
                    <TableRow
                      key={`${order.source}:${order.orderId}`}
                      className="@max-md:flex @max-md:flex-col @max-md:gap-2 @max-md:px-4 @max-md:py-3"
                    >
                      <TableCell className="pl-4 align-top @max-md:p-0">
                        <span className="flex flex-col gap-0.5">
                          <a
                            href={order.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-medium whitespace-nowrap hover:underline"
                          >
                            {order.number}
                            <ExternalLink aria-hidden="true" className="size-3 opacity-60" />
                            <span className="sr-only"> (opens in {titles[order.source]})</span>
                          </a>
                          <time dateTime={order.orderedAt} className="text-xs text-muted-foreground">
                            {new Date(order.orderedAt).toLocaleString(undefined, {
                              dateStyle: "medium",
                              timeStyle: "short"
                            })}
                          </time>
                          <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground @2xl:hidden">
                            {order.channel}
                            <OrderStatus status={order.status} />
                          </span>
                        </span>
                      </TableCell>
                      <TableCell className="min-w-40 align-top whitespace-normal @max-md:min-w-0 @max-md:p-0">
                        <Items items={order.items} />
                      </TableCell>
                      <TableCell className="hidden align-top text-muted-foreground @2xl:table-cell">
                        {order.channel}
                      </TableCell>
                      <TableCell className="hidden align-top @2xl:table-cell">
                        <OrderStatus status={order.status} />
                      </TableCell>
                      <TableCell className="hidden text-right align-top tabular-nums @2xl:table-cell">
                        {order.units}
                      </TableCell>
                      <TableCell className="text-right align-top tabular-nums @max-md:p-0 @max-md:text-left">
                        {order.sales ? (
                          money(order.sales.minor, order.sales.currency)
                        ) : (
                          <Muted title="Amazon hasn’t priced this order yet">Pending</Muted>
                        )}
                      </TableCell>
                      <TableCell className="hidden pr-4 text-right align-top tabular-nums @2xl:table-cell">
                        {order.fees ? (
                          money(order.fees.minor, order.fees.currency)
                        ) : (
                          <Muted
                            title={order.source === "amazon" ? "Amazon hasn’t posted its fees yet" : "Not copied yet"}
                          >
                            Pending
                          </Muted>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <nav aria-label="Order pages" className={styles.pager}>
              <p className={styles.summary}>
                {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total.toLocaleString()}
              </p>
              <div className={styles.pagerButtons}>
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  <ChevronLeft data-icon="inline-start" />
                  Previous
                </Button>
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
        Connect Shopify or Amazon in <Link href="/settings">Settings</Link>.
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
      <OrderList sources={currentData.sources} syncKey={syncKey} />
    </div>
  )
}

// A value that isn't known yet, quieter than the figures around it.
function Muted({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <span title={title} className={sx({ color: "muted", whiteSpace: "nowrap" })}>
      {children}
    </span>
  )
}
