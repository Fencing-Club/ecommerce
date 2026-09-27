import {
  ArrowDownRight,
  ChartLine,
  Info,
  ArrowUpRight,
  Minus,
  Package,
  PiggyBank,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  TrendingDown
} from "lucide-react"
import Link from "next/link"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { change, compactMoney, compactNumber, formatChange, formatMoney, formatPercent, wholeMoney } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Overview } from "@/server/overview"
import { SalesTrend, Sparkline } from "./overview-charts"
import {
  Attention,
  BestSellers,
  CardLink,
  Customers,
  DaysOfCover,
  OpenOrders,
  ProfitBreakdown,
  Purchasing,
  SetupChecklist,
  Shipments,
  SlowStock,
  StockByChannel,
  Trending,
  UpcomingSpend
} from "./overview-sections"
import * as styles from "./overview.css"

const unavailable = "Not available"

function Delta({ current, previous, label }: { current: number; previous: number | null | undefined; label: string }) {
  const value = change(current, previous)
  if (value === null) {
    return null
  }
  let tone: "up" | "down" | "flat" = "flat"
  let Icon = Minus
  if (Math.abs(value) >= 0.005) {
    tone = value > 0 ? "up" : "down"
    Icon = value > 0 ? ArrowUpRight : ArrowDownRight
  }
  return (
    <>
      <span className={styles.delta[tone]}>
        <Icon aria-hidden />
        {formatChange(value)}
      </span>
      <span>{label}</span>
    </>
  )
}

function Kpi({
  label,
  icon: Icon,
  value,
  children,
  trend,
  tone,
  info
}: {
  label: string
  icon: typeof Package
  value: string
  children?: React.ReactNode
  trend?: (number | null)[]
  // A loss reads in red.
  tone?: "loss"
  // What the figure means, behind an info icon after the label.
  info?: string
}) {
  return (
    <Card className={styles.kpi}>
      <CardContent className={styles.stack}>
        <div className={styles.kpiHead}>
          <span className="flex items-center gap-1.5">
            <span className={styles.kpiLabel}>{label}</span>
            {info && (
              <Tooltip>
                <TooltipTrigger
                  aria-label={`About ${label.toLowerCase()}`}
                  className="rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <Info className="size-3.5" aria-hidden />
                </TooltipTrigger>
                <TooltipContent className="max-w-60">{info}</TooltipContent>
              </Tooltip>
            )}
          </span>
          <span className={styles.kpiIcon} aria-hidden>
            <Icon />
          </span>
        </div>
        <div className={styles.kpiBody}>
          <span
            className={
              value === unavailable ? styles.kpiUnavailable : cn(styles.kpiValue, tone === "loss" && styles.kpiLoss)
            }
          >
            {value}
          </span>
          {trend && value !== unavailable && <Sparkline values={trend} />}
        </div>
        <div className={styles.kpiFoot}>{children}</div>
      </CardContent>
    </Card>
  )
}

type Cell = { orders: number; units: number; revenueMinor: number }

// A daily series over the period for the shown sources, null on days no source covers.
function trend(sales: Overview["sales"], pick: (cell: Cell) => number) {
  return sales.daily.map((row) => {
    if (sales.sources.every((source) => row[source] === null)) {
      return null
    }
    return sales.sources.reduce((sum, source) => {
      const cell = row[source]
      return sum + (cell ? pick(cell) : 0)
    }, 0)
  })
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
  const { totals } = sales
  const { previous } = totals
  const versus = period.comparison === "previousYear" ? "vs previous year" : "vs previous period"
  const hasSales = trend(sales, (cell) => cell.orders).some((value) => value !== null)
  const { currency, profit } = sales
  // Sales compare the priced orders of both periods; a few orders Amazon hasn't priced yet are noted, not a reason to
  // hide the change.
  const salesComparable = previous !== null
  const notes: string[] = []
  if (profit.currency && profit.revenueMinor > profit.costedRevenueMinor) {
    notes.push(
      `${compactMoney(profit.revenueMinor - profit.costedRevenueMinor, profit.currency)} of sales without a unit cost left out`
    )
  }
  let profitCaption = "Add unit costs in Shopify to see profit"
  if (!currency) {
    profitCaption = hasSales ? "Sync orders to copy their prices" : "Sync orders to see sales"
  }
  const quiet = hasSales ? period.label : "Sync orders to see sales"
  const averageOrder = orderValue(totals)
  const previousAverage = previous ? orderValue(previous) : null
  // Sales expected to be lost to stockouts before reorders placed today arrive, at each channel's selling price.
  let expectedLoss = unavailable
  if (restock.expectedLostItems === 0) {
    expectedLoss = formatMoney([], { fallback: currency ?? undefined })
  } else if (restock.expectedLost.length) {
    expectedLoss = formatMoney(restock.expectedLost, { compact: true })
  }
  return (
    <section className={styles.kpis} aria-label={`Sales, ${period.label.toLowerCase()}`}>
      <Kpi
        label="Sales"
        icon={Receipt}
        value={currency ? wholeMoney(totals.revenueMinor, currency) : unavailable}
        trend={trend(sales, (cell) => cell.revenueMinor)}
      >
        {currency ? (
          <>
            {salesComparable ? (
              <Delta current={totals.revenueMinor} previous={previous.revenueMinor} label={versus} />
            ) : (
              <span>{period.label}, before tax and shipping</span>
            )}
          </>
        ) : (
          <span>{hasSales ? "Sync orders to copy their prices" : "Sync orders to see sales"}</span>
        )}
      </Kpi>
      <Kpi
        label="Gross profit"
        icon={PiggyBank}
        value={
          profit.currency && profit.costedRevenueMinor ? wholeMoney(profit.profitMinor, profit.currency) : unavailable
        }
      >
        {profit.margin === null ? (
          <span>{profitCaption}</span>
        ) : (
          <>
            <span className={styles.delta[profit.margin >= 0 ? "up" : "down"]}>{formatPercent(profit.margin)}</span>
            <span>{sales.estimatedFeeOrders > 0 ? "margin, some fees estimated" : "margin"}</span>
          </>
        )}
        {notes.map((note) => (
          <span key={note} className={styles.kpiNote}>
            {note}
          </span>
        ))}
      </Kpi>
      <Kpi
        label="Units sold"
        icon={Package}
        value={hasSales ? compactNumber(totals.units) : unavailable}
        trend={trend(sales, (cell) => cell.units)}
      >
        {previous ? <Delta current={totals.units} previous={previous.units} label={versus} /> : <span>{quiet}</span>}
      </Kpi>
      <Kpi
        label="Average order value"
        icon={ShoppingCart}
        value={currency && averageOrder !== null ? formatMoney([{ minor: averageOrder, currency }]) : unavailable}
      >
        {currency && averageOrder !== null && previousAverage !== null && salesComparable ? (
          <Delta current={averageOrder} previous={previousAverage} label={versus} />
        ) : (
          <span>{currency ? `Sales per order, ${period.label.toLowerCase()}` : quiet}</span>
        )}
      </Kpi>
      <Kpi
        label="Orders"
        icon={ShoppingBag}
        value={hasSales ? compactNumber(totals.orders) : unavailable}
        trend={trend(sales, (cell) => cell.orders)}
      >
        {previous ? <Delta current={totals.orders} previous={previous.orders} label={versus} /> : <span>{quiet}</span>}
      </Kpi>
      <Kpi
        label="Stockout losses"
        icon={TrendingDown}
        info="Sales expected to be lost while items are out of stock, before reorders placed today arrive."
        value={expectedLoss}
        tone={restock.expectedLostItems > 0 ? "loss" : undefined}
      >
        {restock.lostValue.length > 0 && (
          <span>{formatMoney(restock.lostValue, { compact: true })} lost in this period</span>
        )}
      </Kpi>
    </section>
  )
}

// A group of cards about one thing, under a short heading.
function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className="text-base font-semibold">
        {title}
      </h2>
      {children}
    </section>
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
    <div className={styles.page}>
      {data.setup.some((step) => !step.done) && <SetupChecklist steps={data.setup} />}
      <Attention items={attention} />

      <SalesKpis sales={sales} period={data.period} restock={restock} />

      {/* Cards grouped by what they're about: sales, then stock, then purchasing. */}
      <Section id="overview-sales" title="Sales">
        <div className={styles.wide}>
          <Card className={styles.fillCard}>
            <CardHeader>
              <CardTitle className={styles.sectionTitle}>
                <ChartLine aria-hidden />
                Sales by channel
              </CardTitle>
              <CardDescription>
                {data.channel && data.channel.key !== "amazon"
                  ? `Shopify orders shipped from ${data.channel.label}. Orders not yet fulfilled aren’t counted.`
                  : "From the orders copied from Shopify and Amazon."}{" "}
                Sales are after discounts, before tax and shipping.
              </CardDescription>
              <CardAction>
                <CardLink href="/sales">Orders</CardLink>
              </CardAction>
            </CardHeader>
            <CardContent className={styles.fill}>
              {sales.daily.some((row) => sales.sources.some((source) => row[source] !== null)) ? (
                <div className={styles.fill}>
                  <SalesTrend
                    daily={sales.daily}
                    previous={sales.previousDaily}
                    previousLabel={data.period.comparisonLabel}
                    sources={sales.sources}
                    currency={sales.currency}
                  />
                  {sales.otherMarketplaceOrders > 0 && (
                    <p className={styles.note}>
                      Amazon orders that Shopify’s Amazon channel copies into Shopify are counted once, from Amazon.{" "}
                      {sales.otherMarketplaceOrders} {sales.otherMarketplaceOrders === 1 ? "order" : "orders"} from
                      Amazon marketplaces outside North America in this period{" "}
                      {sales.otherMarketplaceOrders === 1 ? "isn’t" : "aren’t"} counted, since Copacker reads Amazon US,
                      Canada, Mexico and Brazil only.
                    </p>
                  )}
                </div>
              ) : (
                <p className={styles.note}>
                  Sales appear here once orders are copied. Sync them on the <Link href="/sales">Orders</Link> page.
                </p>
              )}
            </CardContent>
          </Card>
          <ProfitBreakdown sales={sales} />
        </div>
        {sales.customers ? (
          <div className={styles.halves}>
            <Trending movers={sales.movers} comparable={sales.moversComparable} period={data.period} />
            <Customers customers={sales.customers} period={data.period} />
          </div>
        ) : (
          <Trending movers={sales.movers} comparable={sales.moversComparable} period={data.period} />
        )}
        <BestSellers restock={restock} />
      </Section>

      <Section id="overview-stock" title="Stock">
        <div className={styles.halves}>
          <StockByChannel restock={restock} />
          <DaysOfCover restock={restock} channel={channel} />
        </div>
        <SlowStock restock={restock} />
      </Section>

      <Section id="overview-purchasing" title="Purchasing">
        <div className={styles.halves}>
          <div className={styles.stack}>
            <OpenOrders purchasing={purchasing} />
            <UpcomingSpend upcoming={data.upcoming} channel={channel} />
          </div>
          <Shipments stages={data.shipments} />
        </div>
        <Purchasing purchasing={purchasing} />
      </Section>
    </div>
  )
}

export function OverviewSkeleton() {
  return (
    <div className={styles.page} aria-busy="true" aria-label="Loading overview">
      <Skeleton className={styles.skeleton.attention} />
      <div className={styles.kpis}>
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <Skeleton key={index} className={styles.skeleton.kpi} />
        ))}
      </div>
      <div className={styles.wide}>
        <Skeleton className={styles.skeleton.panel} />
        <Skeleton className={styles.skeleton.panel} />
      </div>
    </div>
  )
}
