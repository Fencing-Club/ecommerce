import { useDebouncedValue } from "@mantine/hooks"
import { Link } from "@tanstack/react-router"
import { ShoppingBag, ReceiptText, ExternalLink, Repeat, Search } from "lucide-react"
import { useState } from "react"
import { useFormatter, useTranslations } from "use-intl"
import { useCan, useIsAdmin } from "@/components/access"
import { EmptyState, Status } from "@/components/common"
import { PageButtons } from "@/components/list/pager"
import { SearchField } from "@/components/list/search-field"
import { OptionSelect } from "@/components/option-select"
import { Button } from "@/components/ui/button"
import { Card, CardFooter } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useErrorMessage } from "@/hooks/use-error-text"
import { api } from "@/lib/api"
import { storeNames, type Store } from "@/lib/stores"
import { cn } from "@/lib/utils"
import type { SalesOrderSummary } from "@/server/sales-orders"
import type { IntegrationSyncState } from "./integration-sync-card"
import { IntegrationSyncCard } from "./integration-sync-card"
import { SyncedAt, SyncProgress } from "./sync-status"

type ReportCoverage = { windows: { complete: boolean; status: string; checkedAt: string | null }[] }

type SyncState = {
  fees?: { coveredFrom: string | null; coveredTo: string | null; errorCode: string | null }
  returns?: ReportCoverage | null
  reimbursements?: ReportCoverage | null
  storageFees?: { monthly: ReportCoverage; aged: ReportCoverage } | null
  removals?: { orders: ReportCoverage; shipments: ReportCoverage } | null
  source: Store
  externalAccountId: string
  status: "idle" | "queued" | "running" | "failed"
  errorCode: string | null
  coveredFrom: string | null
  coveredTo: string | null
  finishedAt: string | null
  // How much of a first sync's order history is copied, from 0 to 1.
  progress: number | null
  orders: number
  recent: { orders: number; units: number }
}
type OrdersPage = { orders: SalesOrderSummary[]; total: number }

const salesApi = api.injectEndpoints({
  overrideExisting: true,
  endpoints: (build) => ({
    salesStatus: build.query<{ sources: SyncState[] }, void>({ query: () => "sales", keepUnusedDataFor: 0 }),
    salesOrders: build.query<OrdersPage, { source?: Store; page: number; q: string; syncKey: string }>({
      query: ({ source, page, q }) => ({
        url: "sales/orders",
        params: { ...(source ? { source } : {}), ...(q ? { q } : {}), page }
      }),
      keepUnusedDataFor: 0
    }),
    syncSales: build.mutation<{ status: string }, { source: Store }>({
      query: (body) => ({ url: "sales/sync", method: "POST", body })
    })
  })
})

const pageSize = 50

// Orders that closed without a sale: nothing sold, so there are no sales to show.
const closedStatuses = new Set(["Cancelled", "Unfulfillable"])

const settingsLink = (chunks: React.ReactNode) => (
  <Link to="/settings" hash="integrations" className="text-link">
    {chunks}
  </Link>
)
// A count in the summary strip, stronger than the word after it.
const figure = (chunks: React.ReactNode) => <span className="font-medium text-foreground">{chunks}</span>

// Why a source's last sync failed, and what to do about it: the owner and admins reconnect in Settings.
function Failure({ errorCode, title, admin }: { errorCode: string | null; title: string; admin: boolean }) {
  const t = useTranslations("sales.sync")
  if ((errorCode === "reconnect" || errorCode === "shopify_permissions") && !admin) {
    return t("askAdminToReconnect", { source: title })
  }
  if (errorCode === "reconnect" || errorCode === "shopify_permissions") {
    return t.rich("reconnect", { source: title, settings: settingsLink })
  }
  return errorCode === "provider_unavailable" ? t("unreachable", { source: title }) : t("failed")
}

// One source in the summary strip: its sync state and the last 30 days' orders and units. Syncs run on their own; Sync
// now is in the store's Settings.
function SourceSummary({ state }: { state: SyncState }) {
  const t = useTranslations("sales.sync")
  const title = storeNames[state.source]
  const admin = useIsAdmin()
  const active = state.status === "queued" || state.status === "running"
  const syncedAt = state.finishedAt ?? state.coveredTo
  let detail: React.ReactNode = t("notSynced")
  if (active) {
    detail = <SyncProgress progress={state.progress} />
  } else if (state.status === "failed") {
    detail = (
      <span className="text-destructive">
        <Failure errorCode={state.errorCode} title={title} admin={admin} />
      </span>
    )
  } else if (syncedAt) {
    detail = <SyncedAt at={syncedAt} />
  }
  return (
    <li className="@container/source px-4 py-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2">
        <div className="flex min-w-0 flex-col">
          <span className="font-medium">{title}</span>
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {detail}
          </span>
        </div>
        <dl className="flex flex-col">
          <dt className="text-xs text-muted-foreground">{t("last30")}</dt>
          <dd className="flex gap-4 whitespace-nowrap tabular-nums">
            <span className="text-muted-foreground">
              {t.rich("recentOrders", { count: state.recent.orders, figure })}
            </span>
            <span className="text-muted-foreground">
              {t.rich("recentUnits", { count: state.recent.units, figure })}
            </span>
          </dd>
        </dl>
      </div>
    </li>
  )
}

// A store's order sync, polled while its page is open.
export function useOrderSync(source: Store) {
  const { currentData } = salesApi.useSalesStatusQuery(undefined, {
    pollingInterval: 5000,
    skipPollingIfUnfocused: true
  })
  return currentData?.sources.find((item) => item.source === source)
}

// A store's order sync in its Settings: when it last synced or what went wrong, with Sync now.
export function OrdersSyncRow({ source }: { source: Store }) {
  return <SalesSyncCard source={source} />
}

export function FinancialDataSyncCard() {
  return <SalesSyncCard source="amazon" financial />
}

function SalesSyncCard({ source, financial = false }: { source: Store; financial?: boolean }) {
  const t = useTranslations("sales.sync")
  const panel = useTranslations("settings.integrations.panel")
  const errorMessage = useErrorMessage()
  const { currentData, isLoading, isError, refetch } = salesApi.useSalesStatusQuery(undefined, {
    pollingInterval: 5000,
    skipPollingIfUnfocused: true
  })
  const [sync, mutation] = salesApi.useSyncSalesMutation()
  const state = currentData?.sources.find((item) => item.source === source)
  const title = storeNames[source]
  const syncing = mutation.isLoading || state?.status === "queued" || state?.status === "running"
  async function startSync() {
    try {
      await sync({ source }).unwrap()
      void refetch()
    } catch {
      // RTK Query retains the failure for the inline message.
    }
  }
  const syncedAt = state ? (state.finishedAt ?? state.coveredTo) : null
  let syncState: IntegrationSyncState = "idle"
  let text: React.ReactNode = t("notSyncedYet")
  if (isLoading) {
    syncState = "loading"
    text = t("loading")
  } else if (syncing) {
    syncState = state?.status === "queued" ? "queued" : "syncing"
    text = panel(state?.status === "queued" ? "queuedHint" : "syncingHint")
  } else if (mutation.isError) {
    syncState = "failed"
    text = <span className="text-destructive">{errorMessage(mutation.error, t("couldNotStart"))}</span>
  } else if (
    state?.status === "failed" &&
    (!financial || state.errorCode === "reconnect" || state.errorCode === "shopify_permissions")
  ) {
    syncState = "failed"
    text = (
      <span className="text-destructive">
        {state.errorCode === "provider_unavailable" ? t("unreachable", { source: title }) : t("lastFailed")}
      </span>
    )
  } else if (isError) {
    syncState = "unavailable"
    text = undefined
  } else if (financial) {
    const reports = [
      state?.returns,
      state?.reimbursements,
      state?.storageFees?.monthly,
      state?.storageFees?.aged,
      state?.removals?.orders,
      state?.removals?.shipments
    ]
    const windows = reports.flatMap((report) => report?.windows ?? [])
    if (state?.fees?.errorCode || windows.some((window) => window.status === "failed")) {
      syncState = "failed"
      text = t("financialFailed")
    } else if (
      state?.fees?.coveredFrom &&
      state.fees.coveredTo &&
      reports.every(
        (report) => report && report.windows.length > 0 && report.windows.every((window) => window.complete)
      )
    ) {
      syncState = "synced"
      text = t("financialImported")
    } else if (state?.fees?.coveredTo || windows.some((window) => window.checkedAt)) {
      text = t("financialIncomplete")
    }
  } else if (syncedAt) {
    syncState = "synced"
    text = <SyncedAt at={syncedAt} />
  }
  let reconnect: string | null = null
  if (state?.status === "failed" && (state.errorCode === "reconnect" || state.errorCode === "shopify_permissions")) {
    reconnect =
      source === "shopify"
        ? `/api/connections/shopify?shop=${encodeURIComponent(state.externalAccountId)}`
        : `/api/connections/${source}`
  }
  return (
    <IntegrationSyncCard
      title={t(financial ? "financialData" : "orders")}
      label={financial ? t("amazonFinancialData") : t("sourceOrders", { source: title })}
      icon={financial ? <ReceiptText /> : <ShoppingBag />}
      status={syncState}
      detail={text}
      progress={financial ? undefined : state?.progress}
      onSync={() => void startSync()}
      disabled={syncing || isLoading || isError || !state}
      reconnect={reconnect}
    />
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
  const t = useTranslations("sales.list")
  const format = useFormatter()
  if (value) {
    return format.number(value.minor / 100, { style: "currency", currency: value.currency })
  }
  if (order.source === "amazon" && !closedStatuses.has(order.status)) {
    return <Placeholder title={pending}>{t("pending")}</Placeholder>
  }
  return <Placeholder />
}

function Items({ items }: { items: SalesOrderSummary["items"] }) {
  const t = useTranslations("sales.list")
  if (items.length === 0) {
    return <Placeholder />
  }
  const shown = items.slice(0, 3)
  return (
    <ul className="flex flex-col gap-1.5">
      {shown.map((item, index) => (
        <li key={`${item.sku}:${index}`} className="flex flex-col">
          <span>
            {item.name ?? item.sku ?? t("bundle")}{" "}
            <span className="whitespace-nowrap text-muted-foreground">
              {t("quantity", { quantity: item.quantity })}
            </span>
          </span>
          {item.name && item.sku && <span className="text-xs break-all text-muted-foreground">{item.sku}</span>}
        </li>
      ))}
      {items.length > shown.length && (
        <li className="text-xs text-muted-foreground">{t("more", { count: items.length - shown.length })}</li>
      )}
    </ul>
  )
}

// One order. Narrower, channel and status move under the order number; on a phone each order stacks. Its sales and
// fees show only to someone who sees prices; without them, the last column shown keeps the table's right inset.
function OrderRow({ order }: { order: SalesOrderSummary }) {
  const prices = useCan("prices")
  const t = useTranslations("sales.list")
  const format = useFormatter()
  return (
    <TableRow className="group/row @max-md:flex @max-md:flex-col @max-md:gap-2 @max-md:px-4 @max-md:py-3">
      <TableCell className="ps-4 align-top @max-md:p-0">
        <div className="flex flex-col gap-0.5">
          <a
            href={order.url}
            target="_blank"
            rel="noreferrer"
            className="focus-ring inline-flex w-fit items-center gap-1 rounded-sm font-medium whitespace-nowrap underline-offset-4 hover:underline"
          >
            {order.number}
            <ExternalLink
              aria-hidden="true"
              className="size-3 text-muted-foreground opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 pointer-coarse:opacity-100"
            />
            <span className="sr-only"> {t("opensIn", { source: storeNames[order.source] })}</span>
          </a>
          <time dateTime={order.orderedAt} className="text-xs text-muted-foreground">
            {format.dateTime(new Date(order.orderedAt), { dateStyle: "medium", timeStyle: "short" })}
          </time>
          {order.replacementOf && (
            <span className="flex items-center gap-1 text-xs whitespace-normal text-muted-foreground">
              <Repeat aria-hidden="true" className="size-3 shrink-0" />
              {t("replacementFor", { order: order.replacementOf })}
            </span>
          )}
          <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground @2xl:hidden">
            {order.channel}
            <Status status={order.status} labels="sales" />
          </span>
        </div>
      </TableCell>
      <TableCell
        className={cn("min-w-40 align-top whitespace-normal @max-md:min-w-0 @max-md:p-0", !prices && "pe-4 @2xl:pe-2")}
      >
        <Items items={order.items} />
      </TableCell>
      <TableCell className="hidden align-top @2xl:table-cell">{order.channel}</TableCell>
      <TableCell className="hidden align-top @2xl:table-cell">
        <Status status={order.status} labels="sales" />
      </TableCell>
      <TableCell className={cn("hidden text-end align-top tabular-nums @2xl:table-cell", !prices && "pe-4")}>
        {format.number(order.units)}
      </TableCell>
      {prices && (
        <>
          <TableCell className="pe-4 text-end align-top tabular-nums @2xl:pe-2 @max-md:p-0 @max-md:text-start">
            {closedStatuses.has(order.status) ? (
              <Placeholder />
            ) : (
              <Amount order={order} value={order.sales} pending={t("salesPending")} />
            )}
          </TableCell>
          <TableCell className="hidden pe-4 text-end align-top tabular-nums @2xl:table-cell">
            <Amount order={order} value={order.fees} pending={t("feesPending")} />
          </TableCell>
        </>
      )}
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
  const t = useTranslations("sales.list")
  const pager = useTranslations("common.list.pager")
  const errorMessage = useErrorMessage()
  const [source, setSource] = useState<Store | "all">("all")
  // The page shown, counting from 1.
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState(initialSearch)
  const [q] = useDebouncedValue(search.trim(), 300)
  const prices = useCan("prices")
  // The last page loaded stays on screen while the next one loads.
  const { data, isFetching, isError, error } = salesApi.useSalesOrdersQuery({
    source: source === "all" ? undefined : source,
    page: page - 1,
    q,
    syncKey
  })
  const total = data?.total ?? 0
  // A source whose sync is running, preferring one that's copying its history for the first time.
  const running = sources.filter((state) => state.status === "queued" || state.status === "running")
  const firstSync = running.find((state) => state.progress !== null) ?? running[0]
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const sourceItems = [
    { value: "all" as const, label: t("allSources") },
    ...sources.map((state) => ({ value: state.source, label: storeNames[state.source] }))
  ]
  let body: React.ReactNode
  if (isError) {
    body = (
      <p role="alert" className="p-4 text-destructive">
        {errorMessage(error, t("loadFailed"))}
      </p>
    )
  } else if (!data) {
    body = (
      <div className="flex flex-col gap-3 p-4">
        <span className="sr-only">{t("loading")}</span>
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    )
  } else if (total === 0 && !q && firstSync) {
    // The first sync is still copying: the orders appear here period by period.
    body = (
      <EmptyState
        icon={<Spinner className="size-5" />}
        title={t("syncing")}
        description={typeof firstSync.progress === "number" ? t("copied", { progress: firstSync.progress }) : undefined}
      />
    )
  } else if (total === 0) {
    body = <EmptyState icon={q ? <Search aria-hidden /> : undefined} title={q ? t("noMatches") : t("empty")} />
  } else {
    body = (
      <div
        aria-busy={isFetching}
        className={cn("@container transition-opacity", isFetching ? "opacity-60 delay-300" : "delay-0")}
      >
        <Table framed={false} aria-label={t("label")} className="@max-md:block">
          <TableHeader className="@max-md:hidden">
            <TableRow>
              <TableHead className="ps-4">{t("order")}</TableHead>
              <TableHead className={cn("w-full", !prices && "pe-4 @2xl:pe-2")}>{t("items")}</TableHead>
              <TableHead className="hidden @2xl:table-cell">{t("channel")}</TableHead>
              <TableHead className="hidden @2xl:table-cell">{t("status")}</TableHead>
              <TableHead className={cn("hidden text-end @2xl:table-cell", !prices && "pe-4")}>{t("units")}</TableHead>
              {prices && (
                <>
                  <TableHead className="pe-4 text-end @2xl:pe-2" title={t("salesHint")}>
                    {t("sales")}
                  </TableHead>
                  <TableHead className="hidden pe-4 text-end @2xl:table-cell">{t("fees")}</TableHead>
                </>
              )}
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
    <Card flush>
      <div className="flex flex-wrap items-center gap-2 border-b p-4">
        <SearchField
          label={t("searchLabel")}
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(value) => {
            setSearch(value)
            setPage(1)
          }}
          className="min-w-48 flex-1 sm:max-w-sm"
        />
        {sources.length > 1 && (
          <OptionSelect
            options={sourceItems}
            value={source}
            onChange={(value) => {
              setSource(value)
              setPage(1)
            }}
            label={t("source")}
            className="w-32"
          />
        )}
      </div>
      {body}
      {data && !isError && total > 0 && (
        <CardFooter className="flex-wrap justify-between gap-3 py-3">
          <p className="text-muted-foreground tabular-nums">
            {pager("range", { first: (page - 1) * pageSize + 1, last: Math.min(page * pageSize, total), total })}
          </p>
          {totalPages > 1 && (
            <nav aria-label={t("pages")} className="flex items-center gap-2">
              <PageButtons page={page} pages={totalPages} onPage={setPage} words />
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
  const t = useTranslations("sales.list")
  const errorMessage = useErrorMessage()
  const { currentData, isLoading, error } = salesApi.useSalesStatusQuery(undefined, {
    pollingInterval: 5000,
    skipPollingIfUnfocused: true
  })
  // The owner and admins connect stores; everyone else is told who can.
  const admin = useIsAdmin()
  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <span className="sr-only">{t("loading")}</span>
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    )
  }
  // A failed poll keeps the last status on screen.
  if (!currentData) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {errorMessage(error, t("loadFailed"))}
      </p>
    )
  }
  if (currentData.sources.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<ShoppingBag aria-hidden />}
          title={admin ? t("connect") : t("noStore")}
          description={admin ? undefined : t("askAdminToConnect")}
        >
          {admin && (
            <Button nativeButton={false} render={<Link to="/settings" hash="integrations" />}>
              {t("goToSettings")}
            </Button>
          )}
        </EmptyState>
      </Card>
    )
  }
  // Each finished period moves the covered range, which reloads the list.
  const syncKey = currentData.sources.map((state) => `${state.coveredTo ?? ""}:${state.orders}`).join("|")
  return (
    <div className="flex flex-col gap-4">
      <Card flush className="@container/sources">
        <ul
          aria-label={t("sources")}
          className="grid divide-y @3xl/sources:auto-cols-fr @3xl/sources:grid-flow-col @3xl/sources:divide-x @3xl/sources:divide-y-0"
        >
          {currentData.sources.map((state) => (
            <SourceSummary key={state.source} state={state} />
          ))}
        </ul>
      </Card>
      {/* Keyed by the starting search, so a new search from the header replaces the current one. */}
      <OrderList key={initialSearch} sources={currentData.sources} syncKey={syncKey} initialSearch={initialSearch} />
    </div>
  )
}
