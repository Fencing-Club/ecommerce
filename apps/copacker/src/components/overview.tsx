import {
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  Globe,
  Minus,
  Package,
  PiggyBank,
  Receipt,
  ShoppingBag
} from "lucide-react"
import Link from "next/link"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { change, compactMoney, compactNumber, formatChange, formatNumber, formatPercent, timeAgo } from "@/lib/format"
import { timeZoneLabel } from "@/lib/time-zone"
import type { Overview } from "@/server/overview"
import { SalesTrend, Sparkline } from "./overview-charts"
import {
  Attention,
  BestSellers,
  CardLink,
  DaysOfCover,
  OpenOrders,
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
  trend
}: {
  label: string
  icon: typeof Package
  value: string
  children?: React.ReactNode
  trend?: (number | null)[]
}) {
  return (
    <Card className={styles.kpi}>
      <CardContent className={styles.stack}>
        <div className={styles.kpiHead}>
          <span className={styles.kpiLabel}>{label}</span>
          <span className={styles.kpiIcon} aria-hidden>
            <Icon />
          </span>
        </div>
        <div className={styles.kpiBody}>
          <span className={value === unavailable ? styles.kpiUnavailable : styles.kpiValue}>{value}</span>
          {trend && value !== unavailable && <Sparkline values={trend} />}
        </div>
        <div className={styles.kpiFoot}>{children}</div>
      </CardContent>
    </Card>
  )
}

type Cell = { orders: number; units: number; revenueMinor: number }

// A daily series over the last 30 days for the shown sources, null on days no source covers.
function trend(sales: Overview["sales"], pick: (cell: Cell) => number) {
  return sales.daily.slice(-30).map((row) => {
    if (sales.sources.every((source) => row[source] === null)) {
      return null
    }
    return sales.sources.reduce((sum, source) => {
      const cell = row[source]
      return sum + (cell ? pick(cell) : 0)
    }, 0)
  })
}

function SalesKpis({ sales }: { sales: Overview["sales"] }) {
  const { last30 } = sales
  const { previous } = last30
  const hasSales = trend(sales, (cell) => cell.orders).some((value) => value !== null)
  const { currency, profit, fees } = sales
  // Sales compare only when neither period has orders without prices.
  const salesComparable = previous !== null && previous.unpriced === 0 && last30.unpriced === 0
  const notes: string[] = []
  if (fees.estimatedOrders) {
    notes.push(`Fees for ${formatNumber(fees.estimatedOrders)} recent Amazon orders are estimated`)
  }
  if (profit.currency && profit.revenueMinor > profit.costedRevenueMinor) {
    notes.push(
      `${compactMoney(profit.revenueMinor - profit.costedRevenueMinor, profit.currency)} of sales without a unit cost left out`
    )
  }
  let profitCaption = "Add unit costs in Shopify to see profit"
  if (!currency) {
    profitCaption = hasSales ? "Sync orders to copy their prices" : "Sync orders to see sales"
  }
  const quiet = hasSales ? "Last 30 days" : "Sync orders to see sales"
  return (
    <section className={styles.kpis} aria-label="Sales in the last 30 days">
      <Kpi
        label="Sales"
        icon={Receipt}
        value={currency ? compactMoney(last30.revenueMinor, currency) : unavailable}
        trend={trend(sales, (cell) => cell.revenueMinor)}
      >
        {currency ? (
          <>
            {salesComparable ? (
              <Delta current={last30.revenueMinor} previous={previous.revenueMinor} label="vs previous 30 days" />
            ) : (
              <span>Last 30 days, before tax and shipping</span>
            )}
            {last30.unpriced > 0 && (
              <span className={styles.kpiNote}>{formatNumber(last30.unpriced)} orders without prices left out</span>
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
          profit.currency && profit.costedRevenueMinor ? compactMoney(profit.profitMinor, profit.currency) : unavailable
        }
      >
        {profit.margin === null ? (
          <span>{profitCaption}</span>
        ) : (
          <>
            <span className={styles.delta[profit.margin >= 0 ? "up" : "down"]}>{formatPercent(profit.margin)}</span>
            <span>margin after unit costs{fees.feesMinor ? " and Amazon fees" : ""}</span>
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
        value={hasSales ? compactNumber(last30.units) : unavailable}
        trend={trend(sales, (cell) => cell.units)}
      >
        {previous ? (
          <Delta current={last30.units} previous={previous.units} label="vs previous 30 days" />
        ) : (
          <span>{quiet}</span>
        )}
      </Kpi>
      <Kpi
        label="Orders"
        icon={ShoppingBag}
        value={hasSales ? compactNumber(last30.orders) : unavailable}
        trend={trend(sales, (cell) => cell.orders)}
      >
        {previous ? (
          <Delta current={last30.orders} previous={previous.orders} label="vs previous 30 days" />
        ) : (
          <span>{quiet}</span>
        )}
      </Kpi>
    </section>
  )
}

// When orders and stock were last copied, and the time zone days follow.
export function Freshness({ data }: { data: Overview }) {
  const now = new Date(data.generatedAt)
  return (
    <ul className={styles.freshness} aria-label="Data freshness">
      {data.freshness.map((entry) => (
        <li key={entry.key} className={styles.freshnessItem}>
          <Clock aria-hidden />
          <span>
            {entry.label} {entry.at ? `synced ${timeAgo(entry.at, now)}` : "not synced yet"}
          </span>
        </li>
      ))}
      <li className={styles.freshnessItem}>
        <Globe aria-hidden />
        {data.timeZoneSet ? (
          <span>Days in {timeZoneLabel(data.timeZone)}</span>
        ) : (
          <Link href="/settings" className={styles.freshnessLink}>
            Days in UTC until you set your store’s time zone
          </Link>
        )}
      </li>
    </ul>
  )
}

export function OverviewDashboard({ data }: { data: Overview }) {
  const { sales, restock, purchasing } = data
  const channel = data.channel?.key ?? null
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

      <SalesKpis sales={sales} />

      <div className={styles.wide}>
        <Card>
          <CardHeader>
            <CardTitle>Sales by channel</CardTitle>
            <CardDescription>
              From the orders copied from Shopify and Amazon. Sales are after discounts, before tax and shipping.
            </CardDescription>
            <CardAction>
              <CardLink href="/sales">Orders</CardLink>
            </CardAction>
          </CardHeader>
          <CardContent>
            {sales.daily.some((row) => sales.sources.some((source) => row[source] !== null)) ? (
              <SalesTrend daily={sales.daily} sources={sales.sources} currency={sales.currency} />
            ) : (
              <p className={styles.note}>
                Sales appear here once orders are copied. Sync them on the <Link href="/sales">Orders</Link> page.
              </p>
            )}
          </CardContent>
        </Card>
        <StockByChannel restock={restock} />
      </div>

      <div className={styles.halves}>
        <DaysOfCover restock={restock} channel={channel} />
        <UpcomingSpend upcoming={data.upcoming} channel={channel} />
      </div>

      <div className={styles.halves}>
        <Trending movers={sales.movers} comparable={sales.moversComparable} />
        <SlowStock restock={restock} />
      </div>

      <div className={styles.wide}>
        <BestSellers restock={restock} />
        <div className={styles.stack}>
          <Shipments stages={data.shipments} />
          <OpenOrders purchasing={purchasing} />
        </div>
      </div>

      <Purchasing purchasing={purchasing} />
    </div>
  )
}

export function OverviewSkeleton() {
  return (
    <div className={styles.page} aria-busy="true" aria-label="Loading overview">
      <Skeleton className={styles.skeleton.attention} />
      <div className={styles.kpis}>
        {[0, 1, 2, 3].map((index) => (
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
