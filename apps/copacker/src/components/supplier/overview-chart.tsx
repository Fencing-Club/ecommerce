"use client"

import { Bar, CartesianGrid, ComposedChart, Line, type TooltipContentProps, Tooltip, XAxis, YAxis } from "recharts"
import { useLocale, useTranslations } from "use-intl"
import { useMoney } from "@/hooks/use-money"
import type { Comparison } from "@/lib/date-range"
import { compactMoney } from "@/lib/format"
import type { SupplierOverviewData } from "@/server/supplier-overview"

type Point = { key: string; label: string; title: string; value: number; orders: number; previous: number | null }

// A "YYYY-MM-DD" day in the page's language, read in UTC so it stays the same day in every time zone.
const dayLabel = (day: string, locale: string, options: Intl.DateTimeFormatOptions) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(locale, { ...options, timeZone: "UTC" })

function bucketSize(days: number) {
  if (days <= 45) {
    return 1
  }
  return days <= 190 ? 7 : 30
}

// Days for a month or so, then weeks, then months, so bars stay readable. `range` writes a week's first and last day
// as one span.
function buckets(
  series: SupplierOverviewData["series"],
  locale: string,
  range: (low: string, high: string) => string
): Point[] {
  const size = bucketSize(series.length)
  const points: Point[] = []
  for (let start = 0; start < series.length; start += size) {
    const group = series.slice(start, start + size)
    const first = group[0]!.day
    const last = group.at(-1)!.day
    const previous = group.every((day) => day.previous === null)
      ? null
      : group.reduce((sum, day) => sum + (day.previous ?? 0), 0)
    points.push({
      key: first,
      label: dayLabel(first, locale, size === 30 ? { month: "short" } : { month: "short", day: "numeric" }),
      title:
        size === 1
          ? dayLabel(first, locale, { weekday: "short", month: "short", day: "numeric" })
          : range(
              dayLabel(first, locale, { month: "short", day: "numeric" }),
              dayLabel(last, locale, { month: "short", day: "numeric" })
            ),
      value: group.reduce((sum, day) => sum + day.value, 0),
      orders: group.reduce((sum, day) => sum + day.orders, 0),
      previous
    })
  }
  return points
}

function ChartTooltip({
  active,
  payload,
  currency,
  previousLabel
}: Partial<TooltipContentProps> & { currency: string; previousLabel: string | null }) {
  const t = useTranslations("supplier.chart")
  const locale = useLocale()
  const money = useMoney()
  const point = payload?.[0]?.payload as Point | undefined
  if (!active || !point) {
    return null
  }
  return (
    <div className="min-w-44 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1.5 font-medium">{point.title}</p>
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="size-2 rounded-[2px] bg-chart-1" aria-hidden />
          {t("ordered")}
        </span>
        <span className="font-medium tabular-nums">{money(point.value, currency)}</span>
      </div>
      <div className="flex justify-between gap-4 text-muted-foreground">
        <span className="ps-3.5">{t("orders")}</span>
        <span className="tabular-nums">{point.orders.toLocaleString(locale)}</span>
      </div>
      {point.previous !== null && previousLabel && (
        <div className="mt-1 flex justify-between gap-4 text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-0 w-2 border-t-2 border-dashed border-muted-foreground" aria-hidden />
            {previousLabel}
          </span>
          <span className="tabular-nums">{money(point.previous, currency)}</span>
        </div>
      )}
    </div>
  )
}

// Order value received over the period, with the previous period as a dashed line on the same scale.
export function OrdersChart({
  series,
  currency,
  comparison
}: {
  series: SupplierOverviewData["series"]
  currency: string
  // The period compared with, or null for none.
  comparison: Exclude<Comparison, "none"> | null
}) {
  const t = useTranslations("supplier.chart")
  const periods = useTranslations("overview.period")
  const previousLabel = comparison ? periods(`comparisons.${comparison}`) : null
  const shared = useTranslations("supplier.shared")
  const locale = useLocale()
  const money = useMoney()
  const data = buckets(series, locale, (low, high) => shared("range", { low, high }))
  const compared = previousLabel !== null && data.some((point) => point.previous !== null)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-chart-1" aria-hidden />
          {t("thisPeriod")}
        </span>
        {compared && (
          <span className="flex items-center gap-1.5">
            <span className="h-0 w-3 border-t-2 border-dashed border-muted-foreground" aria-hidden />
            {previousLabel}
          </span>
        )}
      </div>
      <div className="h-56">
        <ComposedChart
          data={data}
          responsive
          style={{ width: "100%", height: "100%" }}
          margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
          barCategoryGap={2}
          aria-hidden
        >
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            minTickGap={20}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
          <YAxis
            width={52}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickFormatter={(value: number) => compactMoney(value, currency, locale)}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            content={<ChartTooltip currency={currency} previousLabel={previousLabel} />}
          />
          <Bar dataKey="value" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          {compared && (
            <Line
              type="monotone"
              dataKey="previous"
              stroke="var(--muted-foreground)"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </div>
      <table className="sr-only">
        <caption>{t("caption")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("period")}</th>
            <th scope="col">{t("ordered")}</th>
            <th scope="col">{t("orders")}</th>
            {compared && <th scope="col">{previousLabel}</th>}
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.key}>
              <th scope="row">{point.title}</th>
              <td>{money(point.value, currency)}</td>
              <td>{point.orders.toLocaleString(locale)}</td>
              {compared && <td>{point.previous === null ? t("noData") : money(point.previous, currency)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
