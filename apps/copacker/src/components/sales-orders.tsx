"use client"

import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, errorMessage } from "@/lib/api"
import type { SalesOrderSummary, SalesSource } from "@/server/sales-orders"
import * as syncStyles from "./inventory-sync.css"
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
}
type OrdersPage = { orders: SalesOrderSummary[]; total: number }

const salesApi = api.injectEndpoints({
  overrideExisting: true,
  endpoints: (build) => ({
    salesStatus: build.query<{ sources: SyncState[] }, void>({ query: () => "sales", keepUnusedDataFor: 0 }),
    salesOrders: build.query<OrdersPage, { source?: SalesSource; page: number; syncKey: string }>({
      query: ({ source, page }) => ({ url: "sales/orders", params: { ...(source ? { source } : {}), page } }),
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

function day(value: string) {
  return new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" })
}

function SyncRow({ state, refetch }: { state: SyncState; refetch: () => void }) {
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
  let detail = "No orders copied yet"
  if (active) {
    detail = state.coveredFrom
      ? "Syncing recent orders. You can leave this page."
      : "Copying order history. This can take several minutes, and you can leave this page."
  } else if (state.coveredFrom && state.coveredTo) {
    detail = `${state.orders.toLocaleString()} orders from ${day(state.coveredFrom)} to ${day(state.coveredTo)}`
  }
  const failure = state.errorCode ? failureMessages[state.errorCode] : undefined
  return (
    <li className={syncStyles.source}>
      <span className={syncStyles.sourceName}>
        <span className={syncStyles.title}>{title}</span>
        <span className={syncStyles.detail} aria-live="polite">
          {detail}
        </span>
        {state.status === "failed" && !active && (
          <span className={syncStyles.problem}>
            {failure ? failure(title) : "Last sync failed. Try again or check your connection in Settings."}
          </span>
        )}
        {mutation.isError && (
          <span role="alert" className={syncStyles.problem}>
            {errorMessage(mutation.error, "Couldn't start the sync. Try again.")}
          </span>
        )}
      </span>
      <Button variant="outline" size="sm" onClick={startSync} disabled={active} aria-label={`Sync ${title} orders`}>
        <RefreshCw data-icon="inline-start" />
        {active ? "Syncing…" : "Sync"}
      </Button>
    </li>
  )
}

function OrderList({ sources, syncKey }: { sources: SyncState[]; syncKey: string }) {
  const [source, setSource] = useState<SalesSource | "">("")
  const [page, setPage] = useState(0)
  const { currentData, isFetching, isError, error } = salesApi.useSalesOrdersQuery({
    source: source || undefined,
    page,
    syncKey
  })
  const total = currentData?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className={sx({ display: "flex", flexDirection: "column", gap: 4 })}>
      {sources.length > 1 && (
        <div className={styles.filters}>
          <Field>
            <FieldLabel htmlFor="sales-source">Source</FieldLabel>
            <NativeSelect
              id="sales-source"
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
        </div>
      )}
      {isError && <p role="alert">{errorMessage(error, "Orders couldn't be loaded.")}</p>}
      {!currentData && isFetching && <p className={styles.summary}>Loading orders…</p>}
      {currentData && total === 0 && <p className={styles.summary}>No orders copied yet.</p>}
      {currentData && total > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className={styles.numberCell}>Units</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentData.orders.map((order) => (
                <TableRow key={`${order.source}:${order.orderId}`}>
                  <TableCell className={styles.orderCell}>{order.number}</TableCell>
                  <TableCell>
                    <time dateTime={order.orderedAt}>
                      {new Date(order.orderedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                    </time>
                  </TableCell>
                  <TableCell>{titles[order.source]}</TableCell>
                  <TableCell>{order.channel ?? "Not recorded"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{order.status}</Badge>
                  </TableCell>
                  <TableCell className={styles.numberCell}>{order.units}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <nav aria-label="Order pages" className={styles.pager}>
            <p className={styles.summary}>
              Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total.toLocaleString()} orders
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
    </div>
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
    return <p className={styles.summary}>Loading sales…</p>
  }
  if (isError || !currentData) {
    return <p role="alert">{errorMessage(error, "Sales couldn't be loaded.")}</p>
  }
  if (currentData.sources.length === 0) {
    return (
      <p>
        Connect Shopify or Amazon in <Link href="/settings">Settings</Link> to copy your orders.
      </p>
    )
  }
  // Each finished chunk moves the covered period, which reloads the list.
  const syncKey = currentData.sources.map((state) => `${state.coveredTo ?? ""}:${state.orders}`).join("|")
  return (
    <Card>
      <CardHeader>
        <CardTitle>Orders</CardTitle>
        <CardDescription>
          The first sync copies the last 180 days. Later syncs add new orders and recheck the last 30 days.
        </CardDescription>
      </CardHeader>
      <CardContent className={sx({ display: "flex", flexDirection: "column", gap: 6 })}>
        <ul className={syncStyles.sources} aria-label="Sources">
          {currentData.sources.map((state) => (
            <SyncRow key={state.source} state={state} refetch={() => void refetch()} />
          ))}
        </ul>
        <OrderList sources={currentData.sources} syncKey={syncKey} />
      </CardContent>
    </Card>
  )
}
