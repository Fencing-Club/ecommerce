"use client"

import { useDebouncedValue } from "@mantine/hooks"
import { money } from "@repo/aisle"
import { ChevronLeft, ChevronRight, ExternalLink, RefreshCw, Repeat, Search } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { StatusBadge, type StatusTone } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Card, CardFooter } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, errorMessage } from "@/lib/api"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { SalesOrderSummary, SalesSource } from "@/server/sales-orders"

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

const isSource = (value: unknown): value is SalesSource => value === "shopify" || value === "amazon"

// Orders that closed without a sale: nothing sold, so there are no sales to show.
const closedStatuses = new Set(["Cancelled", "Unfulfillable"])

// Shopify's and Amazon's order statuses on the shared status tones: shipped is done, waiting to ship needs action,
// cancelled is lost, and anything else (such as Amazon's Pending) is neutral.
const orderTones = new Map<string, StatusTone>([
  ["Fulfilled", "success"],
  ["Shipped", "success"],
  ["Unfulfilled", "warning"],
  ["Partially fulfilled", "warning"],
  ["Unshipped", "warning"],
  ["Partially shipped", "warning"],
  ["Cancelled", "destructive"],
  ["Unfulfillable", "destructive"]
])
const orderTone = (status: string) => orderTones.get(status) ?? "neutral"

// Why a source's last sync failed, and what to do about it.
function failure(errorCode: string | null, title: string) {
  if (errorCode === "reconnect" || errorCode === "shopify_permissions") {
    return (
      <>
        Reconnect {title} in{" "}
        <Link href="/settings#integrations" className="underline underline-offset-2">
          Settings
        </Link>
      </>
    )
  }
  return errorCode === "provider_unavailable" ? `Couldn’t reach ${title}` : "Sync failed"
}

// One source in the summary strip: its sync state, the last 30 days' orders and units, and Sync. Beside the numbers
// when there's room, under them when not.
function SourceSummary({ state, refetch }: { state: SyncState; refetch: () => void }) {
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
  const syncedAt = state.finishedAt ?? state.coveredTo
  let detail: React.ReactNode = "Not synced"
  if (active) {
    detail = "Syncing…"
  } else if (mutation.isError) {
    detail = <span className="text-destructive">{errorMessage(mutation.error, "Couldn’t start the sync")}</span>
  } else if (state.status === "failed") {
    detail = <span className="text-destructive">{failure(state.errorCode, title)}</span>
  } else if (syncedAt) {
    detail = (
      <>
        Synced{" "}
        <time dateTime={syncedAt}>
          {new Date(syncedAt).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit"
          })}
        </time>
      </>
    )
  }
  return (
    <li className="@container/source px-4 py-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 @md/source:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="flex min-w-0 flex-col">
          <span className="font-medium">{title}</span>
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {detail}
          </span>
        </div>
        <dl className="col-span-2 row-start-2 flex flex-col @md/source:col-span-1 @md/source:col-start-2 @md/source:row-start-1">
          <dt className="text-xs text-muted-foreground">Last 30 days</dt>
          <dd className="flex gap-4 whitespace-nowrap tabular-nums">
            <span>
              <span className="font-medium">{formatNumber(state.recent.orders)}</span>{" "}
              <span className="text-muted-foreground">{state.recent.orders === 1 ? "order" : "orders"}</span>
            </span>
            <span>
              <span className="font-medium">{formatNumber(state.recent.units)}</span>{" "}
              <span className="text-muted-foreground">{state.recent.units === 1 ? "unit" : "units"}</span>
            </span>
          </dd>
        </dl>
        <Button
          variant="outline"
          size="sm"
          className="col-start-2 row-start-1 @md/source:col-start-3"
          onClick={startSync}
          disabled={active}
          aria-label={`Sync ${title} orders`}
        >
          {active ? <Spinner data-icon="inline-start" className="size-3.5" /> : <RefreshCw data-icon="inline-start" />}
          Sync
        </Button>
      </div>
    </li>
  )
}

function Placeholder({ title, children = "—" }: { title?: string; children?: React.ReactNode }) {
  return (
    <span title={title} className="whitespace-nowrap text-muted-foreground">
      {children}
    </span>
  )
}

// Money on an order. Amazon prices an order once it's paid and posts its fees after it ships, so until then an open
// Amazon order's amount is pending; anything else unknown, such as a cancelled order's, is "—".
function Amount({
  order,
  value,
  pending
}: {
  order: SalesOrderSummary
  value: SalesOrderSummary["sales"]
  pending: string
}) {
  if (value) {
    return money(value.minor, value.currency)
  }
  if (order.source === "amazon" && !closedStatuses.has(order.status)) {
    return <Placeholder title={pending}>Pending</Placeholder>
  }
  return <Placeholder />
}

function Items({ items }: { items: SalesOrderSummary["items"] }) {
  if (items.length === 0) {
    return <Placeholder />
  }
  const shown = items.slice(0, 3)
  return (
    <ul className="flex flex-col gap-1.5">
      {shown.map((item, index) => (
        <li key={`${item.sku}:${index}`} className="flex flex-col">
          <span>
            {item.name ?? item.sku ?? "Bundle"}{" "}
            <span className="whitespace-nowrap text-muted-foreground">× {item.quantity}</span>
          </span>
          {item.name && item.sku && <span className="text-xs break-all text-muted-foreground">{item.sku}</span>}
        </li>
      ))}
      {items.length > shown.length && (
        <li className="text-xs text-muted-foreground">{items.length - shown.length} more</li>
      )}
    </ul>
  )
}

// One order. Narrower, channel and status move under the order number; on a phone each order stacks.
function OrderRow({ order }: { order: SalesOrderSummary }) {
  return (
    <TableRow className="group/row @max-md:flex @max-md:flex-col @max-md:gap-2 @max-md:px-4 @max-md:py-3">
      <TableCell className="pl-4 align-top @max-md:p-0">
        <div className="flex flex-col gap-0.5">
          <a
            href={order.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center gap-1 font-medium whitespace-nowrap underline-offset-4 hover:underline"
          >
            {order.number}
            <ExternalLink
              aria-hidden="true"
              className="size-3 text-muted-foreground opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 pointer-coarse:opacity-100"
            />
            <span className="sr-only"> (opens in {titles[order.source]})</span>
          </a>
          <time dateTime={order.orderedAt} className="text-xs text-muted-foreground">
            {new Date(order.orderedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
          </time>
          {order.replacementOf && (
            <span className="flex items-center gap-1 text-xs whitespace-normal text-muted-foreground">
              <Repeat aria-hidden="true" className="size-3 shrink-0" />
              Replacement for {order.replacementOf}
            </span>
          )}
          <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground @2xl:hidden">
            {order.channel}
            <StatusBadge tone={orderTone(order.status)}>{order.status}</StatusBadge>
          </span>
        </div>
      </TableCell>
      <TableCell className="min-w-40 align-top whitespace-normal @max-md:min-w-0 @max-md:p-0">
        <Items items={order.items} />
      </TableCell>
      <TableCell className="hidden align-top @2xl:table-cell">{order.channel}</TableCell>
      <TableCell className="hidden align-top @2xl:table-cell">
        <StatusBadge tone={orderTone(order.status)}>{order.status}</StatusBadge>
      </TableCell>
      <TableCell className="hidden text-right align-top tabular-nums @2xl:table-cell">
        {formatNumber(order.units)}
      </TableCell>
      <TableCell className="pr-4 text-right align-top tabular-nums @2xl:pr-2 @max-md:p-0 @max-md:text-left">
        {closedStatuses.has(order.status) ? (
          <Placeholder />
        ) : (
          <Amount order={order} value={order.sales} pending="Amazon hasn’t priced this order yet" />
        )}
      </TableCell>
      <TableCell className="hidden pr-4 text-right align-top tabular-nums @2xl:table-cell">
        <Amount order={order} value={order.fees} pending="Amazon hasn’t posted its fees yet" />
      </TableCell>
    </TableRow>
  )
}

function OrderList({
  sources,
  syncKey,
  initialSearch
}: {
  sources: SyncState[]
  syncKey: string
  initialSearch: string
}) {
  const [source, setSource] = useState<SalesSource | null>(null)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState(initialSearch)
  const [q] = useDebouncedValue(search.trim(), 300)
  // The last page loaded stays on screen while the next one loads.
  const { data, isFetching, isError, error } = salesApi.useSalesOrdersQuery({
    source: source ?? undefined,
    page,
    q,
    syncKey
  })
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const sourceItems = [
    { value: "all", label: "All sources" },
    ...sources.map((state) => ({ value: state.source, label: titles[state.source] }))
  ]
  let body: React.ReactNode
  if (isError) {
    body = (
      <p role="alert" className="p-4 text-destructive">
        {errorMessage(error, "Couldn’t load orders")}
      </p>
    )
  } else if (!data) {
    body = (
      <div className="flex flex-col gap-3 p-4">
        <span className="sr-only">Loading orders…</span>
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    )
  } else if (total === 0) {
    body = (
      <Empty className="py-12">
        <EmptyHeader>
          <EmptyTitle>{q ? "No matching orders" : "No orders yet"}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  } else {
    body = (
      <div
        aria-busy={isFetching}
        className={cn("@container transition-opacity", isFetching ? "opacity-60 delay-300" : "delay-0")}
      >
        <Table framed={false} aria-label="Orders" className="@max-md:block">
          <TableHeader className="@max-md:hidden">
            <TableRow>
              <TableHead className="pl-4">Order</TableHead>
              <TableHead className="w-full">Items</TableHead>
              <TableHead className="hidden @2xl:table-cell">Channel</TableHead>
              <TableHead className="hidden @2xl:table-cell">Status</TableHead>
              <TableHead className="hidden text-right @2xl:table-cell">Units</TableHead>
              <TableHead className="pr-4 text-right @2xl:pr-2" title="After discounts, before tax and shipping">
                Sales
              </TableHead>
              <TableHead className="hidden pr-4 text-right @2xl:table-cell">Fees</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="@max-md:block">
            {data.orders.map((order) => (
              <OrderRow key={`${order.source}:${order.orderId}`} order={order} />
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex flex-wrap items-center gap-2 border-b p-4">
        <InputGroup className="min-w-48 flex-1 sm:max-w-sm">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label="Search orders"
            placeholder="Search orders, products, or SKUs"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(0)
            }}
          />
        </InputGroup>
        {sources.length > 1 && (
          <Select
            items={sourceItems}
            value={source ?? "all"}
            onValueChange={(value) => {
              setSource(isSource(value) ? value : null)
              setPage(0)
            }}
          >
            <SelectTrigger aria-label="Source" className="w-32">
              <SelectValue>
                {(value: string | null) => sourceItems.find((item) => item.value === value)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {sourceItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {body}
      {data && !isError && total > 0 && (
        <CardFooter className="flex-wrap justify-between gap-3 py-3">
          <p className="text-muted-foreground tabular-nums">
            {formatNumber(page * pageSize + 1)}–{formatNumber(Math.min((page + 1) * pageSize, total))} of{" "}
            {formatNumber(total)}
          </p>
          {totalPages > 1 && (
            <nav aria-label="Order pages" className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                <ChevronLeft data-icon="inline-start" />
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage(page + 1)}>
                Next
                <ChevronRight data-icon="inline-end" />
              </Button>
            </nav>
          )}
        </CardFooter>
      )}
    </Card>
  )
}

// Copies each source's orders into Copacker and lists them, so restock reads stored orders instead of waiting on
// Shopify and Amazon. `initialSearch` starts the list filtered, such as from the header search.
export function SalesOrders({ initialSearch = "" }: { initialSearch?: string }) {
  const { currentData, isLoading, error, refetch } = salesApi.useSalesStatusQuery(undefined, {
    pollingInterval: 5000,
    skipPollingIfUnfocused: true
  })
  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <span className="sr-only">Loading orders…</span>
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    )
  }
  // A failed poll keeps the last status on screen.
  if (!currentData) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {errorMessage(error, "Couldn’t load orders")}
      </p>
    )
  }
  if (currentData.sources.length === 0) {
    return (
      <Card>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Connect Shopify or Amazon</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Button nativeButton={false} render={<Link href="/settings#integrations" />}>
              Go to Settings
            </Button>
          </EmptyContent>
        </Empty>
      </Card>
    )
  }
  // Each finished period moves the covered range, which reloads the list.
  const syncKey = currentData.sources.map((state) => `${state.coveredTo ?? ""}:${state.orders}`).join("|")
  return (
    <div className="flex flex-col gap-4">
      <Card className="@container/sources gap-0 py-0">
        <ul
          aria-label="Sources"
          className="grid divide-y @3xl/sources:auto-cols-fr @3xl/sources:grid-flow-col @3xl/sources:divide-x @3xl/sources:divide-y-0"
        >
          {currentData.sources.map((state) => (
            <SourceSummary key={state.source} state={state} refetch={() => void refetch()} />
          ))}
        </ul>
      </Card>
      {/* Keyed by the starting search, so a new search from the header replaces the current one. */}
      <OrderList key={initialSearch} sources={currentData.sources} syncKey={syncKey} initialSearch={initialSearch} />
    </div>
  )
}
