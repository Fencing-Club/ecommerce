"use client"

import { Toggle } from "@base-ui/react/toggle"
import { ToggleGroup } from "@base-ui/react/toggle-group"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  type TooltipContentProps,
  Tooltip,
  XAxis,
  YAxis
} from "recharts"
import { compactMoney, compactNumber, formatNumber, monthName, shortDate } from "@/lib/format"
import type { DailySales, SourceDay } from "@/server/overview-sales"
import type { SalesSource } from "@/server/sales-orders"
import * as styles from "./overview.css"
import { vars } from "@/styles/theme.css"
import { srOnly } from "@/styles/utilities.css"

// Each source keeps its color everywhere: Amazon first, then Shopify.
export const sourceSeries: Record<SalesSource, { label: string; color: string }> = {
  amazon: { label: "Amazon", color: vars.color.chart1 },
  shopify: { label: "Shopify", color: vars.color.chart2 }
}
const sourceOrder: SalesSource[] = ["amazon", "shopify"]

const axis = {
  axisLine: false,
  tickLine: false,
  tick: { fill: vars.color.mutedForeground, fontSize: 12 },
  tickMargin: 8
} as const
const grid = { vertical: false, stroke: vars.color.border } as const
const cursor = { stroke: vars.color.border, strokeWidth: 1 }
const barCursor = { fill: vars.color.muted, opacity: 0.6 }

type Entry = { name?: unknown; value?: unknown; color?: string; dataKey?: unknown }

// Recharts fills in `active` and `payload` when it renders the tooltip.
function ChartTooltip({
  active,
  payload,
  titleOf,
  format
}: Partial<Pick<TooltipContentProps, "active">> & {
  payload?: readonly (Entry & { payload?: unknown })[]
  titleOf: (row: never) => string
  format: (value: number) => string
}) {
  if (!active || !payload?.length) {
    return null
  }
  return (
    <div className={styles.tooltip}>
      <span className={styles.tooltipTitle}>{titleOf(payload[0]!.payload as never)}</span>
      {payload.map((entry) => (
        <div key={String(entry.dataKey)} className={styles.tooltipRow}>
          <span className={styles.swatch} style={{ backgroundColor: entry.color }} />
          <span className={styles.tooltipName}>{String(entry.name)}</span>
          <span className={styles.tooltipValue}>
            {typeof entry.value === "number" ? format(entry.value) : "No data"}
          </span>
        </div>
      ))}
    </div>
  )
}

type Point = { key: string; label: string; title: string; previous?: number | null } & Partial<
  Record<SalesSource, number | null>
>
type Metric = "orders" | "units" | "sales"
// What each measure counts, named wherever a number appears so units aren't read as orders.
const metricNames = { orders: ["order", "orders"], units: ["unit", "units"] } as const

function measure(cell: { orders: number; units: number; revenueMinor: number }, metric: Metric) {
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

const pointTitle = (first: string, step: Step) => {
  if (step === "day") {
    return shortDate(first)
  }
  return step === "week" ? `Week of ${shortDate(first)}` : monthName(first.slice(0, 7), true)
}

// The period's points by source, and the compared period's total alongside, lined up point for point.
function points(
  daily: DailySales[],
  previous: DailySales[] | null,
  sources: SalesSource[],
  metric: Metric,
  step: Step
): Point[] {
  const sum = (cells: (SourceDay | null)[]) =>
    cells.every((cell) => cell === null)
      ? null
      : cells.reduce((total, cell) => total + (cell ? measure(cell, metric) : 0), 0)
  return groups(daily, step).map(({ start, end }) => {
    const first = daily[start]!.date
    const point: Point = {
      key: first,
      label: step === "month" ? monthName(first.slice(0, 7)) : shortDate(first),
      title: pointTitle(first, step)
    }
    for (const source of sources) {
      point[source] = sum(daily.slice(start, end).map((row) => row[source]))
    }
    if (previous) {
      const before = previous.slice(start, end)
      point.previous = before.length ? sum(before.flatMap((row) => sources.map((source) => row[source]))) : null
    }
    return point
  })
}

function Switch<T extends string>({
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
      className={styles.range}
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
        <Toggle key={option.value} value={option.value} className={styles.rangeItem}>
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  )
}

// Units or sales by source over the Overview's period, with the compared period as a dotted line. Sales appear once
// orders have prices; orders without a price are left out of them.
export function SalesTrend({
  daily,
  previous,
  previousLabel,
  sources,
  currency
}: {
  daily: DailySales[]
  previous: DailySales[] | null
  previousLabel: string
  sources: SalesSource[]
  currency: string | null
}) {
  // Sales first when orders have prices; orders otherwise.
  const [chosen, setMetric] = useState<Metric>(currency ? "sales" : "orders")
  const metric: Metric = currency || chosen !== "sales" ? chosen : "orders"
  const step = stepFor(daily.length)
  const shown = sourceOrder.filter((source) => sources.includes(source))
  const data = points(daily, previous, shown, metric, step)
  const compared = data.some((point) => point.previous !== null && point.previous !== undefined)
  const format = (value: number) => (metric === "sales" ? compactMoney(value, currency ?? "USD") : formatNumber(value))
  // "12 orders", "1 unit", "$4.2K".
  const describe = (value: number) =>
    metric === "sales" ? format(value) : `${formatNumber(value)} ${metricNames[metric][value === 1 ? 0 : 1]}`
  const totals = shown.map((source) => ({
    source,
    value: data.reduce((sum, point) => sum + (point[source] ?? 0), 0),
    known: data.some((point) => point[source] !== null)
  }))

  return (
    <div className={styles.stack}>
      <div className={styles.chartControls}>
        <div className={styles.legend}>
          {totals.map((total) => (
            <div key={total.source} className={styles.legendItem}>
              <span className={styles.legendLabel}>
                <span className={styles.swatch} style={{ backgroundColor: sourceSeries[total.source].color }} />
                {sourceSeries[total.source].label}
              </span>
              <span className={styles.legendValue}>
                {total.known ? format(total.value) : "No orders synced"}
                {total.known && metric !== "sales" && (
                  <span className={styles.legendUnit}> {metricNames[metric][total.value === 1 ? 0 : 1]}</span>
                )}
              </span>
            </div>
          ))}
          {compared && (
            <div className={styles.legendItem}>
              <span className={styles.legendLabel}>
                <span className={styles.swatchDashed} />
                {previousLabel}, total
              </span>
            </div>
          )}
        </div>
        <div className={styles.switches}>
          <Switch
            label="Measure"
            value={metric}
            options={[
              ...(currency ? [{ value: "sales" as const, label: "Sales" }] : []),
              { value: "orders" as const, label: "Orders" },
              { value: "units" as const, label: "Units" }
            ]}
            onChange={setMetric}
          />
        </div>
      </div>
      <div className={styles.chart}>
        <AreaChart
          data={data}
          responsive
          style={{ width: "100%", height: "100%" }}
          margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
          aria-hidden
        >
          <defs>
            {shown.map((source) => (
              <linearGradient key={source} id={`fill-${source}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={sourceSeries[source].color} stopOpacity={0.16} />
                <stop offset="100%" stopColor={sourceSeries[source].color} stopOpacity={0.01} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid {...grid} />
          <XAxis dataKey="label" {...axis} minTickGap={24} />
          <YAxis
            {...axis}
            width={metric === "sales" ? 56 : 44}
            allowDecimals={false}
            tickFormatter={(value: number) => (metric === "sales" ? format(value) : compactNumber(value))}
          />
          <Tooltip
            cursor={cursor}
            content={<ChartTooltip titleOf={(point: Point) => point.title} format={describe} />}
          />
          {compared && (
            <Area
              type="monotone"
              dataKey="previous"
              name={previousLabel}
              stroke={vars.color.mutedForeground}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              fill="none"
              activeDot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}
          {shown.map((source) => (
            <Area
              key={source}
              type="monotone"
              dataKey={source}
              name={sourceSeries[source].label}
              stroke={sourceSeries[source].color}
              strokeWidth={2}
              fill={`url(#fill-${source})`}
              activeDot={{ r: 4, strokeWidth: 2, stroke: vars.color.card }}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </div>
      <table className={srOnly}>
        <caption>
          {{ orders: "Orders", units: "Units sold", sales: "Sales" }[metric]} by {step}
        </caption>
        <thead>
          <tr>
            <th scope="col">{{ day: "Day", week: "Week of", month: "Month" }[step]}</th>
            {shown.map((source) => (
              <th key={source} scope="col">
                {sourceSeries[source].label}
              </th>
            ))}
            {compared && <th scope="col">{previousLabel}</th>}
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.key}>
              <th scope="row">{point.label}</th>
              {shown.map((source) => {
                const value = point[source]
                return <td key={source}>{value === null || value === undefined ? "No data" : format(value)}</td>
              })}
              {compared && (
                <td>{point.previous === null || point.previous === undefined ? "No data" : format(point.previous)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// A small trend line for a KPI tile. The tile's own text carries the numbers, so the line is decorative.
export function Sparkline({ values }: { values: (number | null)[] }) {
  if (values.filter((value) => value !== null).length < 2) {
    return null
  }
  return (
    <div className={styles.sparkline} aria-hidden>
      <LineChart
        data={values.map((value, index) => ({ index, value }))}
        responsive
        style={{ width: "100%", height: "100%" }}
        margin={{ top: 4, right: 2, bottom: 4, left: 2 }}
      >
        <YAxis hide domain={["dataMin", "dataMax"]} />
        <Line
          type="monotone"
          dataKey="value"
          stroke={vars.color.chart1}
          strokeWidth={2}
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
      </LineChart>
    </div>
  )
}

// Items by how long their stock lasts, as horizontal bars so every label reads at any width. Each bar opens those
// items in Restock; the links under the chart do the same for keyboard and screen reader users.
export function CoverChart({
  buckets
}: {
  buckets: { key: string; label: string; items: number; href: string | null }[]
}) {
  const router = useRouter()
  return (
    <>
      <div className={styles.chartShort} aria-hidden>
        <BarChart
          data={buckets}
          layout="vertical"
          responsive
          style={{ width: "100%", height: "100%" }}
          margin={{ top: 0, right: 32, bottom: 0, left: 0 }}
          barCategoryGap={4}
        >
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="label" {...axis} width={116} />
          <Tooltip
            cursor={barCursor}
            content={
              <ChartTooltip
                titleOf={(bucket: { label: string }) => bucket.label}
                format={(value) => `${formatNumber(value)} ${value === 1 ? "item" : "items"}`}
              />
            }
          />
          <Bar
            dataKey="items"
            name="Items"
            fill={vars.color.chart1}
            radius={[0, 4, 4, 0]}
            maxBarSize={20}
            isAnimationActive={false}
            cursor="pointer"
            onClick={(entry) => {
              const href = (entry.payload as { href?: string | null } | undefined)?.href
              if (href) {
                router.push(href)
              }
            }}
          >
            <LabelList
              dataKey="items"
              position="right"
              fill={vars.color.mutedForeground}
              fontSize={12}
              formatter={(value) => formatNumber(Number(value))}
            />
          </Bar>
        </BarChart>
      </div>
      <ul className={styles.coverLinks}>
        {buckets
          .filter((bucket) => bucket.href && bucket.items > 0)
          .map((bucket) => (
            <li key={bucket.key}>
              <Link href={bucket.href!} className={styles.coverLink}>
                {bucket.label}
                <span className={styles.coverCount}>{formatNumber(bucket.items)}</span>
              </Link>
            </li>
          ))}
      </ul>
    </>
  )
}

// Purchase order value sent each month.
export function SpendChart({ months, currency }: { months: { month: string; minor: number }[]; currency: string }) {
  const data = months.map((row) => ({ ...row, label: monthName(row.month) }))
  return (
    <>
      <div className={styles.chartShort} aria-hidden>
        <BarChart
          data={data}
          responsive
          style={{ width: "100%", height: "100%" }}
          margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
        >
          <CartesianGrid {...grid} />
          <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={8} />
          <YAxis {...axis} width={52} tickFormatter={(value: number) => compactMoney(value, currency)} />
          <Tooltip
            cursor={barCursor}
            content={
              <ChartTooltip
                titleOf={(row: { month: string }) => monthName(row.month, true)}
                format={(value) => compactMoney(value, currency)}
              />
            }
          />
          <Bar
            dataKey="minor"
            name="Sent"
            fill={vars.color.chart1}
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
            isAnimationActive={false}
          />
        </BarChart>
      </div>
      <table className={srOnly}>
        <caption>Purchase order value sent by month</caption>
        <tbody>
          {data.map((row) => (
            <tr key={row.month}>
              <th scope="row">{monthName(row.month, true)}</th>
              <td>{compactMoney(row.minor, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
