"use client"

import { useDebouncedValue, useLocalStorage } from "@mantine/hooks"
import { skipToken } from "@reduxjs/toolkit/query/react"
import { money } from "@repo/aisle"
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  CircleMinus,
  Clock,
  ImageOff,
  RefreshCw,
  Search,
  X
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useState } from "react"
import { WarningNote } from "@/components/common"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, errorMessage, type SupplierOption, useSuppliersQuery } from "@/lib/api"
import { type CoverBucket, coverBucket, coverBuckets, isCoverBucket } from "@/lib/cover"
import { cn } from "@/lib/utils"
import type { BlockReason, RestockChannel, RestockLine, RestockStatus } from "@/server/restock-plan"
import { dayRange } from "@/server/restock-report"
import { InfoTip } from "./info-tip"
import * as styles from "./restock-report.css"
import { sx } from "@/styles/sprinkles.css"
import { srOnly } from "@/styles/utilities.css"

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
const statusLabels: Record<RestockStatus, string> = {
  stockout: "Runs out before it arrives",
  reorder: "Reorder",
  stocked: "Enough stock",
  blocked: "Can’t calculate",
  not_stocked: "Not stocked at Amazon",
  no_listing: "No Amazon listing"
}
const blockNames: Record<BlockReason, string> = {
  stock_unknown: "the stock count is unknown",
  demand_unknown: "its sales couldn’t be counted",
  incoming_unknown: "incoming stock is unknown",
  sku_ambiguous: "its SKU matches more than one product"
}
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

function Thumbnail({ url }: { url: string | null }) {
  return url ? (
    <Image
      src={url}
      alt=""
      width={36}
      height={36}
      unoptimized
      className="size-9 shrink-0 rounded-md border bg-muted object-cover"
    />
  ) : (
    <span
      className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground"
      aria-hidden="true"
    >
      <ImageOff className="size-4" />
    </span>
  )
}

function Name({ line }: { line: RestockLine }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <Thumbnail url={line.imageUrl} />
      <span className="flex min-w-0 flex-col">
        <span className="font-medium whitespace-normal">
          {line.product}
          {line.variant && <span className="text-muted-foreground">, {line.variant}</span>}
        </span>
        <span className="text-xs text-muted-foreground">
          {line.sku ?? "No SKU"}
          {line.packOf && `, pack of ${line.packOf}`}
        </span>
      </span>
    </span>
  )
}

// A line's status as an outline badge with an icon, as in shadcn's data table, so urgency reads without shouting.
const statusIcons: Record<RestockStatus, React.ReactNode> = {
  stockout: <CircleAlert className="text-destructive" />,
  reorder: <Clock className="text-primary" />,
  stocked: <CircleCheck className="text-success" />,
  blocked: <CircleHelp />,
  not_stocked: <CircleMinus />,
  no_listing: <CircleMinus />
}

const isOut = (line: RestockLine) => line.available !== null && line.available <= 0

function StatusBadge({ line }: { line: RestockLine }) {
  return (
    <Badge variant="outline" className="gap-1 px-1.5 text-muted-foreground">
      {statusIcons[line.status]}
      {line.status === "stockout" && isOut(line) ? "Out of stock" : statusLabels[line.status]}
    </Badge>
  )
}

// Expected lost sales, per currency: "$1,240" or "Unknown" when a line's price isn't known.
function lostText(lines: RestockLine[]) {
  const byCurrency = new Map<string, number>()
  for (const line of lines) {
    if (line.lostSalesMinor && line.priceCurrency) {
      byCurrency.set(line.priceCurrency, (byCurrency.get(line.priceCurrency) ?? 0) + line.lostSalesMinor)
    }
  }
  return [...byCurrency].map(([currency, minor]) => money(minor, currency)).join(" + ")
}

type Step = { label: string; value?: string; sign?: "+" | "−" | "="; tone?: "result" | "heading" | "loss" }

// How the suggested quantity was reached, as a short breakdown: each figure on its own row, the order in bold.
function breakdown(line: RestockLine): Step[] {
  const sold = line.sold ?? 0
  const perDay = sold / line.rateDays
  const steps: Step[] = [
    { label: `Sold in ${line.salesDays} days`, value: String(sold) },
    ...(line.stockoutDays ? [{ label: "Out of stock during that time", value: `${line.stockoutDays} days` }] : []),
    { label: "Sales rate", value: `${perDay.toFixed(1)} a day` },
    {
      label: `Needed for the ${line.leadTimeDays}-day lead time`,
      value: String(Math.ceil((sold * line.leadTimeDays) / line.rateDays))
    }
  ]
  if (line.targetStock) {
    steps.push({
      label: `Minimum stock at ${line.targetWhere ?? "this location"}`,
      value: String(line.targetStock),
      sign: "+"
    })
  }
  steps.push(
    { label: "Available", value: String(line.available ?? 0), sign: "−" },
    { label: "Incoming and on order", value: String(line.incoming ?? 0), sign: "−" }
  )
  // Rounded up past what's needed: to whole cases, or to the minimum order.
  let rounded = ""
  if (line.purchaseUnits !== null && line.need !== null && line.purchaseUnits !== line.need) {
    rounded =
      line.caseCount && line.caseQuantity && line.caseQuantity > 1
        ? ` (${line.caseCount} cases of ${line.caseQuantity})`
        : " (minimum order)"
  }
  steps.push({
    label: `To order${rounded}`,
    value: String(line.purchaseUnits ?? line.need ?? 0),
    sign: "=",
    tone: "result"
  })
  if (line.lostUnits && line.lostDays) {
    const units = `${line.lostUnits} ${line.lostUnits === 1 ? "unit" : "units"}`
    steps.push(
      { label: "Until an order placed today arrives", tone: "heading" },
      { label: "Days out of stock", value: String(line.lostDays), tone: "loss" },
      {
        label: "Lost sales",
        value:
          line.lostSalesMinor !== null && line.priceCurrency
            ? `${money(line.lostSalesMinor, line.priceCurrency)} (${units})`
            : units,
        tone: "loss"
      }
    )
  }
  return steps
}

// Sources that couldn't be read, which leave their sales out.
function Notes({ report }: { report: Report }) {
  const errors = report.sources.flatMap(({ source, error }) => (error ? [`${sourceNames[source]}: ${error}`] : []))
  return errors.length ? (
    <ul className={styles.notes} aria-live="polite">
      {errors.map((note) => (
        <li key={note}>{note}</li>
      ))}
    </ul>
  ) : null
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

function costText(totals: OrderTotals) {
  const amounts = [...totals.cost].map(([currency, minor]) => money(minor, currency))
  return amounts.length ? amounts.join(" + ") : "Unknown"
}

function Totals({ totals }: { totals: OrderTotals }) {
  if (!totals.count) {
    return <p className={styles.detail}>Nothing selected.</p>
  }
  const parts = [`${totals.count} ${totals.count === 1 ? "line" : "lines"}`, `${totals.units.toLocaleString()} units`]
  if (totals.cases) {
    parts.push(
      `${totals.cases} cases, ${totals.volume.toFixed(2)} m³${totals.weight ? `, ${totals.weight.toFixed(1)} kg` : ""}`
    )
  }
  return (
    <p className={styles.detail}>
      {parts.join(", ")}
      {totals.unknownSize > 0 && `. ${totals.unknownSize} without a case pack`}
      {totals.unknownCost > 0 && `. ${totals.unknownCost} without a unit cost, not in the cost`}
    </p>
  )
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
    .slice(0, poLineLimit)
  const params = new URLSearchParams(chosen.map(([id, units]) => ["variant", `${id}@${units}`]))
  params.set("destination", channel.kind === "amazon" ? "amazon" : "warehouse")
  if (channel.kind === "shopify") {
    params.set("locationId", channel.locationId)
  }
  if (supplierId) {
    params.set("supplierId", supplierId)
  }
  return { href: `/orders/new?${params}`, count: chosen.length }
}

// How long the stock on hand lasts at the sales rate. Days are rounded down, so under a day says so rather than 0.
function LostSales({ line }: { line: RestockLine }) {
  if (line.lostUnits === null) {
    return <span className="text-muted-foreground">Unknown</span>
  }
  if (line.lostUnits === 0) {
    return <span className="text-muted-foreground">None</span>
  }
  return line.lostSalesMinor !== null && line.priceCurrency ? (
    <span className="font-medium text-destructive">{money(line.lostSalesMinor, line.priceCurrency)}</span>
  ) : (
    <span className="text-muted-foreground">{line.lostUnits} units</span>
  )
}

function StockLeft({ line }: { line: RestockLine }) {
  if (isOut(line)) {
    return "None"
  }
  if (line.daysRemaining !== null) {
    return line.daysRemaining === 0 ? "Under a day" : `${line.daysRemaining} days left`
  }
  return line.sold === 0 ? "No sales" : "Unknown"
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
  const orderable = line.status !== "blocked" && line.status !== "not_stocked"
  const suggested = line.purchaseUnits ?? 0
  const current = edit ?? {
    selected: line.status === "stockout" || line.status === "reorder",
    units: String(suggested)
  }
  const label = `${line.product}${line.variant ? `, ${line.variant}` : ""}`
  const invalid = current.selected && !(Number.isInteger(Number(current.units)) && Number(current.units) > 0)
  return (
    <>
      <TableRow className="@max-md:flex @max-md:flex-wrap @max-md:items-center @max-md:gap-x-2 @max-md:px-3 @max-md:py-3">
        <TableCell className="w-8 pl-3 @max-md:w-auto @max-md:p-0">
          {orderable && (
            <Checkbox
              checked={current.selected}
              onCheckedChange={(checked) => onEdit({ ...current, selected: checked })}
              aria-label={`Order ${label}`}
            />
          )}
        </TableCell>
        <TableCell className="@max-md:min-w-0 @max-md:flex-1 @max-md:basis-[calc(100%-2rem)] @max-md:p-0">
          <Name line={line} />
          {/* In a narrow table the status and stock left columns are hidden, so they show under the name. */}
          <span className="mt-1.5 flex flex-wrap items-center gap-2 pl-12 text-xs text-muted-foreground @4xl:hidden">
            <StatusBadge line={line} />
            {!isOut(line) && <StockLeft line={line} />}
            {line.lostSalesMinor !== null && line.lostSalesMinor > 0 && line.priceCurrency && (
              <span className="text-destructive">
                About {money(line.lostSalesMinor, line.priceCurrency)} in lost sales
              </span>
            )}
          </span>
        </TableCell>
        <TableCell className="hidden @4xl:table-cell">
          <StatusBadge line={line} />
        </TableCell>
        <TableCell className="hidden text-right tabular-nums @4xl:table-cell">
          <StockLeft line={line} />
        </TableCell>
        <TableCell className="hidden text-right tabular-nums @4xl:table-cell">
          <LostSales line={line} />
        </TableCell>
        <TableCell className="hidden text-right tabular-nums @4xl:table-cell">{line.sold ?? "Unknown"}</TableCell>
        <TableCell
          className={cn(
            "hidden text-right tabular-nums @4xl:table-cell",
            line.stockoutDays > 0 && "font-medium text-destructive"
          )}
        >
          {line.stockoutDays}
          <span className="sr-only"> of {line.salesDays} days</span>
        </TableCell>
        <TableCell className="hidden text-right tabular-nums @4xl:table-cell">{line.available ?? "Unknown"}</TableCell>
        <TableCell className="hidden text-right tabular-nums @4xl:table-cell">{line.incoming ?? "Unknown"}</TableCell>
        <TableCell className="text-right @max-md:ml-auto @max-md:p-0">
          {orderable ? (
            <div className="flex flex-col items-end">
              {/* Borderless until hovered or focused, so the column reads as figures rather than a form. */}
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                step={line.caseQuantity ?? 1}
                value={current.units}
                aria-label={`Units of ${label} to order`}
                aria-invalid={invalid}
                className="h-8 w-20 border-transparent bg-transparent text-right tabular-nums shadow-none hover:bg-input/30 focus-visible:border focus-visible:bg-background dark:bg-transparent dark:hover:bg-input/30 dark:focus-visible:bg-input/30"
                onChange={(event) => onEdit({ selected: true, units: event.target.value })}
              />
              {Number(current.units) !== suggested && (
                <span className="pr-2.5 text-xs text-muted-foreground">Suggested {suggested}</span>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground">None</span>
          )}
        </TableCell>
        <TableCell className="text-right tabular-nums @max-md:p-0">
          {line.estimatedCostMinor !== null && line.costCurrency && line.unitCostMinor !== null ? (
            money(Number(current.units || 0) * line.unitCostMinor, line.costCurrency)
          ) : (
            <span className="text-muted-foreground">Unknown</span>
          )}
        </TableCell>
        <TableCell className="w-10 pr-3 @max-md:w-auto @max-md:p-0">
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={`Why ${label}`}
            title="How this was worked out"
          >
            {expanded ? <ChevronDown /> : <ChevronRight />}
          </Button>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="bg-muted/30 hover:bg-muted/30 @max-md:block @max-md:px-3 @max-md:py-2">
          <TableCell className="@max-md:hidden" />
          {/* Spans the columns the table shows: all eleven when wide, four when narrow. */}
          <TableCell colSpan={11} className="hidden whitespace-normal @4xl:table-cell">
            <Explanation line={line} />
          </TableCell>
          <TableCell colSpan={4} className="whitespace-normal @4xl:hidden @max-md:block @max-md:p-0">
            <Explanation line={line} />
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

function Explanation({ line }: { line: RestockLine }) {
  if (line.status === "not_stocked") {
    return (
      <p className="text-sm text-muted-foreground">Not stocked at Amazon: its minimum stock there is 0 in Shopify.</p>
    )
  }
  if (line.status === "blocked") {
    return (
      <p className="text-sm text-muted-foreground">
        Can’t suggest a quantity: {line.blocked.map((reason) => blockNames[reason]).join(" and ")}.
      </p>
    )
  }
  return (
    <dl className="grid max-w-md grid-cols-[1.25rem_1fr_auto] gap-x-2 gap-y-1 text-sm">
      {breakdown(line).map((step) => (
        <div
          key={step.label}
          className={cn(
            "col-span-3 grid grid-cols-subgrid",
            step.tone === "result" && "mt-1 border-t pt-1.5 font-medium",
            step.tone === "heading" && "mt-3 text-xs font-medium text-muted-foreground",
            step.tone === "loss" && "text-destructive"
          )}
        >
          <span className="text-muted-foreground" aria-hidden="true">
            {step.sign}
          </span>
          <dt className={cn(!step.tone && "text-muted-foreground")}>{step.label}</dt>
          <dd className="text-right tabular-nums">{step.value}</dd>
        </div>
      ))}
    </dl>
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
  // Collapsed, the group shows only its totals and Reorder.
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const po = createPoHref(lines, edits, channel, supplierId)
  const headingId = `supplier-${groupKey.replace(/[^A-Za-z0-9-]/g, "-")}`
  const leadTimes = [...new Set(lines.map((line) => line.leadTimeDays))]
  const totals = orderTotals(lines, edits)
  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      render={<section className={styles.section} aria-labelledby={headingId} />}
    >
      <div className={styles.heading}>
        <span className={sx({ display: "flex", flexDirection: "column", gap: 1 })}>
          <span className={styles.groupTitle}>
            <CollapsibleTrigger
              render={<Button variant="ghost" size="icon-sm" />}
              aria-label={`${open ? "Hide" : "Show"} the ${lines.length} products from ${name}`}
            >
              <ChevronRight className={styles.chevron} aria-hidden="true" />
            </CollapsibleTrigger>
            <h2 id={headingId} className={styles.sectionTitle}>
              {name}
            </h2>
            <span className={styles.detail}>
              {lines.length} {lines.length === 1 ? "product" : "products"}
            </span>
          </span>
          <span className={styles.detail}>
            Lead time {leadTimes.join(" or ")} days.
            {supplierId ? "" : " Ordered outside Copacker, so there’s no PO to create here."}
          </span>
          <Totals totals={totals} />
        </span>
        <span className={styles.groupActions}>
          {lostText(lines) && (
            <span className={styles.groupCost}>
              <span className={styles.detail}>Expected lost sales</span>
              <strong className="text-destructive">{lostText(lines)}</strong>
            </span>
          )}
          <span className={styles.groupCost}>
            <span className={styles.detail}>Estimated cost</span>
            <strong>{costText(totals)}</strong>
          </span>
          {supplierId &&
            (po.count > 0 ? (
              <Button nativeButton={false} render={<Link href={po.href} />}>
                Reorder
              </Button>
            ) : (
              <Button disabled>Reorder</Button>
            ))}
        </span>
      </div>
      <CollapsibleContent className="@container flex flex-col gap-3">
        <div>
          <Table className="@max-md:block">
            <TableHeader className="@max-md:hidden">
              <TableRow>
                <TableHead className="w-8 pl-3">
                  <span className="sr-only">Order</span>
                </TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="hidden @4xl:table-cell">Status</TableHead>
                <TableHead className="hidden text-right @4xl:table-cell">Stock left</TableHead>
                <TableHead
                  className="hidden text-right @4xl:table-cell"
                  title="Sales expected to be lost before an order placed today arrives, at the Shopify price"
                >
                  Lost sales
                </TableHead>
                <TableHead className="hidden text-right @4xl:table-cell">Sold</TableHead>
                <TableHead className="hidden text-right @4xl:table-cell">
                  <abbr
                    title="Days of the sales period it was out of stock. The sales rate leaves them out."
                    className="no-underline"
                  >
                    Days out
                  </abbr>
                </TableHead>
                <TableHead className="hidden text-right @4xl:table-cell">Available</TableHead>
                <TableHead className="hidden text-right @4xl:table-cell">Incoming</TableHead>
                <TableHead className="pr-5 text-right">Order</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="w-10 pr-3">
                  <span className="sr-only">Explanation</span>
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
            <TableFooter className="@max-md:block">
              <TableRow className="hover:bg-transparent @max-md:flex @max-md:items-center @max-md:gap-4 @max-md:px-3 @max-md:py-3">
                <TableCell className="@max-md:hidden" />
                <TableCell className="@max-md:flex-1 @max-md:p-0">Total selected</TableCell>
                {/* Under the columns hidden in a narrow table: status, stock left, lost sales, sold, days out, available,
                    incoming. */}
                <TableCell colSpan={7} className="hidden @4xl:table-cell" />
                <TableCell className="pr-5 text-right tabular-nums @max-md:p-0">
                  {totals.units.toLocaleString()}
                </TableCell>
                <TableCell className="text-right tabular-nums @max-md:p-0">{costText(totals)}</TableCell>
                <TableCell className="@max-md:hidden" />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
        {po.count === poLineLimit && (
          <p className="text-xs text-muted-foreground">A PO holds 100 lines; the first 100 are included.</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

// Why nothing is listed. A supplier filter shows only products linked to that supplier, which can be none yet.
function EmptyResults({ report, searching }: { report: Report; searching: boolean }) {
  if (searching) {
    return (
      <p className={styles.summary}>
        No products match. Only products with a supplier are listed; set the rest on{" "}
        <Link href="/products">Products</Link>.
      </p>
    )
  }
  if (report.supplier !== "all" && report.lines.length === 0) {
    const name = report.suppliers.find((supplier) => supplier.id === report.supplier)?.name ?? "this supplier"
    return (
      <p className={styles.summary}>
        No products are linked to {name} yet. Set suppliers on <Link href="/products">Products</Link>.
      </p>
    )
  }
  return <p className={styles.summary}>Nothing needs reordering.</p>
}

// Items Shopify says to keep at Amazon, but Amazon has no inventory for: there's nothing to send stock to yet.
function NoListing({ lines }: { lines: RestockLine[] }) {
  if (!lines.length) {
    return null
  }
  return (
    <Alert>
      <AlertTriangle />
      <AlertTitle>
        {lines.length} {lines.length === 1 ? "product has" : "products have"} a minimum stock at Amazon but no Amazon
        listing
      </AlertTitle>
      <AlertDescription>
        <p>
          Shopify sets a minimum stock to keep at Amazon for these, but Amazon has no FBA or AWD inventory for their
          SKUs, so they aren’t suggested. Create the FBA listing with the same SKU, or set the minimum to 0 in Shopify.
        </p>
        <Collapsible className={styles.noListing}>
          <CollapsibleTrigger className={styles.noListingTrigger}>
            <ChevronRight className={styles.chevron} aria-hidden="true" />
            Show products
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className={styles.number}>Minimum at Amazon</TableHead>
                  <TableHead className={styles.number}>Sold</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => (
                  <TableRow key={line.variantId}>
                    <TableCell>
                      <Name line={line} />
                    </TableCell>
                    <TableCell className={styles.number}>{line.targetStock}</TableCell>
                    <TableCell className={styles.number}>{line.sold ?? "Unknown"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CollapsibleContent>
        </Collapsible>
      </AlertDescription>
    </Alert>
  )
}

type Sort = "urgency" | "quantity" | "name"

function Results({ report, filters }: { report: Report; filters: LinkFilters }) {
  const [search, setSearch] = useState(filters.q)
  const [cover, setCover] = useState(filters.cover)
  const [onlyOrders, setOnlyOrders] = useState(filters.onlyOrders)
  const [query] = useDebouncedValue(search.trim().toLocaleLowerCase(), 200)
  const [sort, setSort] = useLocalStorage<Sort>({ key: "restock-sort", defaultValue: "urgency" })
  const [showAll, setShowAll] = useState(false)
  const [edits, setEdits] = useState<ReadonlyMap<string, Edit>>(new Map())
  // Supplier groups whose items are hidden; all start open.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
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
  const counts = {
    order: report.lines.filter((line) => line.status === "stockout" || line.status === "reorder").length,
    blocked: report.lines.filter((line) => line.status === "blocked").length,
    fine: report.lines.filter((line) => line.status === "stocked" || line.status === "not_stocked").length
  }
  const selected = orderTotals(visible, edits)
  return (
    <div className={sx({ display: "flex", flexDirection: "column", gap: 6 })}>
      <Notes report={report} />
      {salesError ? (
        <p className={styles.summary}>Restock needs this channel’s sales. Fix the issue above and try again.</p>
      ) : (
        <p className={cn(styles.summary, "flex items-center gap-1.5")}>
          {counts.order} to reorder
          {counts.blocked > 0 && `, ${counts.blocked} can’t be calculated`}, {counts.fine} have enough stock.
          <InfoTip label="How quantities are worked out">
            Enough to last each supplier’s lead time at the last {report.days} days’ rate, after stock, incoming stock
            and open POs, rounded up to the minimum order and whole cases. Costs are Shopify’s unit costs, without
            freight, duties or fees.
          </InfoTip>
        </p>
      )}
      {report.needsSupplier > 0 && (
        <WarningNote>
          {report.needsSupplier} more {report.needsSupplier === 1 ? "product needs" : "products need"} reordering but{" "}
          {report.needsSupplier === 1 ? "has" : "have"} no supplier. Choose one on the{" "}
          <Link href="/products">Products</Link> page.
        </WarningNote>
      )}
      {(cover || onlyOrders) && (
        <div className={styles.filters}>
          {cover && (
            <Button variant="outline" size="sm" onClick={() => setCover(null)}>
              Days of cover: {coverBuckets.find((bucket) => bucket.key === cover)?.label}
              <X data-icon="inline-end" aria-hidden />
              <span className={srOnly}>Clear filter</span>
            </Button>
          )}
          {onlyOrders && (
            <Button variant="outline" size="sm" onClick={() => setOnlyOrders(false)}>
              Items to reorder
              <X data-icon="inline-end" aria-hidden />
              <span className={srOnly}>Clear filter</span>
            </Button>
          )}
        </div>
      )}
      <div className={styles.controls}>
        <Field className={styles.search}>
          <span className={styles.searchBox}>
            <Search aria-hidden="true" />
            <Input
              id="restock-search"
              type="search"
              aria-label="Search products"
              placeholder="Search products or SKUs"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </span>
        </Field>
        <Field className={styles.control}>
          <NativeSelect
            id="restock-sort"
            aria-label="Sort by"
            value={sort}
            onChange={(event) => {
              const value = event.target.value
              if (value === "urgency" || value === "quantity" || value === "name") {
                setSort(value)
              }
            }}
          >
            <NativeSelectOption value="urgency">Most urgent</NativeSelectOption>
            <NativeSelectOption value="quantity">Largest order</NativeSelectOption>
            <NativeSelectOption value="name">Product name</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field orientation="horizontal" className={styles.control}>
          <Checkbox id="restock-show-all" checked={showAll} onCheckedChange={setShowAll} />
          <FieldLabel htmlFor="restock-show-all">Show products with enough stock</FieldLabel>
        </Field>
      </div>
      {(selected.count > 0 || ordered.length > 1) && (
        <div className={styles.grandTotal} aria-live="polite">
          <span>
            <strong>Total for all suppliers</strong>
            <Totals totals={selected} />
            {lostText(visible) && (
              <p className="text-sm text-destructive">
                About {lostText(visible)} in sales expected to be lost before reorders placed today arrive
              </p>
            )}
          </span>
          <span className={styles.groupActions}>
            {ordered.length > 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setCollapsed(collapsed.size < ordered.length ? new Set(ordered.map((group) => group.key)) : new Set())
                }
              >
                {collapsed.size < ordered.length ? "Collapse all" : "Expand all"}
              </Button>
            )}
            <strong className={styles.grandCost}>{costText(selected)}</strong>
          </span>
        </div>
      )}
      {ordered.length === 0 && <EmptyResults report={report} searching={matching.length < report.lines.length} />}
      {ordered.map((group) => (
        <SupplierGroup
          key={group.key}
          groupKey={group.key}
          name={group.name}
          supplierId={group.supplierId}
          lines={group.lines}
          channel={report.channel}
          open={!collapsed.has(group.key)}
          onOpenChange={(open) =>
            setCollapsed((current) => {
              const next = new Set(current)
              const key = group.key
              if (open) {
                next.delete(key)
              } else {
                next.add(key)
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
  )
}

// A whole number of days within the supported range, or null.
function wholeDays(text: string) {
  const value = Number(text)
  return Number.isInteger(value) && value >= dayRange.min && value <= dayRange.max ? value : null
}

// `settings` are the workspace's sales period and default lead time (Settings), which the page starts from.
export function RestockReport({ settings }: { settings: { days: number; leadTimeDays: number } }) {
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
  const params = useSearchParams()
  const [filters] = useState(() => linkFilters(params))
  // The linked channel wins until another is chosen.
  const [linkedChannel, setLinkedChannel] = useState(filters.channel)
  const channel = channels.find((item) => item.key === (linkedChannel ?? channelKey)) ?? channels[0]
  // A remembered choice that no longer exists, such as a removed supplier, falls back to all suppliers.
  const supplierChoice = supplier === "all" || suppliers.some((row) => row.id === supplier)
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
  return (
    <div className={sx({ display: "flex", flexDirection: "column", gap: 6 })}>
      <div className={styles.controls}>
        <Field className={styles.control}>
          <FieldLabel htmlFor="restock-channel">Restock</FieldLabel>
          <NativeSelect
            id="restock-channel"
            value={channel?.key ?? ""}
            onChange={(event) => {
              setLinkedChannel(null)
              setChannelKey(event.target.value)
            }}
          >
            {!channel && (
              <NativeSelectOption value="">{channelsLoading ? "Loading…" : "Sync inventory first"}</NativeSelectOption>
            )}
            {channels.map((item) => (
              <NativeSelectOption key={item.key} value={item.key}>
                {item.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field className={styles.control}>
          <FieldLabel htmlFor="restock-supplier">Supplier</FieldLabel>
          <NativeSelect
            id="restock-supplier"
            value={supplierChoice ? supplier : "all"}
            onChange={(event) => setSupplier(event.target.value)}
          >
            <NativeSelectOption value="all">All suppliers</NativeSelectOption>
            {suppliers.map((row) => (
              <NativeSelectOption key={row.id} value={row.id}>
                {row.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field className={styles.days} data-invalid={days === null}>
          <FieldLabel htmlFor="restock-days">Sales period (days)</FieldLabel>
          <Input
            id="restock-days"
            type="number"
            inputMode="numeric"
            min={dayRange.min}
            max={dayRange.max}
            value={daysText}
            aria-invalid={days === null}
            onChange={(event) => setDaysText(event.target.value)}
          />
        </Field>
        <Field className={styles.days} data-invalid={leadTimeDays === null}>
          <FieldLabel htmlFor="restock-lead-time" title="Used for suppliers without their own lead time">
            Lead time (days)
          </FieldLabel>
          <Input
            id="restock-lead-time"
            type="number"
            inputMode="numeric"
            min={dayRange.min}
            max={dayRange.max}
            value={leadTimeText}
            aria-invalid={leadTimeDays === null}
            onChange={(event) => setLeadTimeText(event.target.value)}
          />
        </Field>
        <Button
          variant="outline"
          disabled={result.isFetching || !shownKey}
          onClick={() => void result.refetch()}
          aria-label="Recalculate suggestions"
        >
          <RefreshCw data-icon="inline-start" />
          {result.isFetching ? "Calculating…" : "Recalculate"}
        </Button>
      </div>
      {result.isError && <p role="alert">{errorMessage(result.error, "Restock couldn’t be calculated. Try again.")}</p>}
      {!result.currentData && (result.isFetching || (request && !result.isError)) && (
        <p className={styles.summary}>Calculating suggestions…</p>
      )}
      {result.currentData && <Results key={shownKey} report={result.currentData} filters={filters} />}
    </div>
  )
}
