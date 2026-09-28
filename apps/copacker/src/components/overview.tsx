import { isPresent } from "ts-extras"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { change, formatMoney, formatNumber, formatPercent, wholeMoney } from "@/lib/format"
import { cn } from "@/lib/utils"
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
  DeltaPill,
  OpenOrders,
  ProfitBreakdown,
  SetupChecklist,
  SlowStock,
  StockByChannel,
  Trending,
  UpcomingSpend
} from "./overview-sections"
import { PeriodPicker } from "./period-picker"

// Grids: six KPI tiles, the sales chart beside gross profit, a wide card beside a narrow one, and two even halves.
// The KPI row goes by its own width, sidebar or not: two tiles a row, three once each has room for its whole label,
// and all six from 72rem.
const kpiGrid = "grid grid-cols-2 gap-4 @xl/kpis:grid-cols-3 @6xl/kpis:grid-cols-6"
// Gross profit keeps room for its longest line, "Refunds and disputes" with its share and amount.
const salesRow = "grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(22rem,1fr)]"
const wide = "grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
const halves = "grid grid-cols-1 gap-4 lg:grid-cols-2"

// One headline figure. Every tile has the same parts in the same places, so a row of them lines up: the label on one
// line, the value, its change against the compared period (or a short note), and its trend when there's a daily series.
function Kpi({
  label,
  value,
  info,
  loss,
  footnote,
  trend
}: {
  label: string
  // Null when the figure can't be worked out yet.
  value: string | null
  // What the figure means, behind an info icon after the label.
  info?: React.ReactNode
  // A loss reads in red.
  loss?: boolean
  footnote?: React.ReactNode
  // The line under the figure; `id` names it on the page.
  trend?: { id: string; values: (number | null)[] }
}) {
  return (
    // Two tiles a row on a phone pad less, so each label still fits.
    <Card className="@container gap-3 @max-sm/kpis:[--card-spacing:--spacing(3)]">
      <CardHeader className="grid-cols-1 gap-1">
        <CardDescription className="flex min-w-0 items-center gap-1.5">
          <span className="truncate" title={label}>
            {label}
          </span>
          {info && <InfoTip label={`About ${label.toLowerCase()}`}>{info}</InfoTip>}
        </CardDescription>
        <CardTitle
          className={cn(
            "truncate text-2xl leading-8 font-semibold tracking-tight",
            loss && value !== null && "text-destructive"
          )}
        >
          {value ?? <Dash />}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-end gap-3">
        <div className="flex h-5 min-w-0 items-center gap-1.5 text-xs text-muted-foreground">{footnote}</div>
        {/* Tiles without a series keep the space, so every tile is the same height. */}
        {value !== null && trend && trend.values.filter(isPresent).length > 1 ? (
          <Sparkline id={trend.id} values={trend.values} />
        ) : (
          <div className="h-10" aria-hidden />
        )}
      </CardContent>
    </Card>
  )
}

// Days per point on a KPI's trend: one up to about three months, then a week, then four weeks, so a long period reads
// as a trend rather than noise.
function daysPerPoint(days: number) {
  if (days <= 92) {
    return 1
  }
  return days <= 400 ? 7 : 28
}

// A series over the period for the shown sources, null where no source covers a point's days. `pick` turns the point's
// totals, and how many of its days are covered, into its value.
function trend(sales: Overview["sales"], pick: (total: SourceDay, days: number) => number | null) {
  const step = daysPerPoint(sales.daily.length)
  const series: (number | null)[] = []
  for (let start = 0; start < sales.daily.length; start += step) {
    const rows = sales.daily.slice(start, start + step)
    const cells = rows.flatMap((row) => sales.sources.map((source) => row[source])).filter(isPresent)
    const days = rows.filter((row) => sales.sources.some((source) => row[source] !== null)).length
    series.push(
      cells.length
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
    )
  }
  return series
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
  const { totals, currency, profit } = sales
  const { previous } = totals
  const versus = period.comparison === "previousYear" ? "vs previous year" : "vs previous period"
  const hasSales = sales.daily.some((row) => sales.sources.some((source) => row[source] !== null))
  // Why a sales figure is missing: no orders yet, or orders Amazon hasn't priced.
  const missing = hasSales ? "No prices yet" : "No orders synced"
  // The change against the compared period. The comparison shows beside the pill when the tile has room for it, and
  // is always read out.
  const delta = (current: number, before: number | null | undefined) => {
    const value = change(current, before)
    return value === null ? null : (
      <>
        <DeltaPill value={value} title={versus} />
        <span className="sr-only @min-[15rem]:not-sr-only">
          <span className="whitespace-nowrap">{versus}</span>
        </span>
      </>
    )
  }
  const perDay = (value: number, days: number) => (days ? value / days : null)
  const averageOrder = orderValue(totals)
  const previousAverage = previous ? orderValue(previous) : null
  // What gross profit leaves out, when anything.
  const caveats = [
    profit.currency && profit.revenueMinor > profit.costedRevenueMinor
      ? `Leaves out ${wholeMoney(profit.revenueMinor - profit.costedRevenueMinor, profit.currency)} of sales without a unit cost.`
      : null,
    sales.estimatedFeeOrders > 0 ? "Some fees are estimated until the platform posts them." : null
  ].filter(isPresent)
  let profitNote: React.ReactNode = currency ? "No unit costs" : missing
  if (profit.margin !== null) {
    profitNote = (
      <span className="truncate">
        <span className="font-medium text-foreground tabular-nums">{formatPercent(profit.margin)}</span> margin
      </span>
    )
  }
  // Sales expected to be lost to stockouts before reorders placed today arrive, at each channel's selling price.
  const expectedLoss = restock.expectedLost[0]
  let lossValue: string | null = null
  if (restock.expectedLostItems === 0) {
    lossValue = wholeMoney(0, currency ?? "USD")
  } else if (expectedLoss) {
    lossValue = wholeMoney(expectedLoss.minor, expectedLoss.currency)
  }
  const lostInPeriod = restock.lostValue[0]

  return (
    <section className="@container/kpis" aria-label={`Sales, ${period.label}`}>
      <div className={kpiGrid}>
        <Kpi
          label="Sales"
          info="After discounts, before tax and shipping."
          value={currency ? wholeMoney(totals.revenueMinor, currency) : null}
          footnote={currency ? previous && delta(totals.revenueMinor, previous.revenueMinor) : missing}
          trend={{ id: "sales", values: trend(sales, (total, days) => perDay(total.revenueMinor, days)) }}
        />
        <Kpi
          label="Orders"
          value={hasSales ? formatNumber(totals.orders) : null}
          footnote={hasSales ? previous && delta(totals.orders, previous.orders) : missing}
          trend={{ id: "orders", values: trend(sales, (total, days) => perDay(total.orders, days)) }}
        />
        <Kpi
          label="Average order value"
          value={currency && averageOrder !== null ? formatMoney([{ minor: averageOrder, currency }]) : null}
          footnote={
            currency
              ? averageOrder !== null && previousAverage !== null && delta(averageOrder, previousAverage)
              : missing
          }
          trend={{ id: "average", values: trend(sales, (total) => orderValue(total)) }}
        />
        <Kpi
          label="Units sold"
          value={hasSales ? formatNumber(totals.units) : null}
          footnote={hasSales ? previous && delta(totals.units, previous.units) : missing}
          trend={{ id: "units", values: trend(sales, (total, days) => perDay(total.units, days)) }}
        />
        <Kpi
          label="Gross profit"
          info={
            caveats.length > 0 && (
              <span className="flex flex-col gap-1">
                {caveats.map((caveat) => (
                  <span key={caveat}>{caveat}</span>
                ))}
              </span>
            )
          }
          value={
            profit.currency && profit.costedRevenueMinor > 0 ? wholeMoney(profit.profitMinor, profit.currency) : null
          }
          loss={profit.profitMinor < 0}
          footnote={profitNote}
        />
        <Kpi
          label="Stockout losses"
          info="Sales expected to be lost while items are out of stock, before reorders placed today arrive."
          value={lossValue}
          loss={restock.expectedLostItems > 0}
          footnote={
            lostInPeriod && (
              <span className="truncate">{wholeMoney(lostInPeriod.minor, lostInPeriod.currency)} lost this period</span>
            )
          }
        />
      </div>
    </section>
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
  const { sales } = data
  const hasOrders = sales.daily.some((row) => sales.sources.some((source) => row[source] !== null))
  // A Shopify location shows the orders shipped from it.
  const location = data.channel && !data.channel.key.startsWith("amazon") ? data.channel.label : null
  const others = sales.otherMarketplaceOrders
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          Sales by channel
          <InfoTip label="About sales">
            <span className="flex flex-col gap-1">
              <span>
                {location && `Shopify orders shipped from ${location}. `}After discounts, before tax and shipping.
              </span>
              {others > 0 && (
                <span>
                  {formatNumber(others)} Amazon {others === 1 ? "order" : "orders"} from outside North America{" "}
                  {others === 1 ? "isn’t" : "aren’t"} counted.
                </span>
              )}
            </span>
          </InfoTip>
        </CardTitle>
        <CardAction>
          <CardLink href="/sales">Orders</CardLink>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {hasOrders ? (
          <SalesTrend
            daily={sales.daily}
            previous={sales.previousDaily}
            previousLabel={data.period.comparisonLabel}
            sources={sales.sources}
            currency={sales.currency}
          />
        ) : (
          <p className="flex min-h-64 flex-1 items-center justify-center text-sm text-muted-foreground">
            No orders synced
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export function OverviewDashboard({ data }: { data: Overview }) {
  const { sales, restock, purchasing } = data
  // Restock and stock links use the restock channel: Amazon for any Amazon marketplace.
  const channel = data.channel?.key.startsWith("amazon") ? "amazon" : (data.channel?.key ?? null)
  // Restock links open on the chosen channel.
  const attention = data.attention.map((item) =>
    channel && item.href.startsWith("/restock")
      ? { ...item, href: `${item.href}&channel=${encodeURIComponent(channel)}` }
      : item
  )

  return (
    <div className="flex flex-col gap-6">
      {data.setup.some((step) => !step.done) && <SetupChecklist steps={data.setup} />}
      <Attention items={attention} />

      <SalesKpis sales={sales} period={data.period} restock={restock} />

      {/* Cards grouped by what they're about: sales, purchasing, products and customers, then stock. */}
      <Section id="overview-sales" title="Sales">
        <div className={salesRow}>
          <SalesByChannel data={data} />
          <ProfitBreakdown sales={sales} />
        </div>
      </Section>

      <Section id="overview-purchasing" title="Purchasing">
        <div className={halves}>
          <OpenOrders purchasing={purchasing} />
          <UpcomingSpend upcoming={data.upcoming} channel={channel} />
        </div>
      </Section>

      <Section id="overview-products" title={sales.customers ? "Products and customers" : "Products"}>
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

      <Section id="overview-stock" title="Stock">
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
export async function OverviewFilters({ data }: { data: Promise<Overview> }) {
  const { connected, period, channels, channel } = await data
  if (!connected.length) {
    return null
  }
  return (
    <>
      <PeriodPicker period={period} />
      {channels.length > 1 && <ChannelFilter channels={channels} value={channel?.key ?? null} />}
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
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading overview">
      <Skeleton className="h-36 rounded-xl" />
      <div className="@container/kpis">
        <div className={kpiGrid}>
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Skeleton key={index} className="h-43 rounded-xl" />
          ))}
        </div>
      </div>
      <div className={salesRow}>
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </div>
  )
}
