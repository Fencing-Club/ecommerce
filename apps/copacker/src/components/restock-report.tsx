import { useDebouncedValue, useLocalStorage, useMap, useSet, useWindowEvent } from "@mantine/hooks"
import { skipToken } from "@reduxjs/toolkit/query/react"
import { Link } from "@tanstack/react-router"
import {
  AlertTriangle,
  ArrowDownUp,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleAlert,
  PackageCheck,
  PackageOpen,
  Search,
  TrendingDown,
  X
} from "lucide-react"
import { useState } from "react"
import { useTranslations } from "use-intl"
import { useCan } from "@/components/access"
import { EmptyState, WarningNote } from "@/components/common"
import { SearchField } from "@/components/list/search-field"
import { NoValue } from "@/components/no-value"
import { OptionSelect } from "@/components/option-select"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible"
import { Field, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useErrorMessage } from "@/hooks/use-error-text"
import { api, useSuppliersQuery } from "@/lib/api"
import type { CoverBucket } from "@/lib/cover"
import type { RestockSearch } from "@/lib/page-search"
import {
  type LineEdit,
  listedLines,
  lostSales,
  matchingLines,
  type OrderTotals,
  orderTotals,
  reportKey,
  type RestockReportData,
  type RestockRequest,
  type RestockSort,
  restockSorts,
  supplierGroups,
  wholeDays
} from "@/lib/restock-selection"
import { storeNames } from "@/lib/stores"
import type { RestockChannelOption } from "@/server/restock-page"
import type { RestockLine, RestockStatus } from "@/server/restock-plan"
import { InfoTip } from "./info-tip"
import { Count, LineName, useRestockText } from "./restock-line"
import { GroupTrigger, RestockSupplierGroup } from "./restock-supplier-group"
import { RestockToolbar } from "./restock-toolbar"

// Filters a link (such as one from the Overview) opens Restock with: a channel, a search, a days-of-cover group, or
// only the items to reorder. A link calculates straight away.
type LinkFilters = { channel: string | null; q: string; cover: CoverBucket | null; onlyOrders: boolean }

function linkFilters(link: RestockSearch): LinkFilters {
  return {
    channel: link.channel || null,
    q: link.q ?? "",
    cover: link.cover ?? null,
    onlyOrders: link.status === "order"
  }
}

const restockApi = api.injectEndpoints({
  overrideExisting: true,
  endpoints: (build) => ({
    restockChannels: build.query<RestockChannelOption[], void>({ query: () => "restock/channels" }),
    // A query, though sent as POST, so it's cached and recalculates when suppliers or products change.
    restockPlan: build.query<RestockReportData, RestockRequest>({
      query: (body) => ({ url: "restock/plan", method: "POST", body }),
      providesTags: ["Supplier", "Restock"]
    })
  })
})

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium tabular-nums">{value}</dd>
    </div>
  )
}

// What the selected lines of every supplier add up to, and the sales expected to be lost before reorders arrive.
// Without prices, it's only the selection's size.
function OrderSummary({ totals, lost }: { totals: OrderTotals; lost: string | null }) {
  const prices = useCan("prices")
  const text = useRestockText()
  const { t, number } = text
  const cost = text.amounts(totals.cost)
  const noUnitCost = prices ? totals.unknownCost : 0
  const noCaseCount = totals.cases > 0 ? totals.unknownSize : 0
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4" aria-live="polite">
          {prices && (
            <div className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">{t("estimatedCost")}</span>
              <span className="text-3xl font-semibold tracking-tight tabular-nums">
                {cost ?? <NoValue reason={t("noUnitCosts")} />}
              </span>
            </div>
          )}
          <dl className="flex flex-wrap gap-x-8 gap-y-3">
            <Stat label={t("summary.lines")} value={number(totals.count)} />
            <Stat label={t("summary.units")} value={number(totals.units)} />
            {totals.cases > 0 && <Stat label={t("summary.cases")} value={number(totals.cases)} />}
            {totals.cases > 0 && <Stat label={t("summary.volume")} value={text.volume(totals.volume)} />}
            {totals.weight > 0 && <Stat label={t("summary.weight")} value={text.weight(totals.weight)} />}
          </dl>
        </div>
        {(noUnitCost > 0 || noCaseCount > 0) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {noUnitCost > 0 && <WarningNote>{t("summary.withoutCost", { count: noUnitCost })}</WarningNote>}
            {noCaseCount > 0 && <WarningNote>{t("summary.withoutCasePack", { count: noCaseCount })}</WarningNote>}
          </div>
        )}
        {lost && (
          <Alert variant="destructive" role="note">
            <TrendingDown />
            <AlertTitle>{t("summary.lost", { amount: lost })}</AlertTitle>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

// Why nothing is listed. A supplier filter shows only products linked to that supplier, which can be none yet.
function EmptyResults({ report, searching }: { report: RestockReportData; searching: boolean }) {
  // Suppliers are set on the Products page, by those who can change products.
  const setsSuppliers = useCan("products", "edit")
  const t = useTranslations("restock.empty")
  const supplier = report.supplier !== "all" && report.lines.length === 0
  let title = t("nothing")
  let Icon = PackageCheck
  if (searching) {
    title = t("noMatches")
    Icon = Search
  } else if (supplier) {
    const name = report.suppliers.find((row) => row.id === report.supplier)?.name
    title = name ? t("noLinked", { supplier: name }) : t("noLinkedHere")
    Icon = PackageOpen
  }
  return (
    <Card>
      <EmptyState icon={<Icon aria-hidden />} title={title} description={searching ? t("onlyWithSupplier") : undefined}>
        {(searching || supplier) && setsSuppliers && (
          <Button variant="outline" size="sm" nativeButton={false} render={<Link to="/products" />}>
            {t("setSuppliers")}
          </Button>
        )}
      </EmptyState>
    </Card>
  )
}

// Items Shopify says to keep at Amazon, but Amazon has no inventory for: there's nothing to send stock to yet.
function NoListing({ lines }: { lines: RestockLine[] }) {
  const t = useTranslations("restock")
  const [open, setOpen] = useState(false)
  if (!lines.length) {
    return null
  }
  return (
    <Collapsible open={open} onOpenChange={setOpen} render={<section aria-labelledby="restock-no-listing" />}>
      <Card flush>
        <CardHeader className="flex flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-x-2">
            <h2 id="restock-no-listing" className="font-semibold">
              <GroupTrigger>{t("statuses.noListing")}</GroupTrigger>
            </h2>
            <AlertTriangle className="size-3.5 text-warning" aria-hidden="true" />
            <span className="text-xs text-muted-foreground">{t("products", { count: lines.length })}</span>
          </div>
          <CardDescription className="ps-6 text-xs">{t("noListingHint")}</CardDescription>
        </CardHeader>
        <CollapsibleContent>
          <Table framed={false}>
            <TableHeader>
              <TableRow>
                <TableHead className="ps-4">{t("columns.product")}</TableHead>
                <TableHead className="text-end">{t("columns.minimumAtAmazon")}</TableHead>
                <TableHead className="pe-4 text-end">{t("columns.sold")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => (
                <TableRow key={line.variantId}>
                  <TableCell className="ps-4">
                    <LineName line={line} />
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    <Count value={line.targetStock} />
                  </TableCell>
                  <TableCell className="pe-4 text-end tabular-nums">
                    <Count value={line.sold} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}

// One report's suggestions by supplier, with the selections' totals, and the search, sort and filters above them.
// Keyed by its report, so a new report starts its selections afresh.
function Results({
  report,
  filters,
  search,
  setSearch
}: {
  report: RestockReportData
  filters: LinkFilters
  search: string
  setSearch: (value: string) => void
}) {
  const text = useRestockText()
  const { t } = text
  const [cover, setCover] = useState(filters.cover)
  const [onlyOrders, setOnlyOrders] = useState(filters.onlyOrders)
  const [query] = useDebouncedValue(search, 200)
  const [sort, setSort] = useLocalStorage<RestockSort>({ key: "restock-sort", defaultValue: "urgency" })
  const [showAll, setShowAll] = useState(false)
  const edits = useMap<string, LineEdit>()
  // Supplier groups showing their table. All start collapsed to their headers, whose totals and Reorder still use
  // the selections in `edits`.
  const openGroups = useSet<string>()
  const prices = useCan("prices")
  const salesError = report.sources.some((source) => source.error)
  const matching = matchingLines(report.lines, { query, cover, onlyOrders })
  const noListing = matching.filter((line) => line.status === "no_listing")
  const listed = listedLines(matching, { showAll, cover, salesError, sort })
  const groups = supplierGroups(listed)
  const selected = orderTotals(listed, edits)
  // Without prices, the summary shows only once something is selected, and never lost sales.
  const lost = prices ? text.amounts(lostSales(listed)) : null
  // The toggle expands every group until they're all open, then collapses them all.
  const allOpen = groups.every((group) => openGroups.has(group.key))
  return (
    <div className="flex flex-col gap-6">
      {(selected.count > 0 || lost) && <OrderSummary totals={selected} lost={lost} />}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <SearchField
            label={t("searchLabel")}
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={setSearch}
            className="w-full sm:w-72"
          />
          <OptionSelect
            options={restockSorts.map((value) => ({ value, label: t(`sort.${value}`) }))}
            value={sort}
            onValueChange={setSort}
            label={t("sortBy")}
            icon={<ArrowDownUp className="text-muted-foreground" />}
          />
          <Field orientation="horizontal" className="w-auto ps-1">
            <Checkbox id="restock-show-all" checked={showAll} onCheckedChange={setShowAll} />
            <FieldLabel htmlFor="restock-show-all" className="font-normal">
              {t("showAll")}
            </FieldLabel>
          </Field>
          {cover && (
            <Button variant="outline" size="sm" onClick={() => setCover(null)}>
              {t("coverFilter", { cover: t(`cover.${cover}`) })}
              <X data-icon="inline-end" aria-hidden />
              <span className="sr-only">{t("clearFilter")}</span>
            </Button>
          )}
          {onlyOrders && (
            <Button variant="outline" size="sm" onClick={() => setOnlyOrders(false)}>
              {t("itemsToReorder")}
              <X data-icon="inline-end" aria-hidden />
              <span className="sr-only">{t("clearFilter")}</span>
            </Button>
          )}
          {groups.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              className="ms-auto text-muted-foreground"
              onClick={() => {
                openGroups.clear()
                if (!allOpen) {
                  for (const group of groups) {
                    openGroups.add(group.key)
                  }
                }
              }}
            >
              {allOpen ? <ChevronsDownUp data-icon="inline-start" /> : <ChevronsUpDown data-icon="inline-start" />}
              {allOpen ? t("collapseAll") : t("expandAll")}
            </Button>
          )}
        </div>
        {groups.length === 0 && <EmptyResults report={report} searching={matching.length < report.lines.length} />}
        {groups.map((group) => (
          <RestockSupplierGroup
            key={group.key}
            groupKey={group.key}
            name={group.name}
            supplierId={group.supplierId}
            lines={group.lines}
            channel={report.channel}
            open={openGroups.has(group.key)}
            onOpenChange={(open) => {
              if (open) {
                openGroups.add(group.key)
              } else {
                openGroups.delete(group.key)
              }
            }}
            edits={edits}
            setEdit={(variantId, edit) => edits.set(variantId, edit)}
          />
        ))}
        <NoListing lines={noListing} />
      </div>
    </div>
  )
}

const productsLink = (chunks: React.ReactNode) => (
  <Link to="/products" className="text-link hover:text-muted-foreground">
    {chunks}
  </Link>
)

// The result in a line under the settings, or why the sales it needs couldn't be read; and the products left out
// for having no supplier.
function ResultSummary({ report }: { report: RestockReportData }) {
  const setsSuppliers = useCan("products", "edit")
  const prices = useCan("prices")
  const { t, list } = useRestockText()
  const errors = report.sources.flatMap(({ source, error }) =>
    error ? [t("sourceError", { source: storeNames[source], error })] : []
  )
  const count = (statuses: RestockStatus[]) => report.lines.filter((line) => statuses.includes(line.status)).length
  const blocked = count(["blocked"])
  const summary = list([
    t("result.toReorder", { count: count(["stockout", "reorder"]) }),
    ...(blocked > 0 ? [t("result.blocked", { count: blocked })] : []),
    t("result.enough", { count: count(["stocked", "not_stocked"]) })
  ])
  return (
    <>
      {errors.length ? (
        errors.map((error) => (
          <Alert key={error} variant="destructive">
            <CircleAlert />
            <AlertTitle>{error}</AlertTitle>
          </Alert>
        ))
      ) : (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {summary}
          <InfoTip label={t("result.howLabel")}>
            {t("result.how", { days: report.days, prices: prices ? "yes" : "no" })}
          </InfoTip>
        </p>
      )}
      {report.needsSupplier > 0 && setsSuppliers && (
        <WarningNote>{t.rich("needsSupplier", { count: report.needsSupplier, link: productsLink })}</WarningNote>
      )}
    </>
  )
}

// Placeholder rows while the suggestions are calculated.
function Loading() {
  return (
    <Card flush aria-hidden="true">
      <div className="border-b p-4">
        <Skeleton className="h-5 w-48" />
      </div>
      {["a", "b", "c", "d"].map((key) => (
        <div key={key} className="flex items-center gap-3 border-b px-4 py-3 last:border-0">
          <Skeleton className="size-4" />
          <Skeleton className="size-9" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="ms-auto h-4 w-16" />
        </div>
      ))}
    </Card>
  )
}

// `settings` are the workspace's sales period and default lead time (Settings), which the page starts from, and `link`
// the filters in the URL it was opened with.
export function RestockReport({
  settings,
  link = {}
}: {
  settings: { days: number; leadTimeDays: number }
  link?: RestockSearch
}) {
  const t = useTranslations("restock")
  const errorMessage = useErrorMessage()
  // Kept as typed so the fields can be cleared while editing. Changes here are for this visit; the workspace's
  // settings are changed in Settings.
  const [daysText, setDaysText] = useState(String(settings.days))
  const [leadTimeText, setLeadTimeText] = useState(String(settings.leadTimeDays))
  // Typing in the days recalculates once it pauses.
  const [settledDays] = useDebouncedValue(daysText, 500)
  const [settledLeadTime] = useDebouncedValue(leadTimeText, 500)
  const [channelKey, setChannelKey] = useLocalStorage({ key: "restock-channel", defaultValue: "" })
  const [supplier, setSupplier] = useLocalStorage({ key: "restock-supplier", defaultValue: "all" })
  const { data: channels = [], isLoading: channelsLoading } = restockApi.useRestockChannelsQuery()
  const { data: suppliers = [], isLoading: suppliersLoading } = useSuppliersQuery()
  const [filters] = useState(() => linkFilters(link))
  // Keep the typed search when a setting replaces the report; order selections still reset with each result.
  const [search, setSearch] = useState(filters.q)
  // The linked channel wins until another is chosen.
  const [linkedChannel, setLinkedChannel] = useState(filters.channel)
  const channel = channels.find((item) => item.key === (linkedChannel ?? channelKey)) ?? channels[0]
  // A remembered choice that no longer exists, such as a removed supplier, falls back to all suppliers. Until the
  // suppliers load, it's unknown.
  let supplierChoice: string | null = supplier
  if (supplier !== "all" && !suppliers.some((row) => row.id === supplier)) {
    supplierChoice = suppliersLoading ? null : "all"
  }
  const days = wholeDays(settledDays)
  const leadTimeDays = wholeDays(settledLeadTime)
  // Suggestions load as soon as the settings are known. While a day isn't a whole number, the last report stays.
  const request: RestockRequest | typeof skipToken =
    channel && supplierChoice !== null && days !== null && leadTimeDays !== null
      ? { days, leadTimeDays, channel: channel.channel, supplier: supplierChoice }
      : skipToken
  const result = restockApi.useRestockPlanQuery(request)
  const report = request === skipToken ? result.data : result.currentData
  // Changing a setting recalculates. Stock and sales that sync while the page stays open come in when the window is
  // back in focus after a few minutes.
  useWindowEvent("focus", () => {
    if (request !== skipToken && !result.isFetching && Date.now() - (result.fulfilledTimeStamp ?? 0) > 5 * 60 * 1000) {
      void result.refetch()
    }
  })
  // Calculating, or about to once the suppliers load.
  const settled = channel !== undefined && days !== null && leadTimeDays !== null
  const calculating = !report && (result.isFetching || (settled && !result.isError))
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <RestockToolbar
          channels={channels}
          channelsLoading={channelsLoading}
          channel={channel?.key ?? null}
          onChannelChange={(key) => {
            setLinkedChannel(null)
            setChannelKey(key)
          }}
          suppliers={suppliers}
          supplier={supplierChoice ?? "all"}
          onSupplierChange={setSupplier}
          days={daysText}
          onDaysChange={setDaysText}
          leadTimeDays={leadTimeText}
          onLeadTimeDaysChange={setLeadTimeText}
        />
        {calculating && <p className="text-sm text-muted-foreground">{t("calculating")}</p>}
        {report && <ResultSummary report={report} />}
      </div>
      {result.isError && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>{errorMessage(result.error, t("failed"))}</AlertTitle>
        </Alert>
      )}
      {calculating && <Loading />}
      {report && (
        <Results key={reportKey(report)} report={report} filters={filters} search={search} setSearch={setSearch} />
      )}
    </div>
  )
}
