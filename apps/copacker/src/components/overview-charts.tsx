"use client"

import { Toggle } from "@base-ui/react/toggle"
import { ToggleGroup } from "@base-ui/react/toggle-group"
import { useState } from "react"
import { Area, AreaChart, CartesianGrid, type TooltipContentProps, Tooltip, XAxis, YAxis } from "recharts"
import { isPresent } from "ts-extras"
import { useFormatter, useLocale, useTranslations } from "use-intl"
import type { Comparison } from "@/lib/date-range"
import { cn } from "@/lib/utils"
import type { DailySales, SourceDay } from "@/server/overview-sales"
import type { SalesSource } from "@/server/sales-orders"
import { vars } from "@/styles/theme.css"

// Each source keeps its color everywhere: Amazon first, then Shopify, then eBay.
export const sourceSeries: Record<SalesSource, { label: string; color: string }> = {
  amazon: { label: "Amazon", color: vars.color.chart1 },
  shopify: { label: "Shopify", color: vars.color.chart2 },
  ebay: { label: "eBay", color: vars.color.chart3 }
}
const sourceOrder: SalesSource[] = ["amazon", "shopify", "ebay"]

// Recessive axes: no rules or tick marks, small muted labels.
const axis = {
  axisLine: false,
  tickLine: false,
  tick: { fill: vars.color.mutedForeground, fontSize: 11 },
  tickMargin: 8
} as const

// The shown sources' total, and their total in the compared period.
type Point = { key: string; label: string; title: string; value: number | null; previous?: number | null }
type Metric = "orders" | "units" | "sales"
// Names a UTC day or month, in the reader's language: "Sep 3", "Sep", "September 2026".
type Dates = { day: (day: string) => string; month: (month: string) => string; longMonth: (month: string) => string }

// Recharts fills in `active`, `activeIndex` and `payload` when it renders the tooltip.
function ChartTooltip({
  active,
  activeIndex,
  payload,
  points,
  format
}: Partial<Pick<TooltipContentProps, "active" | "activeIndex" | "payload">> & {
  points: Point[]
  format: (value: number) => string
}) {
  const point = activeIndex === null || activeIndex === undefined ? undefined : points[Number(activeIndex)]
  if (!active || !point || !payload?.length) {
    return null
  }
  return (
    <div className="flex min-w-40 flex-col gap-1.5 rounded-lg bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-md ring-1 ring-foreground/10">
      <span className="font-medium">{point.title}</span>
      {payload.map((entry) => (
        <div key={String(entry.dataKey)} className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn("w-3 shrink-0 border-t-2", entry.dataKey === "previous" && "border-dashed opacity-50")}
            style={{ borderColor: entry.color }}
          />
          <span className="flex-1 text-muted-foreground">{String(entry.name)}</span>
          <span className="font-medium tabular-nums">
            {typeof entry.value === "number" ? format(entry.value) : "—"}
          </span>
        </div>
      ))}
    </div>
  )
}

function measure(cell: SourceDay, metric: Metric) {
  if (metric === "sales") {
    return cell.revenueMinor
  }
  return metric === "units" ? cell.units : cell.orders
}

// How a period is drawn: by day up to about three months, by week up to about a year, and by month beyond.
type Step = "day" | "week" | "month"
function stepFor(days: number): Step {
  if (days <= 92) {
    return "day"
  }
  return days <= 400 ? "week" : "month"
}

// The rows each point sums: one day, seven days, or a calendar month.
function groups(rows: DailySales[], step: Step) {
  const result: { start: number; end: number }[] = []
  for (let index = 0; index < rows.length; ) {
    let end = index + 1
    if (step === "week") {
      end = Math.min(rows.length, index + 7)
    } else if (step === "month") {
      while (end < rows.length && rows[end]!.date.slice(0, 7) === rows[index]!.date.slice(0, 7)) {
        end++
      }
    }
    result.push({ start: index, end })
    index = end
  }
  return result
}

const pointTitle = (first: string, step: Step, dates: Dates, weekOf: (date: string) => string) => {
  if (step === "day") {
    return dates.day(first)
  }
  return step === "week" ? weekOf(dates.day(first)) : dates.longMonth(first.slice(0, 7))
}

// The period's points summed across sources, and the compared period's alongside, lined up point for point.
function points(
  daily: DailySales[],
  previous: DailySales[] | null,
  sources: SalesSource[],
  metric: Metric,
  step: Step,
  dates: Dates,
  weekOf: (date: string) => string
): Point[] {
  const sum = (cells: (SourceDay | null)[]) =>
    cells.every((cell) => cell === null)
      ? null
      : cells.reduce((total, cell) => total + (cell ? measure(cell, metric) : 0), 0)
  return groups(daily, step).map(({ start, end }) => {
    const first = daily[start]!.date
    const cells = (rows: DailySales[]) => rows.flatMap((row) => sources.map((source) => row[source]))
    const before = previous?.slice(start, end)
    return {
      key: first,
      label: step === "month" ? dates.month(first.slice(0, 7)) : dates.day(first),
      title: pointTitle(first, step, dates, weekOf),
      value: sum(cells(daily.slice(start, end))),
      ...(before && { previous: before.length ? sum(cells(before)) : null })
    }
  })
}

// Axis labels in one short style from top to bottom: $0, $5K, $10K.
function axisLabel(metric: Metric, currency: string | null, locale: string) {
  const format = new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
    ...(metric === "sales" && { style: "currency", currency: currency ?? "USD" })
  })
  return (value: number) => format.format(metric === "sales" ? value / 100 : value)
}

// A segmented control: the chosen option sits raised on a muted track.
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <ToggleGroup
      className="inline-flex h-8 shrink-0 items-center gap-0.5 rounded-lg bg-muted p-0.5"
      value={[value]}
      onValueChange={(next) => {
        const option = options.find((candidate) => candidate.value === next[0])
        if (option) {
          onChange(option.value)
        }
      }}
      aria-label={label}
    >
      {options.map((option) => (
        <Toggle
          key={option.value}
          value={option.value}
          className="h-7 cursor-pointer rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 data-pressed:bg-background data-pressed:text-foreground data-pressed:shadow-xs dark:data-pressed:bg-input/40"
        >
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  )
}

// Units or sales over the Overview's period, the shown sources together as one line, with the compared period as a faint dashed line. Sales appear
// once orders have prices; orders without a price are left out of them.
export function SalesTrend({
  daily,
  previous,
  comparison,
  sources,
  currency
}: {
  daily: DailySales[]
  previous: DailySales[] | null
  // What the period is compared with, for the dashed lines' names.
  comparison: Comparison
  sources: SalesSource[]
  currency: string | null
}) {
  const t = useTranslations("overview.salesChart")
  const channels = useTranslations("overview.channel")
  const period = useTranslations("overview.period")
  const intl = useFormatter()
  const locale = useLocale()
  const dates: Dates = {
    day: (day) => intl.dateTime(new Date(`${day}T00:00:00Z`), { month: "short", day: "numeric", timeZone: "UTC" }),
    month: (month) => intl.dateTime(new Date(`${month}-01T00:00:00Z`), { month: "short", timeZone: "UTC" }),
    longMonth: (month) =>
      intl.dateTime(new Date(`${month}-01T00:00:00Z`), { month: "long", year: "numeric", timeZone: "UTC" })
  }
  const previousLabel = period(`comparisons.${comparison}`)
  // Sales first when orders have prices; orders otherwise.
  const [chosen, setMetric] = useState<Metric>(currency ? "sales" : "orders")
  const metric: Metric = currency || chosen !== "sales" ? chosen : "orders"
  const step = stepFor(daily.length)
  const shown = sourceOrder.filter((source) => sources.includes(source))
  // One source keeps its name and color; several read as all channels together.
  const single = shown.length === 1 ? sourceSeries[shown[0]!] : null
  const series = { label: single?.label ?? channels("all"), color: single?.color ?? vars.color.chart1 }
  const previousName = t("previousSeries", { source: series.label, comparison })
  const data = points(daily, previous, shown, metric, step, dates, (date) => t("weekOf", { date }))
  const compared = data.some((point) => isPresent(point.previous))
  const format = (value: number) =>
    metric === "sales"
      ? intl.number(value / 100, { style: "currency", currency: currency ?? "USD", maximumFractionDigits: 0 })
      : intl.number(value, { maximumFractionDigits: 0 })
  // "12 orders", "1 unit", "$4,203".
  const describe = (value: number) => (metric === "sales" ? format(value) : t(metric, { count: value }))
  const total = data.reduce((sum, point) => sum + (point.value ?? 0), 0)
  const known = data.some((point) => isPresent(point.value))

  return (
    <div className="flex flex-1 flex-col gap-4">
      {/* The legend and the measure switch share one row, centered on each other. */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          <li className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: series.color }} />
            <span className="text-muted-foreground">{series.label}</span>
            <span className="font-medium tabular-nums">{known ? format(total) : "—"}</span>
          </li>
          {compared && (
            <li className="flex items-center gap-2 text-muted-foreground">
              <span aria-hidden className="w-3 shrink-0 border-t-2 border-dashed border-muted-foreground/60" />
              {previousLabel}
            </li>
          )}
        </ul>
        <Segmented
          label={t("measure")}
          value={metric}
          options={[
            ...(currency ? [{ value: "sales" as const, label: t("metrics.sales") }] : []),
            { value: "orders" as const, label: t("metrics.orders") },
            { value: "units" as const, label: t("metrics.units") }
          ]}
          onChange={setMetric}
        />
      </div>
      <div className="min-h-64 w-full flex-1">
        <AreaChart
          data={data}
          responsive
          style={{ width: "100%", height: "100%" }}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          aria-hidden
        >
          <defs>
            <linearGradient id="fill-sales" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={series.color} stopOpacity={0.12} />
              <stop offset="100%" stopColor={series.color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={vars.color.border} />
          <XAxis dataKey="label" {...axis} minTickGap={40} />
          <YAxis
            {...axis}
            width={metric === "sales" ? 44 : 36}
            tickCount={4}
            allowDecimals={false}
            tickFormatter={axisLabel(metric, currency, locale)}
          />
          <Tooltip
            cursor={{ stroke: vars.color.border, strokeWidth: 1 }}
            content={<ChartTooltip points={data} format={describe} />}
          />
          {/* Straight segments between points, so a line never overshoots a value or loops back. */}
          {compared && (
            <Area
              type="linear"
              dataKey="previous"
              name={previousName}
              stroke={series.color}
              strokeOpacity={0.35}
              strokeWidth={1}
              strokeDasharray="3 3"
              fill="none"
              dot={false}
              activeDot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}
          <Area
            type="linear"
            dataKey="value"
            name={series.label}
            stroke={series.color}
            strokeWidth={2}
            strokeLinejoin="round"
            fill="url(#fill-sales)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: vars.color.card }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </div>
      <table className="sr-only">
        <caption>{t("caption", { metric, step })}</caption>
        <thead>
          <tr>
            <th scope="col">{t("stepColumn", { step })}</th>
            <th scope="col">{series.label}</th>
            {compared && <th scope="col">{previousName}</th>}
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.key}>
              <th scope="row">{point.label}</th>
              <td>{isPresent(point.value) ? format(point.value) : t("noData")}</td>
              {compared && <td>{isPresent(point.previous) ? format(point.previous) : t("noData")}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// A KPI tile's trend: a quiet line with a faint wash under it, the tile's full width. The tile's own text carries the
// numbers, so the line is decorative. `id` names the wash, unique on the page.
export function Sparkline({ id, values }: { id: string; values: (number | null)[] }) {
  if (values.filter(isPresent).length < 2) {
    return null
  }
  const color = vars.color.mutedForeground
  return (
    <div className="h-10 w-full" aria-hidden>
      <AreaChart
        data={values.map((value, index) => ({ index, value }))}
        responsive
        style={{ width: "100%", height: "100%" }}
        margin={{ top: 2, right: 1, bottom: 0, left: 1 }}
      >
        <defs>
          <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.14} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis hide domain={["dataMin", "dataMax"]} />
        <Area
          type="linear"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          strokeLinejoin="round"
          fill={`url(#spark-${id})`}
          dot={false}
          activeDot={false}
          connectNulls
          isAnimationActive={false}
        />
      </AreaChart>
    </div>
  )
}

// Items by how long their stock lasts, one row per group: its name, a bar for how many items it holds (against the
// largest group) and the count. Each row with items opens them in Restock, so the list works by pointer, keyboard and
// screen reader alike.
export function CoverChart({
  buckets
}: {
  buckets: { key: string; label: string; items: number; href: string | null }[]
}) {
  const t = useTranslations("overview.cover")
  const intl = useFormatter()
  const largest = Math.max(1, ...buckets.map((bucket) => bucket.items))
  const row = "grid grid-cols-[7rem_minmax(0,1fr)_3rem] items-center gap-3 rounded-md px-2 py-1.5 text-sm"
  return (
    <ul className="-mx-2 flex flex-col gap-0.5">
      {buckets.map((bucket) => {
        const content = (
          <>
            <span className="truncate">{bucket.label}</span>
            <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
              <span
                className="block h-full min-w-0.5 rounded-full bg-chart-1"
                style={{ width: `${(bucket.items / largest) * 100}%` }}
              />
            </span>
            <span className="text-end font-medium tabular-nums">
              <span aria-hidden>{intl.number(bucket.items)}</span>
              <span className="sr-only">{t("items", { count: bucket.items })}</span>
            </span>
          </>
        )
        return (
          <li key={bucket.key}>
            {bucket.href ? (
              <a
                href={bucket.href}
                className={cn(
                  row,
                  "transition-colors outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50"
                )}
              >
                {content}
              </a>
            ) : (
              <span className={cn(row, "text-muted-foreground")}>{content}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
