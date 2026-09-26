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
import type { DailySales } from "@/server/overview-sales"
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

type Point = { key: string; label: string; title: string } & Partial<Record<SalesSource, number | null>>
type Metric = "orders" | "units" | "sales"
// What each measure counts, named wherever a number appears so units aren't read as orders.
const metricNames = { orders: ["order", "orders"], units: ["unit", "units"] } as const

const ranges = [
  { value: "30", label: "30 days", days: 30 },
  { value: "90", label: "90 days", days: 90 },
  { value: "365", label: "12 months", days: 364 }
] as const

function measure(cell: { orders: number; units: number; revenueMinor: number }, metric: Metric) {
  if (metric === "sales") {
    return cell.revenueMinor
  }
  return metric === "units" ? cell.units : cell.orders
}

// Daily points for short ranges; a year is summed by week so the line stays readable.
function points(daily: DailySales[], days: number, sources: SalesSource[], metric: Metric): Point[] {
  const rows = daily.slice(-days)
  const size = days > 90 ? 7 : 1
  const result: Point[] = []
  for (let index = 0; index < rows.length; index += size) {
    const group = rows.slice(index, index + size)
    const first = group[0]!.date
    const point: Point = {
      key: first,
      label: shortDate(first),
      title: size === 1 ? shortDate(first) : `Week of ${shortDate(first)}`
    }
    for (const source of sources) {
      const cells = group.map((row) => row[source])
      point[source] = cells.every((cell) => cell === null)
        ? null
        : cells.reduce((sum, cell) => sum + (cell ? measure(cell, metric) : 0), 0)
    }
    result.push(point)
  }
  return result
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

// Units or sales by source over 30 days, 90 days or a year. Sales appear once orders have prices; orders without a
// price are left out of them.
export function SalesTrend({
  daily,
  sources,
  currency
}: {
  daily: DailySales[]
  sources: SalesSource[]
  currency: string | null
}) {
  const [range, setRange] = useState<(typeof ranges)[number]["value"]>("30")
  // Sales first when orders have prices; orders otherwise.
  const [chosen, setMetric] = useState<Metric>(currency ? "sales" : "orders")
  const metric: Metric = currency || chosen !== "sales" ? chosen : "orders"
  const days = ranges.find((option) => option.value === range)!.days
  const shown = sourceOrder.filter((source) => sources.includes(source))
  const data = points(daily, days, shown, metric)
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
          <Switch label="Period" value={range} options={ranges} onChange={setRange} />
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
          {{ orders: "Orders", units: "Units sold", sales: "Sales" }[metric]} by {days > 90 ? "week" : "day"}
        </caption>
        <thead>
          <tr>
            <th scope="col">{days > 90 ? "Week of" : "Day"}</th>
            {shown.map((source) => (
              <th key={source} scope="col">
                {sourceSeries[source].label}
              </th>
            ))}
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
