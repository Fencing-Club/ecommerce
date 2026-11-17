import { Card, CardAction, CardContent, CardHeader, CardTitle, Skeleton } from "@buildkitgg/shadcn"
import { isPresent } from "ts-extras"
import { useLocale, useTranslations } from "use-intl"
import { rangeLabel } from "@/lib/date-range"
import { change } from "@/lib/format"
import { buckets, seriesStep } from "@/lib/series"
import type { Overview } from "@/server/overview"
import type { SourceDay } from "@/server/overview-sales"
import { InfoTip } from "./info-tip"
import { SalesTrend, Sparkline } from "./overview-charts"
import { ChannelFilter } from "./overview-filter"
import {
  Attention,
  BestSellers,
  CardLink,
  Customers,
  Dash,
  DaysOfCover,
  OpenOrders,
  ProfitBreakdown,
  SetupChecklist,
  SlowStock,
  StockByChannel,
  Trending,
  UpcomingSpend,
  useFigures
} from "./overview-sections"
import type { PickerPeriod, PeriodSelection } from "./period-picker"
import { PeriodPicker } from "./period-picker"
import { DeltaNote, StatCard, StatGrid } from "./stat-card"

// Grids: the sales chart beside gross profit, a wide card beside a narrow one, and two even halves. The six KPI cards
// are a StatGrid, which goes by its own width, sidebar or not.
// Gross profit keeps room for its longest line, "Refunds and disputes" with its share and amount.
const salesRow = "grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(22rem,1fr)]"
const wide = "grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
const halves = "grid grid-cols-1 gap-4 lg:grid-cols-2"
// A figure inside a card's note, as strong as the card's other text.
const figure = (chunks: React.ReactNode) => <span className="font-medium text-foreground tabular-nums">{chunks}</span>
// A card without a trend keeps the trend's space, so every card in the row is the same height.
const noTrend = <div className="h-10" aria-hidden />

// A series over the period for the shown sources, a point for each day, week or month as the sales chart draws them,
// null where no source covers a point's days. `pick` turns the point's totals, and how many of its days are covered,
// into its value.
function trend(sales: Overview["sales"], pick: (total: SourceDay, days: number) => number | null) {
  return buckets(sales.daily, seriesStep(sales.daily.length), (row) => row.date).map(({ start, end }) => {
    const rows = sales.daily.slice(start, end)
    const cells = rows.flatMap((row) => sales.sources.map((source) => row[source])).filter(isPresent)
    const days = rows.filter((row) => sales.sources.some((source) => row[source] !== null)).length
    return cells.length
      ? pick(
          cells.reduce((sum, cell) => ({
            orders: sum.orders + cell.orders,
            units: sum.units + cell.units,
            revenueMinor: sum.revenueMinor + cell.revenueMinor,
            unpriced: sum.unpriced + cell.unpriced
          })),
          days
        )
      : null
  })
}

// A card's trend under its figure, once there's a figure and two points to draw. `id` names it on the page.
function trendLine(id: string, value: string | null, values: (number | null)[]) {
  return value !== null && values.filter(isPresent).length > 1 ? <Sparkline id={id} values={values} /> : noTrend
}

// Sales per priced order: orders Amazon hasn't priced yet aren't counted either way. Null without priced orders.
function orderValue(totals: { orders: number; unpriced: number; revenueMinor: number }) {
  const priced = totals.orders - totals.unpriced
  return priced > 0 ? Math.round(totals.revenueMinor / priced) : null
}

function SalesKpis({
  sales,
  period,
  restock
}: {
  sales: Overview["sales"]
  period: Overview["period"]
  restock: Overview["restock"]
}) {
  const t = useTranslations("overview.kpis")
  const figures = useFigures()
  const periods = useTranslations("overview.period")
  const locale = useLocale()
  const periodLabel = period.key === "custom" ? rangeLabel(period.range, locale) : periods(`presets.${period.key}`)
  const { totals, currency, profit } = sales
  const { previous } = totals
  const versus = t("versus", { comparison: period.comparison })
  const hasSales = sales.daily.some((row) => sales.sources.some((source) => row[source] !== null))
  // Why a sales figure is missing: no orders yet, or orders Amazon hasn't priced.
  const missing = hasSales ? t("noPrices") : t("noOrders")
  // The change against the compared period, when there's one.
  const delta = (current: number, before: number | null | undefined) => {
    const value = change(current, before)
    return value === null ? null : <DeltaNote value={value} versus={versus} />
  }
  // A figure, or a dash while it can't be worked out yet.
  const shown = (value: string | null) => value ?? <Dash />
  const perDay = (value: number, days: number) => (days ? value / days : null)
  const averageOrder = orderValue(totals)
  const previousAverage = previous ? orderValue(previous) : null
  // What gross profit leaves out, when anything.
  const caveats = [
    profit.currency && profit.revenueMinor > profit.costedRevenueMinor
      ? t("uncostedSales", { amount: figures.whole(profit.revenueMinor - profit.costedRevenueMinor, profit.currency) })
      : null,
    sales.estimatedFeeOrders > 0 ? t("estimatedFees") : null
  ].filter(isPresent)
  let profitNote: React.ReactNode = currency ? t("noUnitCosts") : missing
  if (profit.margin !== null) {
    profitNote = (
      <span className="truncate">{t.rich("margin", { percent: figures.percent(profit.margin), figure })}</span>
    )
  }
  // Sales expected to be lost to stockouts before reorders placed today arrive, at each channel's selling price.
  const expectedLoss = restock.expectedLost[0]
  let lossValue: string | null = null
  if (restock.expectedLostItems === 0) {
    lossValue = figures.whole(0, currency ?? "USD")
  } else if (expectedLoss) {
    lossValue = figures.whole(expectedLoss.minor, expectedLoss.currency)
  }
  const lostInPeriod = restock.lostValue[0]
  const salesValue = currency ? figures.whole(totals.revenueMinor, currency) : null
  const ordersValue = hasSales ? figures.number(totals.orders) : null
  const averageValue = currency && averageOrder !== null ? figures.money([{ minor: averageOrder, currency }]) : null
  const unitsValue = hasSales ? figures.number(totals.units) : null
  const profitValue =
    profit.currency && profit.costedRevenueMinor > 0 ? figures.whole(profit.profitMinor, profit.currency) : null
  // Each figure's trend: sales, orders and units a day, and the average order value.
  const trends = {
    sales: trend(sales, (total, days) => perDay(total.revenueMinor, days)),
    orders: trend(sales, (total, days) => perDay(total.orders, days)),
    average: trend(sales, (total) => orderValue(total)),
    units: trend(sales, (total, days) => perDay(total.units, days))
  }

  return (
    <StatGrid label={t("label", { period: periodLabel })}>
      <StatCard
        label={t("sales")}
        info={t("salesInfo")}
        value={shown(salesValue)}
        note={currency ? delta(totals.revenueMinor, previous?.revenueMinor) : missing}
      >
        {trendLine("sales", salesValue, trends.sales)}
      </StatCard>
      <StatCard
        label={t("orders")}
        value={shown(ordersValue)}
        note={hasSales ? delta(totals.orders, previous?.orders) : missing}
      >
        {trendLine("orders", ordersValue, trends.orders)}
      </StatCard>
      <StatCard
        label={t("averageOrder")}
        value={shown(averageValue)}
        note={currency ? averageOrder !== null && delta(averageOrder, previousAverage) : missing}
      >
        {trendLine("average", averageValue, trends.average)}
      </StatCard>
      <StatCard
        label={t("units")}
        value={shown(unitsValue)}
        note={hasSales ? delta(totals.units, previous?.units) : missing}
      >
        {trendLine("units", unitsValue, trends.units)}
      </StatCard>
      <StatCard
        label={t("grossProfit")}
        info={
          caveats.length > 0 && (
            <span className="flex flex-col gap-1">
              {caveats.map((caveat) => (
                <span key={caveat}>{caveat}</span>
              ))}
            </span>
          )
        }
        value={shown(profitValue)}
        loss={profitValue !== null && profit.profitMinor < 0}
        note={profitNote}
      >
        {noTrend}
      </StatCard>
      <StatCard
        label={t("stockoutLosses")}
        info={t("stockoutInfo")}
        value={shown(lossValue)}
        loss={lossValue !== null && restock.expectedLostItems > 0}
        note={
          lostInPeriod ? (
            <span className="truncate">
              {t("lostThisPeriod", { amount: figures.whole(lostInPeriod.minor, lostInPeriod.currency) })}
            </span>
          ) : null
        }
      >
        {noTrend}
      </StatCard>
    </StatGrid>
  )
}

// A group of cards about one thing, under a short heading.
function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-base font-semibold">
        {title}
      </h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  )
}

function SalesByChannel({ data }: { data: Overview }) {
  const t = useTranslations("overview.salesByChannel")
  const { sales } = data
  const hasOrders = sales.daily.some((row) => sales.sources.some((source) => row[source] !== null))
  // A Shopify location shows the orders shipped from it.
  const location = data.channel?.key.startsWith("shopify:") ? data.channel.label : null
  const others = sales.otherMarketplaceOrders
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          {t("title")}
          <InfoTip label={t("aboutLabel")}>
            <span className="flex flex-col gap-1">
              <span>{location ? t("aboutLocation", { location }) : t("about")}</span>
              {others > 0 && <span>{t("otherMarketplaces", { count: others })}</span>}
            </span>
          </InfoTip>
        </CardTitle>
        <CardAction>
          <CardLink href="/sales">{t("orders")}</CardLink>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {hasOrders ? (
          <SalesTrend
            daily={sales.daily}
            previous={sales.previousDaily}
            comparison={data.period.comparison}
            sources={sales.sources}
            currency={sales.currency}
          />
        ) : (
          <p className="flex min-h-64 flex-1 items-center justify-center text-sm text-muted-foreground">
            {t("noOrders")}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export function OverviewDashboard({ data, refresh }: { data: Overview; refresh: () => void }) {
  const t = useTranslations("overview.sections")
  const { sales, restock, purchasing } = data
  // Restock and stock links use the restock channel: Amazon for any Amazon marketplace, eBay's location for eBay.
  const channel = data.restockChannel
  // Restock links open on the chosen channel.
  const attention = data.attention.map((item) =>
    channel && item.href.startsWith("/restock")
      ? { ...item, href: `${item.href}&channel=${encodeURIComponent(channel)}` }
      : item
  )

  return (
    <div className="flex flex-col gap-6">
      {data.setup.some((step) => !step.done) && <SetupChecklist steps={data.setup} refresh={refresh} />}
      <Attention items={attention} />

      <SalesKpis sales={sales} period={data.period} restock={restock} />

      {/* Cards grouped by what they're about: sales, purchasing, products and customers, then stock. */}
      <Section id="overview-sales" title={t("sales")}>
        <div className={salesRow}>
          <SalesByChannel data={data} />
          <ProfitBreakdown sales={sales} />
        </div>
      </Section>

      <Section id="overview-purchasing" title={t("purchasing")}>
        <div className={halves}>
          <OpenOrders purchasing={purchasing} />
          <UpcomingSpend upcoming={data.upcoming} channel={channel} />
        </div>
      </Section>

      <Section id="overview-products" title={sales.customers ? t("productsAndCustomers") : t("products")}>
        {sales.customers ? (
          <div className={wide}>
            <Trending movers={sales.movers} comparable={sales.moversComparable} period={data.period} />
            <Customers customers={sales.customers} />
          </div>
        ) : (
          <Trending movers={sales.movers} comparable={sales.moversComparable} period={data.period} />
        )}
        <BestSellers restock={restock} />
      </Section>

      <Section id="overview-stock" title={t("stock")}>
        <div className={halves}>
          <StockByChannel restock={restock} />
          <DaysOfCover restock={restock} channel={channel} />
        </div>
        <SlowStock restock={restock} />
      </Section>
    </div>
  )
}

// The period and channel every card covers, in the page header once the overview has loaded.
export function OverviewFilters({
  data,
  period = data.period,
  channel = data.channel?.key ?? null,
  onPeriodChange,
  onChannelChange
}: {
  data: Overview
  period?: PickerPeriod
  channel?: string | null
  onPeriodChange: (period: PeriodSelection) => void
  onChannelChange: (channel: string | null) => void
}) {
  const { connected, channels } = data
  if (!connected.length) {
    return null
  }
  return (
    <>
      <PeriodPicker period={period} onChange={onPeriodChange} />
      {channels.length > 1 && <ChannelFilter channels={channels} value={channel} onChange={onChannelChange} />}
    </>
  )
}

export function OverviewFiltersSkeleton() {
  return (
    <>
      <Skeleton className="h-8 w-36 rounded-lg" />
      <Skeleton className="h-8 w-32 rounded-lg" />
    </>
  )
}

export function OverviewSkeleton() {
  const t = useTranslations("overview")
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label={t("loading")}>
      <Skeleton className="h-36 rounded-xl" />
      <StatGrid>
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <Skeleton key={index} className="h-43 rounded-xl" />
        ))}
      </StatGrid>
      <div className={salesRow}>
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </div>
  )
}
