import type { TooltipContentProps } from "recharts"
import { Bar, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from "recharts"
import { useLocale, useTranslations } from "use-intl"
import { ChartTooltipFrame, ChartTooltipRow, chartAxis } from "@/components/overview-charts"
import { useMoney } from "@/hooks/use-money"
import type { Comparison } from "@/lib/date-range"
import { compactMoney } from "@/lib/format"
import { buckets, seriesStep } from "@/lib/series"
import type { SupplierOverviewData } from "@/server/supplier-overview"
import { vars } from "@/styles/theme.css"

type Point = { key: string; label: string; title: string; value: number; orders: number; previous: number | null }

// A "YYYY-MM-DD" day in the page's language, read in UTC so it stays the same day in every time zone.
const dayLabel = (day: string, locale: string, options: Intl.DateTimeFormatOptions) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(locale, { ...options, timeZone: "UTC" })

// A bar for each day, week or calendar month, as the buyer's Overview draws its periods. A bar of several days is
// titled by its first and last, which `range` writes as one span.
function points(
  series: SupplierOverviewData["series"],
  locale: string,
  range: (low: string, high: string) => string
): Point[] {
  const step = seriesStep(series.length)
  return buckets(series, step, (day) => day.day).map(({ start, end }) => {
    const group = series.slice(start, end)
    const first = group[0]!.day
    const last = group.at(-1)!.day
    return {
      key: first,
      label: dayLabel(first, locale, step === "month" ? { month: "short" } : { month: "short", day: "numeric" }),
      title:
        first === last
          ? dayLabel(first, locale, { weekday: "short", month: "short", day: "numeric" })
          : range(
              dayLabel(first, locale, { month: "short", day: "numeric" }),
              dayLabel(last, locale, { month: "short", day: "numeric" })
            ),
      value: group.reduce((sum, day) => sum + day.value, 0),
      orders: group.reduce((sum, day) => sum + day.orders, 0),
      previous: group.every((day) => day.previous === null)
        ? null
        : group.reduce((sum, day) => sum + (day.previous ?? 0), 0)
    }
  })
}

// Recharts fills in `active` and `activeIndex` when it renders the tooltip.
function ChartTooltip({
  active,
  activeIndex,
  points,
  currency,
  previousLabel
}: Partial<Pick<TooltipContentProps, "active" | "activeIndex">> & {
  points: Point[]
  currency: string
  previousLabel: string | null
}) {
  const t = useTranslations("supplier.chart")
  const locale = useLocale()
  const money = useMoney()
  const point = activeIndex === null || activeIndex === undefined ? undefined : points[Number(activeIndex)]
  if (!active || !point) {
    return null
  }
  return (
    <ChartTooltipFrame title={point.title}>
      <ChartTooltipRow
        mark={<span className="size-2 rounded-[2px] bg-chart-1" />}
        label={t("ordered")}
        value={money(point.value, currency)}
      />
      <ChartTooltipRow label={t("orders")} value={point.orders.toLocaleString(locale)} />
      {point.previous !== null && previousLabel && (
        <ChartTooltipRow
          mark={<span className="w-3 border-t-2 border-dashed border-muted-foreground" />}
          label={previousLabel}
          value={money(point.previous, currency)}
        />
      )}
    </ChartTooltipFrame>
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
  const data = points(series, locale, (low, high) => shared("range", { low, high }))
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
          barCategoryGap="10%"
          aria-hidden
        >
          <CartesianGrid vertical={false} stroke={vars.color.border} strokeDasharray="3 3" />
          <XAxis dataKey="label" {...chartAxis} minTickGap={20} />
          <YAxis
            {...chartAxis}
            width={52}
            allowDecimals={false}
            tickFormatter={(value: number) => compactMoney(value, currency, locale)}
          />
          <Tooltip
            cursor={{ fill: vars.color.muted, opacity: 0.6 }}
            content={<ChartTooltip points={data} currency={currency} previousLabel={previousLabel} />}
          />
          <Bar
            dataKey="value"
            fill={vars.color.chart1}
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
            isAnimationActive={false}
          />
          {compared && (
            <Line
              type="monotone"
              dataKey="previous"
              stroke={vars.color.mutedForeground}
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
