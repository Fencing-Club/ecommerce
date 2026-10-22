import { useDebouncedValue, useLocalStorage, useWindowEvent } from "@mantine/hooks"
import { skipToken } from "@reduxjs/toolkit/query/react"
import { Link, useLocation } from "@tanstack/react-router"
import {
  AlertTriangle,
  ArrowDownUp,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleAlert,
  Factory,
  ImageOff,
  PackageCheck,
  PackageOpen,
  Search,
  TrendingDown,
  Warehouse,
  X
} from "lucide-react"
import { useState } from "react"
import { useFormatter, useTranslations } from "use-intl"
import { useCan } from "@/components/access"
import { EmptyState, Status, StatusBadge, WarningNote } from "@/components/common"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupNumberInput,
  InputGroupText
} from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useErrorMessage } from "@/hooks/use-error-text"
import type { SupplierOption } from "@/lib/api"
import { api, useSuppliersQuery } from "@/lib/api"
import type { CoverBucket } from "@/lib/cover"
import { coverBucket, isCoverBucket } from "@/lib/cover"
import { cn } from "@/lib/utils"
import type { RestockChannel } from "@/server/restock-plan"
import type { RestockLine } from "@/server/restock-plan"
import type { RestockStatus } from "@/server/restock-plan"
import type { BlockReason } from "@/server/restock-plan"
import { dayRange } from "@/server/restock-report"
import { InfoTip } from "./info-tip"

type Channel = { key: string; label: string; channel: RestockChannel }
type Report = {
  days: number
  leadTimeDays: number
  channel: RestockChannel
  supplier: string
  // Products that need reordering here but have no supplier, so they aren't listed.
  needsSupplier: number
  suppliers: SupplierOption[]
  sources: {
    source: "shopify" | "amazon"
    error: string | null
    window: { from: string; to: string } | null
    gapUnits: number
    gapReasons: Record<string, { units: number; unknownCount: number }>
  }[]
  lines: RestockLine[]
}
type Request = { days: number; leadTimeDays: number; channel: RestockChannel; supplier: string }
// Filters a link (such as one from the Overview) opens Restock with: a channel, a search, a days-of-cover group, or
// only the items to reorder. A link calculates straight away.
type LinkFilters = { channel: string | null; q: string; cover: CoverBucket | null; onlyOrders: boolean }

function linkFilters(params: URLSearchParams | null): LinkFilters {
  const cover = params?.get("cover")
  return {
    channel: params?.get("channel") || null,
    q: params?.get("q") ?? "",
    cover: isCoverBucket(cover) ? cover : null,
    onlyOrders: params?.get("status") === "order"
  }
}

const restockApi = api.injectEndpoints({
  overrideExisting: true,
  endpoints: (build) => ({
    restockChannels: build.query<Channel[], void>({ query: () => "restock/channels" }),
    // A query, though sent as POST, so it's cached and recalculates when suppliers or products change.
    restockPlan: build.query<Report, Request>({
      query: (body) => ({ url: "restock/plan", method: "POST", body }),
      providesTags: ["Supplier", "Restock"]
    })
  })
})

const sourceNames = { shopify: "Shopify", amazon: "Amazon" } as const
// The stock statuses every page shares (Status in common.tsx); the others read as neutral badges, named by their
// message keys.
const stockStatuses: Record<RestockStatus, { status: string } | { label: "blocked" | "notStocked" | "noListing" }> = {
  stockout: { status: "reorder_now" },
  reorder: { status: "reorder_soon" },
  stocked: { status: "in_stock" },
  blocked: { label: "blocked" },
  not_stocked: { label: "notStocked" },
  no_listing: { label: "noListing" }
}
const blockNames = {
  stock_unknown: "stockUnknown",
  demand_unknown: "demandUnknown",
  incoming_unknown: "incomingUnknown",
  sku_ambiguous: "skuAmbiguous"
} as const satisfies Record<BlockReason, string>
const statusRank: Record<RestockStatus, number> = {
  stockout: 0,
  reorder: 1,
  blocked: 2,
  stocked: 3,
  not_stocked: 4,
  no_listing: 5
}
// A PO holds up to 100 lines.
const poLineLimit = 100
// The page's words, numbers and money in the reader's language. Money is in minor units.
function useText() {
  const t = useTranslations("restock")
  const format = useFormatter()
  const separator = useTranslations("common.format")("separator")
  const decimals = (value: number, digits: number) =>
    format.number(value, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  return {
    t,
    number: (value: number) => format.number(value),
    decimals,
    money: (minor: number, currency: string) => format.number(minor / 100, { style: "currency", currency }),
    volume: (volume: number) => t("volume", { value: decimals(volume, 2) }),
    weight: (weight: number) => t("weight", { value: decimals(weight, 1) }),
    // "a, b, c", with the reader's language's separator.
    list: (parts: string[]) => parts.join(separator),
    // "30 or 45".
    either: (parts: string[]) => format.list(parts, { type: "disjunction" })
  }
}
type Text = ReturnType<typeof useText>

// The one mark for a value that doesn't apply. The reason, when it matters, shows on hover and is read out instead.
function Blank({ reason }: { reason?: string }) {
  const t = useTranslations("restock")
  return (
    <span className="text-muted-foreground" title={reason}>
      <span aria-hidden="true">—</span>
      <span className="sr-only">{reason ?? t("none")}</span>
    </span>
  )
}

function Thumbnail({ url }: { url: string | null }) {
  return url ? (
    <img src={url} alt="" width={36} height={36} className="size-9 shrink-0 rounded-md border bg-muted object-cover" />
  ) : (
    <span
      className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground"
      aria-hidden="true"
    >
      <ImageOff className="size-4" />
    </span>
  )
}

// The SKU and, for a multipack, its pieces.
function detail(line: RestockLine, { t }: Text) {
  if (!line.packOf) {
    return line.sku
  }
  return line.sku ? t("skuPack", { sku: line.sku, count: line.packOf }) : t("pack", { count: line.packOf })
}

function Name({ line }: { line: RestockLine }) {
  const text = detail(line, useText())
  return (
    <span className="flex min-w-0 items-center gap-3">
      <Thumbnail url={line.imageUrl} />
      <span className="flex min-w-0 flex-col">
        <span className="font-medium whitespace-normal">
          {line.product}
          {line.variant && <span className="text-muted-foreground">, {line.variant}</span>}
        </span>
        {text && <span className="text-xs text-muted-foreground">{text}</span>}
      </span>
    </span>
  )
}

const isOut = (line: RestockLine) => line.available !== null && line.available <= 0

function blockedText(line: RestockLine, { t, list }: Text) {
  return line.blocked.length
    ? t("blockedBecause", { reasons: list(line.blocked.map((reason) => t(`blockReasons.${blockNames[reason]}`))) })
    : t("statuses.blocked")
}

// Why a line has its status, on hover.
function statusHint(line: RestockLine, text: Text) {
  if (line.status === "stockout" && !isOut(line)) {
    return text.t("runsOut")
  }
  if (line.status === "blocked") {
    return blockedText(line, text)
  }
  return line.status === "not_stocked" ? text.t("notStockedHint") : undefined
}

function LineStatus({ line }: { line: RestockLine }) {
  const text = useText()
  const shown = line.status === "stockout" && isOut(line) ? { status: "out_of_stock" } : stockStatuses[line.status]
  return (
    <span className="inline-flex" title={statusHint(line, text)}>
      {"status" in shown ? (
        <Status status={shown.status} />
      ) : (
        <StatusBadge tone="neutral">{text.t(`statuses.${shown.label}`)}</StatusBadge>
      )}
    </span>
  )
}

// Expected lost sales, per currency: "$1,240", or "" when no line's loss has a price.
function lostText(lines: RestockLine[], { money }: Text) {
  const byCurrency = new Map<string, number>()
  for (const line of lines) {
    if (line.lostSalesMinor && line.priceCurrency) {
      byCurrency.set(line.priceCurrency, (byCurrency.get(line.priceCurrency) ?? 0) + line.lostSalesMinor)
    }
  }
  return [...byCurrency].map(([currency, minor]) => money(minor, currency)).join(" + ")
}

type Step = { label: string; value: string; sign?: "+" | "−" | "="; result?: boolean }
const signNames = { "+": "plus", "−": "minus", "=": "equals" } as const

// How the suggested quantity was reached: the sales rate, then the sum, ending in the quantity to order.
function calculation(line: RestockLine, { t, number, decimals }: Text): Step[] {
  const sold = line.sold ?? 0
  const perDay = sold / line.rateDays
  const steps: Step[] = [
    { label: t("calculation.sold", { days: line.salesDays }), value: number(sold) },
    ...(line.stockoutDays
      ? [{ label: t("calculation.outOfStock"), value: t("days", { count: line.stockoutDays }) }]
      : []),
    { label: t("calculation.salesRate"), value: t("calculation.perDay", { rate: decimals(perDay, 1) }) },
    {
      label: t("calculation.leadTimeNeed", { days: line.leadTimeDays }),
      value: number(Math.ceil((sold * line.leadTimeDays) / line.rateDays))
    }
  ]
  if (line.targetStock) {
    steps.push({
      label: line.targetWhere ? t("calculation.minimumAt", { where: line.targetWhere }) : t("calculation.minimumHere"),
      value: number(line.targetStock),
      sign: "+"
    })
  }
  steps.push(
    { label: t("calculation.available"), value: number(line.available ?? 0), sign: "−" },
    { label: t("calculation.incoming"), value: number(line.incoming ?? 0), sign: "−" }
  )
  // Rounded up past what's needed: to whole cases, or to the minimum order.
  let label = t("calculation.toOrder")
  if (line.purchaseUnits !== null && line.need !== null && line.purchaseUnits !== line.need) {
    label =
      line.caseCount && line.caseQuantity && line.caseQuantity > 1
        ? t("calculation.toOrderCases", { cases: line.caseCount, size: line.caseQuantity })
        : t("calculation.toOrderMinimum")
  }
  steps.push({
    label,
    value: number(line.purchaseUnits ?? line.need ?? 0),
    sign: "=",
    result: true
  })
  return steps
}

// What an order placed today can't prevent: the days out of stock before it arrives, and the sales lost in them, in
// units alone without prices.
function lossSteps(line: RestockLine, prices: boolean, { t, number, money }: Text): Step[] {
  if (!line.lostUnits || !line.lostDays) {
    return []
  }
  const units = t("units", { count: line.lostUnits })
  return [
    { label: t("calculation.daysOut"), value: number(line.lostDays) },
    {
      label: t("calculation.lostSales"),
      value:
        prices && line.lostSalesMinor !== null && line.priceCurrency
          ? t("calculation.lostValue", { amount: money(line.lostSalesMinor, line.priceCurrency), units })
          : units
    }
  ]
}

// Rows of a calculation on the grid of `Explanation`: the label, the operator in its own column, then the figure.
function Steps({ steps, loss = false }: { steps: Step[]; loss?: boolean }) {
  const t = useTranslations("restock.calculation")
  return (
    <dl className="col-span-3 grid grid-cols-subgrid gap-y-1">
      {steps.map((step) => (
        <div
          key={step.label}
          className={cn(
            "col-span-3 grid grid-cols-subgrid items-baseline",
            step.result && "mt-1 border-t pt-2 font-semibold"
          )}
        >
          <dt className={cn(!step.result && "text-muted-foreground")}>{step.label}</dt>
          <dd className="col-span-2 grid grid-cols-subgrid">
            <span className="text-center text-muted-foreground">
              {step.sign && (
                <>
                  <span aria-hidden="true">{step.sign}</span>
                  <span className="sr-only">{t(signNames[step.sign])}</span>
                </>
              )}
            </span>
            <span className={cn("text-end tabular-nums", loss && "text-destructive")}>{step.value}</span>
          </dd>
        </div>
      ))}
    </dl>
  )
}

function Explanation({ line }: { line: RestockLine }) {
  const prices = useCan("prices")
  const text = useText()
  if (line.status === "not_stocked") {
    return <p className="text-sm text-muted-foreground">{text.t("notStockedHint")}</p>
  }
  if (line.status === "blocked") {
    return <p className="text-sm text-muted-foreground">{blockedText(line, text)}</p>
  }
  const loss = lossSteps(line, prices, text)
  return (
    <div className="grid max-w-sm grid-cols-[minmax(0,1fr)_1ch_auto] gap-x-3 text-sm">
      <Steps steps={calculation(line, text)} />
      {loss.length > 0 && (
        <>
          <p className="col-span-3 mt-4 mb-1 text-xs font-medium text-muted-foreground">
            {text.t("calculation.untilArrival")}
          </p>
          <Steps steps={loss} loss />
        </>
      )}
    </div>
  )
}

type Edit = { selected: boolean; units: string }

function orderUnits(line: RestockLine, edit: Edit | undefined) {
  if (edit) {
    const value = Number(edit.units)
    return edit.selected && Number.isInteger(value) && value > 0 ? value : 0
  }
  return line.status === "stockout" || line.status === "reorder" ? (line.purchaseUnits ?? 0) : 0
}

// What the selected lines add up to. Costs are kept per currency; lines without a unit cost or case pack are counted
// so the totals say what they leave out.
function orderTotals(lines: RestockLine[], edits: ReadonlyMap<string, Edit>) {
  const totals = {
    count: 0,
    units: 0,
    cases: 0,
    volume: 0,
    weight: 0,
    unknownSize: 0,
    unknownCost: 0,
    cost: new Map<string, number>()
  }
  for (const line of lines) {
    const ordered = orderUnits(line, edits.get(line.variantId))
    if (!ordered) {
      continue
    }
    totals.count++
    totals.units += ordered
    if (line.casePack) {
      const packs = Math.ceil(ordered / line.casePack.units)
      totals.cases += packs
      totals.volume += (packs * line.casePack.lengthCm * line.casePack.widthCm * line.casePack.heightCm) / 1e6
      totals.weight += packs * (line.casePack.weightKg ?? 0)
    } else {
      totals.unknownSize++
    }
    if (line.unitCostMinor !== null && line.costCurrency) {
      totals.cost.set(line.costCurrency, (totals.cost.get(line.costCurrency) ?? 0) + ordered * line.unitCostMinor)
    } else {
      totals.unknownCost++
    }
  }
  return totals
}
type OrderTotals = ReturnType<typeof orderTotals>

// The cost per currency, or null when no selected line has a unit cost.
function costText(totals: OrderTotals, { money }: Text) {
  const amounts = [...totals.cost].map(([currency, minor]) => money(minor, currency))
  return amounts.length ? amounts.join(" + ") : null
}

// A selection's size for a meta line: lines and units, then cases, volume and weight when case packs are known.
function sizeParts(totals: OrderTotals, { t, volume, weight }: Text) {
  if (!totals.count) {
    return [t("nothingSelected")]
  }
  const parts = [t("lines", { count: totals.count }), t("units", { count: totals.units })]
  if (totals.cases) {
    parts.push(t("cases", { count: totals.cases }), volume(totals.volume))
    if (totals.weight) {
      parts.push(weight(totals.weight))
    }
  }
  return parts
}

function createPoHref(
  lines: RestockLine[],
  edits: ReadonlyMap<string, Edit>,
  channel: RestockChannel,
  supplierId: string | null
) {
  const chosen = lines
    .map((line) => [line.variantId, orderUnits(line, edits.get(line.variantId))] as const)
    .filter(([, units]) => units > 0)
  const included = chosen.slice(0, poLineLimit)
  const params = new URLSearchParams(included.map(([id, units]) => ["variant", `${id}@${units}`]))
  params.set("destination", channel.kind === "amazon" ? "amazon" : "warehouse")
  if (channel.kind === "shopify") {
    params.set("locationId", channel.locationId)
  }
  if (supplierId) {
    params.set("supplierId", supplierId)
  }
  return { href: `/orders/new?${params}`, count: included.length, capped: chosen.length > poLineLimit }
}

function LostSales({ line }: { line: RestockLine }) {
  const { t, money } = useText()
  if (line.lostUnits === null) {
    return <Blank reason={t("rateUnknown")} />
  }
  if (line.lostUnits === 0) {
    return <Blank />
  }
  return line.lostSalesMinor !== null && line.priceCurrency ? (
    <span className="text-destructive">{money(line.lostSalesMinor, line.priceCurrency)}</span>
  ) : (
    <span className="text-muted-foreground" title={t("noShopifyPrice")}>
      {t("units", { count: line.lostUnits })}
    </span>
  )
}

// How long the stock on hand lasts at the sales rate. Days are rounded down, so under a day says so rather than 0.
function StockLeft({ line }: { line: RestockLine }) {
  const t = useTranslations("restock")
  if (isOut(line)) {
    return <Blank reason={t("outOfStock")} />
  }
  if (line.daysRemaining !== null) {
    return line.daysRemaining === 0 ? t("underADay") : t("days", { count: line.daysRemaining })
  }
  return <Blank reason={line.sold === 0 ? t("noSales") : t("unknown")} />
}

function Count({ value }: { value: number | null }) {
  const { t, number } = useText()
  return value === null ? <Blank reason={t("unknown")} /> : number(value)
}

// What the units in the Order column cost; `units` is null for a line that can't be ordered.
function LineCost({ line, units }: { line: RestockLine; units: string | null }) {
  const { t, money } = useText()
  if (units === null) {
    return <Blank />
  }
  return line.estimatedCostMinor !== null && line.costCurrency && line.unitCostMinor !== null ? (
    money(Number(units || 0) * line.unitCostMinor, line.costCurrency)
  ) : (
    <Blank reason={t("noUnitCost")} />
  )
}

// Columns by priority, each shown once the table is wide enough for it beside a product column of at least 16rem, so
// the table never scrolls sideways: status, stock left and available first, then sold, then incoming and lost sales,
// then days out. The calculation under a row has every figure.
const columns = {
  status: "hidden @4xl:table-cell",
  stockLeft: "hidden @4xl:table-cell",
  available: "hidden @4xl:table-cell",
  sold: "hidden @5xl:table-cell",
  incoming: "hidden @6xl:table-cell",
  lostSales: "hidden @6xl:table-cell",
  daysOut: "hidden @7xl:table-cell"
}

function LineRows({
  line,
  edit,
  onEdit,
  expanded,
  onToggle
}: {
  line: RestockLine
  edit: Edit | undefined
  onEdit: (edit: Edit) => void
  expanded: boolean
  onToggle: () => void
}) {
  // Lost sales and costs are money, which a member sees only with prices.
  const prices = useCan("prices")
  const { t, number, money } = useText()
  const orderable = line.status !== "blocked" && line.status !== "not_stocked"
  const suggested = line.purchaseUnits ?? 0
  const current = edit ?? {
    selected: line.status === "stockout" || line.status === "reorder",
    units: String(suggested)
  }
  const label = line.variant ? t("productVariant", { product: line.product, variant: line.variant }) : line.product
  const invalid = current.selected && !(Number.isInteger(Number(current.units)) && Number(current.units) > 0)
  const lost =
    prices && line.lostSalesMinor !== null && line.lostSalesMinor > 0 && line.priceCurrency
      ? money(line.lostSalesMinor, line.priceCurrency)
      : null
  return (
    <>
      <TableRow className="@max-md:flex @max-md:flex-wrap @max-md:items-center @max-md:gap-x-2 @max-md:px-4 @max-md:py-3">
        <TableCell className="w-8 ps-4 @max-md:w-auto @max-md:p-0">
          {orderable && (
            <Checkbox
              checked={current.selected}
              onCheckedChange={(checked) => onEdit({ ...current, selected: checked })}
              aria-label={t("orderLine", { product: label })}
            />
          )}
        </TableCell>
        <TableCell className="@max-md:min-w-0 @max-md:flex-1 @max-md:basis-[calc(100%-2rem)] @max-md:p-0">
          <Name line={line} />
          {/* Until the table is wide enough for their columns, the status, stock left and lost sales show under the
              name. */}
          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 ps-12 text-xs text-muted-foreground @4xl:hidden">
            <LineStatus line={line} />
            {!isOut(line) && line.daysRemaining !== null && <span>{t("daysLeft", { count: line.daysRemaining })}</span>}
            {lost && <span className="text-destructive">{t("lostSales", { amount: lost })}</span>}
          </span>
          {lost && (
            <span className="mt-1 hidden ps-12 text-xs text-destructive @4xl:block @6xl:hidden">
              {t("lostSales", { amount: lost })}
            </span>
          )}
        </TableCell>
        <TableCell className={columns.status}>
          <LineStatus line={line} />
        </TableCell>
        <TableCell className={cn("text-end tabular-nums", columns.stockLeft)}>
          <StockLeft line={line} />
        </TableCell>
        {prices && (
          <TableCell className={cn("text-end tabular-nums", columns.lostSales)}>
            <LostSales line={line} />
          </TableCell>
        )}
        <TableCell className={cn("text-end tabular-nums", columns.sold)}>
          <Count value={line.sold} />
        </TableCell>
        <TableCell className={cn("text-end tabular-nums", columns.daysOut)}>
          <span className={cn(line.stockoutDays === 0 && "text-muted-foreground")}>{number(line.stockoutDays)}</span>
          <span className="sr-only"> {t("ofDays", { days: line.salesDays })}</span>
        </TableCell>
        <TableCell className={cn("text-end tabular-nums", columns.available)}>
          <Count value={line.available} />
        </TableCell>
        <TableCell className={cn("text-end tabular-nums", columns.incoming)}>
          <Count value={line.incoming} />
        </TableCell>
        <TableCell className="text-end @max-md:ms-auto @max-md:p-0">
          {orderable ? (
            <div className="flex flex-col items-end">
              {/* Borderless until hovered or focused, so the column reads as figures rather than a form. */}
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                step={line.caseQuantity ?? 1}
                value={current.units}
                aria-label={t("unitsToOrder", { product: label })}
                aria-invalid={invalid}
                className="h-8 w-20 border-transparent bg-transparent text-end tabular-nums shadow-none hover:bg-input/30 focus-visible:border focus-visible:bg-background dark:bg-transparent dark:hover:bg-input/30 dark:focus-visible:bg-input/30"
                onChange={(event) => onEdit({ selected: true, units: event.target.value })}
              />
              {Number(current.units) !== suggested && (
                <span className="pe-2.5 text-xs text-muted-foreground">
                  {t("suggested", { units: number(suggested) })}
                </span>
              )}
            </div>
          ) : (
            <Blank />
          )}
        </TableCell>
        {prices && (
          <TableCell className="text-end tabular-nums @max-md:p-0">
            <LineCost line={line} units={orderable ? current.units : null} />
          </TableCell>
        )}
        <TableCell className="w-10 pe-4 @max-md:w-auto @max-md:p-0">
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={t("calculationFor", { product: label })}
            title={t("calculation.title")}
          >
            {expanded ? <ChevronDown /> : <ChevronRight className="rtl:rotate-180" />}
          </Button>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="bg-muted/30 hover:bg-muted/30 @max-md:block @max-md:px-4 @max-md:py-3">
          <TableCell className="@max-md:hidden" />
          {/* Spans the columns after the checkbox: four when narrow; when wide, the eleven there can be, which covers
              however many show (a span past the last column adds no width). Without prices, Cost and Lost sales
              aren't among them. */}
          <TableCell colSpan={prices ? 11 : 9} className="hidden py-3 pe-4 whitespace-normal @4xl:table-cell">
            <Explanation line={line} />
          </TableCell>
          <TableCell
            colSpan={prices ? 4 : 3}
            className="py-3 pe-4 whitespace-normal @4xl:hidden @max-md:block @max-md:p-0"
          >
            <Explanation line={line} />
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

// Opens a new PO to the supplier with the selected lines. A supplier only in Shopify is ordered outside Copacker.
function Reorder({ supplierId, po }: { supplierId: string | null; po: ReturnType<typeof createPoHref> }) {
  // Reordering makes a purchase order.
  const reorders = useCan("orders", "edit")
  const t = useTranslations("restock")
  if (!supplierId) {
    return <span className="text-xs text-muted-foreground">{t("orderedOutside")}</span>
  }
  if (!reorders) {
    return null
  }
  return po.count > 0 ? (
    <Button variant="outline" size="sm" nativeButton={false} render={<Link to="." href={po.href} />}>
      {t("reorder")}
    </Button>
  ) : (
    <Button variant="outline" size="sm" disabled>
      {t("reorder")}
    </Button>
  )
}

// A group's name as the button that shows or hides its table, after a chevron that turns while it's open.
function GroupTrigger({ children }: { children: React.ReactNode }) {
  return (
    <CollapsibleTrigger className="group/trigger focus-ring flex items-center gap-2 rounded-sm text-start">
      <ChevronRight
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 in-data-panel-open:rotate-90 rtl:not-in-data-panel-open:rotate-180"
      />
      <span className="underline-offset-4 group-hover/trigger:underline">{children}</span>
    </CollapsibleTrigger>
  )
}

function SupplierGroup({
  groupKey,
  name,
  supplierId,
  lines,
  channel,
  edits,
  setEdit,
  open,
  onOpenChange
}: {
  groupKey: string
  name: string
  // Null for a supplier only in Shopify, ordered outside Copacker, so there's no PO to create.
  supplierId: string | null
  lines: RestockLine[]
  channel: RestockChannel
  edits: ReadonlyMap<string, Edit>
  setEdit: (variantId: string, edit: Edit) => void
  // Collapsed, the group shows only its header: its totals and Reorder. Its selections still count.
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const text = useText()
  const { t } = text
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const prices = useCan("prices")
  const po = createPoHref(lines, edits, channel, supplierId)
  const headingId = `supplier-${groupKey.replace(/[^A-Za-z0-9-]/g, "-")}`
  const leadTimes = [...new Set(lines.map((line) => line.leadTimeDays))]
  const totals = orderTotals(lines, edits)
  const cost = costText(totals, text)
  const lost = prices ? lostText(lines, text) : ""
  const leadTime = t("leadTime", { days: text.either(leadTimes.map(text.number)) })
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} render={<section aria-labelledby={headingId} />}>
      <Card flush>
        <CardHeader className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {/* The cost and Reorder move under the name when both don't fit on one line. */}
          <div className="flex min-w-0 flex-[1_1_18rem] flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-x-2">
              <h2 id={headingId} className="font-semibold">
                <GroupTrigger>{name}</GroupTrigger>
              </h2>
              <span className="text-xs text-muted-foreground">{t("products", { count: lines.length })}</span>
            </div>
            {/* Indented past the chevron, under the name. */}
            <CardDescription className="ps-6 text-xs">
              {text.list([leadTime, ...sizeParts(totals, text), ...(lost ? [t("lostSales", { amount: lost })] : [])])}
            </CardDescription>
          </div>
          {/* Empty without prices or Reorder, and then hidden so it can't wrap onto a line of its own. */}
          <div className="ms-auto flex items-center gap-4 empty:hidden">
            {prices && (
              <div className="flex flex-col items-end">
                <span className="text-xs text-muted-foreground">{t("estimatedCost")}</span>
                <span className="font-semibold tabular-nums">{cost ?? <Blank reason={t("noUnitCosts")} />}</span>
              </div>
            )}
            <Reorder supplierId={supplierId} po={po} />
          </div>
        </CardHeader>
        <CollapsibleContent className="@container">
          <Table framed={false} className="@max-md:block">
            <TableHeader className="@max-md:hidden">
              <TableRow>
                <TableHead className="w-8 ps-4">
                  <span className="sr-only">{t("columns.order")}</span>
                </TableHead>
                <TableHead className="@4xl:min-w-64">{t("columns.product")}</TableHead>
                <TableHead className={columns.status}>{t("columns.status")}</TableHead>
                <TableHead className={cn("text-end", columns.stockLeft)}>{t("columns.stockLeft")}</TableHead>
                {prices && (
                  <TableHead className={cn("text-end", columns.lostSales)} title={t("columns.lostSalesHint")}>
                    {t("columns.lostSales")}
                  </TableHead>
                )}
                <TableHead className={cn("text-end", columns.sold)}>{t("columns.sold")}</TableHead>
                <TableHead className={cn("text-end", columns.daysOut)}>
                  <abbr title={t("columns.daysOutHint")} className="no-underline">
                    {t("columns.daysOut")}
                  </abbr>
                </TableHead>
                <TableHead className={cn("text-end", columns.available)}>{t("columns.available")}</TableHead>
                <TableHead className={cn("text-end", columns.incoming)}>{t("columns.incoming")}</TableHead>
                <TableHead className="pe-5 text-end">{t("columns.order")}</TableHead>
                {prices && <TableHead className="text-end">{t("columns.cost")}</TableHead>}
                <TableHead className="w-10 pe-4">
                  <span className="sr-only">{t("calculation.title")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="@max-md:block">
              {lines.map((line) => (
                <LineRows
                  key={line.variantId}
                  line={line}
                  edit={edits.get(line.variantId)}
                  onEdit={(edit) => setEdit(line.variantId, edit)}
                  expanded={expanded.has(line.variantId)}
                  onToggle={() =>
                    setExpanded((current) => {
                      const next = new Set(current)
                      if (!next.delete(line.variantId)) {
                        next.add(line.variantId)
                      }
                      return next
                    })
                  }
                />
              ))}
            </TableBody>
          </Table>
          {po.capped && (
            <p className="border-t px-4 py-3 text-xs text-muted-foreground">{t("lineLimit", { count: poLineLimit })}</p>
          )}
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}

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
function OrderSummary({ totals, lost }: { totals: OrderTotals; lost: string }) {
  const prices = useCan("prices")
  const text = useText()
  const { t, number } = text
  const cost = costText(totals, text)
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
                {cost ?? <Blank reason={t("noUnitCosts")} />}
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
function EmptyResults({ report, searching }: { report: Report; searching: boolean }) {
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
                    <Name line={line} />
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

type Sort = "urgency" | "quantity" | "name"
const sorts: readonly Sort[] = ["urgency", "quantity", "name"]

function Results({
  report,
  filters,
  search,
  setSearch
}: {
  report: Report
  filters: LinkFilters
  search: string
  setSearch: (value: string) => void
}) {
  const text = useText()
  const { t } = text
  const sortOptions = sorts.map((value) => ({ value, label: t(`sort.${value}`) }))
  const [cover, setCover] = useState(filters.cover)
  const [onlyOrders, setOnlyOrders] = useState(filters.onlyOrders)
  const [query] = useDebouncedValue(search.trim().toLocaleLowerCase(), 200)
  const [sort, setSort] = useLocalStorage<Sort>({ key: "restock-sort", defaultValue: "urgency" })
  const [showAll, setShowAll] = useState(false)
  const [edits, setEdits] = useState<ReadonlyMap<string, Edit>>(new Map())
  // Supplier groups showing their table. All start collapsed to their headers, whose totals and Reorder still use
  // the selections in `edits`.
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(new Set())
  const prices = useCan("prices")
  const salesError = report.sources.some((source) => source.error)
  const matching = report.lines.filter(
    (line) =>
      (!query ||
        line.product.toLocaleLowerCase().includes(query) ||
        line.variant?.toLocaleLowerCase().includes(query) ||
        line.sku?.toLocaleLowerCase().includes(query)) &&
      (!cover || coverBucket(line) === cover) &&
      (!onlyOrders || line.status === "stockout" || line.status === "reorder")
  )
  const noListing = matching.filter((line) => line.status === "no_listing")
  const visible = matching
    .filter(
      (line) =>
        showAll ||
        cover !== null ||
        line.status === "stockout" ||
        line.status === "reorder" ||
        (line.status === "blocked" && !salesError)
    )
    .toSorted((a, b) => {
      if (sort === "name") {
        return `${a.product} ${a.variant ?? ""}`.localeCompare(`${b.product} ${b.variant ?? ""}`)
      }
      if (sort === "quantity") {
        return (b.purchaseUnits ?? -1) - (a.purchaseUnits ?? -1)
      }
      return (
        statusRank[a.status] - statusRank[b.status] ||
        (a.daysRemaining ?? Number.MAX_SAFE_INTEGER) - (b.daysRemaining ?? Number.MAX_SAFE_INTEGER) ||
        (b.purchaseUnits ?? 0) - (a.purchaseUnits ?? 0)
      )
    })
  // Copacker suppliers first, with Reorder; then suppliers only in Shopify, which are ordered outside Copacker.
  const groups = new Map<string, { key: string; name: string; supplierId: string | null; lines: RestockLine[] }>()
  for (const line of visible) {
    const key = line.supplier?.id ?? `shopify:${line.externalSupplier ?? ""}`
    const group = groups.get(key) ?? {
      key,
      name: line.supplier?.name ?? line.externalSupplier ?? "",
      supplierId: line.supplier?.id ?? null,
      lines: []
    }
    group.lines.push(line)
    groups.set(key, group)
  }
  const ordered = [...groups.values()].toSorted(
    (a, b) => Number(a.supplierId === null) - Number(b.supplierId === null) || a.name.localeCompare(b.name)
  )
  const selected = orderTotals(visible, edits)
  // Without prices, the summary shows only once something is selected, and never lost sales.
  const lost = prices ? lostText(visible, text) : ""
  // The toggle expands every group until they're all open, then collapses them all.
  const allOpen = ordered.every((group) => openGroups.has(group.key))
  return (
    <div className="flex flex-col gap-6">
      {(selected.count > 0 || lost) && <OrderSummary totals={selected} lost={lost} />}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <InputGroup className="w-full sm:w-72">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label={t("searchLabel")}
              placeholder={t("searchPlaceholder")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </InputGroup>
          <Select
            items={sortOptions}
            value={sort}
            onValueChange={(value) => {
              if (value) {
                setSort(value)
              }
            }}
          >
            <SelectTrigger aria-label={t("sortBy")}>
              <ArrowDownUp className="text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          {ordered.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              className="ms-auto text-muted-foreground"
              onClick={() => setOpenGroups(allOpen ? new Set() : new Set(ordered.map((group) => group.key)))}
            >
              {allOpen ? <ChevronsDownUp data-icon="inline-start" /> : <ChevronsUpDown data-icon="inline-start" />}
              {allOpen ? t("collapseAll") : t("expandAll")}
            </Button>
          )}
        </div>
        {ordered.length === 0 && <EmptyResults report={report} searching={matching.length < report.lines.length} />}
        {ordered.map((group) => (
          <SupplierGroup
            key={group.key}
            groupKey={group.key}
            name={group.name}
            supplierId={group.supplierId}
            lines={group.lines}
            channel={report.channel}
            open={openGroups.has(group.key)}
            onOpenChange={(open) =>
              setOpenGroups((current) => {
                const next = new Set(current)
                if (open) {
                  next.add(group.key)
                } else {
                  next.delete(group.key)
                }
                return next
              })
            }
            edits={edits}
            setEdit={(variantId, edit) =>
              setEdits((current) => {
                const next = new Map(current)
                next.set(variantId, edit)
                return next
              })
            }
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
function ResultSummary({ report }: { report: Report }) {
  const setsSuppliers = useCan("products", "edit")
  const prices = useCan("prices")
  const { t, list } = useText()
  const errors = report.sources.flatMap(({ source, error }) =>
    error ? [t("sourceError", { source: sourceNames[source], error })] : []
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

// A whole number of days within the supported range, or null.
function wholeDays(text: string) {
  const value = Number(text)
  return Number.isInteger(value) && value >= dayRange.min && value <= dayRange.max ? value : null
}

// A number of days in the toolbar: its label, the number, then "days".
function DaysField({
  id,
  label,
  hint,
  value,
  onChange
}: {
  id: string
  label: string
  hint?: string
  value: string
  onChange: (value: string) => void
}) {
  const t = useTranslations("restock")
  return (
    <InputGroup className="w-auto">
      <InputGroupAddon>
        <label htmlFor={id} title={hint}>
          {label}
        </label>
      </InputGroupAddon>
      <InputGroupNumberInput
        id={id}
        inputMode="numeric"
        min={dayRange.min}
        max={dayRange.max}
        value={value}
        aria-invalid={wholeDays(value) === null}
        onChange={(event) => onChange(event.target.value)}
        className="w-10 flex-none text-center"
      />
      <InputGroupAddon align="inline-end">
        <InputGroupText>{t("daysUnit")}</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  )
}

// `settings` are the workspace's sales period and default lead time (Settings), which the page starts from.
export function RestockReport({ settings }: { settings: { days: number; leadTimeDays: number } }) {
  const t = useTranslations("restock")
  const errorMessage = useErrorMessage()
  // Kept as typed so the fields can be cleared while editing; validated before loading. Changes here are for this
  // visit; the workspace's settings are changed in Settings.
  const [daysText, setDaysText] = useState(String(settings.days))
  const [leadTimeText, setLeadTimeText] = useState(String(settings.leadTimeDays))
  const [channelKey, setChannelKey] = useLocalStorage({ key: "restock-channel", defaultValue: "" })
  const [supplier, setSupplier] = useLocalStorage({ key: "restock-supplier", defaultValue: "all" })
  const days = wholeDays(daysText)
  const leadTimeDays = wholeDays(leadTimeText)
  const { data: channels = [], isLoading: channelsLoading } = restockApi.useRestockChannelsQuery()
  const { data: suppliers = [] } = useSuppliersQuery()
  const params = new URLSearchParams(useLocation({ select: (location) => location.searchStr }))
  const [filters] = useState(() => linkFilters(params))
  // Keep the typed search when a setting replaces the report; order selections still reset with each result.
  const [search, setSearch] = useState(filters.q)
  // The linked channel wins until another is chosen.
  const [linkedChannel, setLinkedChannel] = useState(filters.channel)
  const channel = channels.find((item) => item.key === (linkedChannel ?? channelKey)) ?? channels[0]
  // A remembered choice that no longer exists, such as a removed supplier, falls back to all suppliers.
  const supplierChoice = supplier === "all" || suppliers.some((row) => row.id === supplier)
  const supplierItems = [
    { value: "all", label: t("allSuppliers") },
    ...suppliers.map((row) => ({ value: row.id, label: row.name }))
  ]
  const request: Request | null =
    channel && days !== null && leadTimeDays !== null
      ? { days, leadTimeDays, channel: channel.channel, supplier: supplierChoice ? supplier : "all" }
      : null
  // Suggestions load as soon as the settings are known, and again once typing in them pauses.
  const requestKey = request ? JSON.stringify(request) : ""
  const [settledKey] = useDebouncedValue(requestKey, 500)
  const settled = settledKey && settledKey === requestKey ? request : null
  const [shownKey, setShownKey] = useState("")
  if (settled && shownKey !== settledKey) {
    setShownKey(settledKey)
  }
  const result = restockApi.useRestockPlanQuery(shownKey ? (JSON.parse(shownKey) as Request) : skipToken)
  // Changing a setting recalculates. Stock and sales that sync while the page stays open come in when the window is
  // back in focus after a few minutes.
  useWindowEvent("focus", () => {
    if (shownKey && !result.isFetching && Date.now() - (result.fulfilledTimeStamp ?? 0) > 5 * 60 * 1000) {
      void result.refetch()
    }
  })
  const calculating = !result.currentData && (result.isFetching || (request !== null && !result.isError))
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            items={channels.map((item) => ({ value: item.key, label: item.label }))}
            value={channel?.key ?? null}
            onValueChange={(key) => {
              if (key) {
                setLinkedChannel(null)
                setChannelKey(key)
              }
            }}
            disabled={!channels.length}
          >
            <SelectTrigger aria-label={t("location")} className="min-w-40">
              <Warehouse className="text-muted-foreground" />
              <SelectValue placeholder={channelsLoading ? t("loading") : t("syncFirst")} />
            </SelectTrigger>
            <SelectContent>
              {channels.map((item) => (
                <SelectItem key={item.key} value={item.key}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            items={supplierItems}
            value={supplierChoice ? supplier : "all"}
            onValueChange={(id) => {
              if (id) {
                setSupplier(id)
              }
            }}
          >
            <SelectTrigger aria-label={t("supplier")} className="min-w-40">
              <Factory className="text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {supplierItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DaysField id="restock-days" label={t("salesPeriod")} value={daysText} onChange={setDaysText} />
          <DaysField
            id="restock-lead-time"
            label={t("leadTimeLabel")}
            hint={t("leadTimeHint")}
            value={leadTimeText}
            onChange={setLeadTimeText}
          />
        </div>
        {calculating && <p className="text-sm text-muted-foreground">{t("calculating")}</p>}
        {result.currentData && <ResultSummary report={result.currentData} />}
      </div>
      {result.isError && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>{errorMessage(result.error, t("failed"))}</AlertTitle>
        </Alert>
      )}
      {calculating && <Loading />}
      {result.currentData && (
        <Results key={shownKey} report={result.currentData} filters={filters} search={search} setSearch={setSearch} />
      )}
    </div>
  )
}
