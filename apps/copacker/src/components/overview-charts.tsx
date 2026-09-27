"use client"

import { Toggle } from "@base-ui/react/toggle"
import { ToggleGroup } from "@base-ui/react/toggle-group"
import Link from "next/link"
import { useState } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
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

// Each source's value, and its value in the compared period under "previous:<source>".
type Point = { key: string; label: string; title: string } & Partial<
  Record<SalesSource | `previous:${SalesSource}`, number | null>
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
      for (const source of sources) {
        point[`previous:${source}`] = before.length ? sum(before.map((row) => row[source])) : null
      }
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
  const compared = data.some((point) =>
    shown.some((source) => point[`previous:${source}`] !== null && point[`previous:${source}`] !== undefined)
  )
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
    <div className={styles.fill}>
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
                {previousLabel}
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
      <div className={styles.chartGrow}>
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
          {compared &&
            shown.map((source) => (
              <Area
                key={`previous:${source}`}
                type="monotone"
                dataKey={`previous:${source}`}
                name={`${sourceSeries[source].label}, ${previousLabel.toLowerCase()}`}
                stroke={sourceSeries[source].color}
                strokeOpacity={0.45}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                fill="none"
                activeDot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
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
            {compared &&
              shown.map((source) => (
                <th key={`previous:${source}`} scope="col">
                  {sourceSeries[source].label}, {previousLabel.toLowerCase()}
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
              {compared &&
                shown.map((source) => {
                  const value = point[`previous:${source}`]
                  return (
                    <td key={`previous:${source}`}>
                      {value === null || value === undefined ? "No data" : format(value)}
                    </td>
                  )
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

// Items by how long their stock lasts, one row per group: its name, a bar for how many items it holds (against the
// largest group) and the count. Each row with items opens them in Restock, so the list works by pointer, keyboard and
// screen reader alike.
export function CoverChart({
  buckets
}: {
  buckets: { key: string; label: string; items: number; href: string | null }[]
}) {
  const largest = Math.max(1, ...buckets.map((bucket) => bucket.items))
  return (
    <ul className={styles.coverRows}>
      {buckets.map((bucket) => {
        const content = (
          <>
            <span className={styles.coverLabel}>{bucket.label}</span>
            <span className={styles.coverTrack} aria-hidden>
              <span className={styles.coverFill} style={{ width: `${(bucket.items / largest) * 100}%` }} />
            </span>
            <span className={styles.coverCount}>
              {formatNumber(bucket.items)}
              <span className={srOnly}>{bucket.items === 1 ? " item" : " items"}</span>
            </span>
          </>
        )
        return (
          <li key={bucket.key}>
            {bucket.href ? (
              <Link href={bucket.href} className={styles.coverRow}>
                {content}
              </Link>
            ) : (
              <span className={styles.coverRow}>{content}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
