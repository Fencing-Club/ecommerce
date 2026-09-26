import { money } from "@repo/aisle"
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Info,
  Minus,
  Package,
  ShoppingBag,
  Truck,
  Warehouse
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { change, compactMoney, compactNumber, formatChange, formatNumber } from "@/lib/format"
import type { AttentionItem, Money, Overview } from "@/server/overview"
import { CoverChart, SalesTrend, Sparkline, SpendChart } from "./overview-charts"
import * as styles from "./overview.css"
import { vars } from "@/styles/theme.css"

function formatMoney(value: Money, compact = false) {
  const [first] = value
  if (!first) {
    return compact ? "$0" : money(0)
  }
  return compact ? compactMoney(first.minor, first.currency) : money(first.minor, first.currency)
}

// Money in more than one currency can't be added up; the others are named under the headline figure.
function otherCurrencies(value: Money) {
  return value.length > 1
    ? `Plus ${value
        .slice(1)
        .map((entry) => money(entry.minor, entry.currency))
        .join(" and ")}`
    : null
}

const unavailable = "Not available"

// Stock value, or "Not available" when nothing in stock has a unit cost to value it by.
function stockValue(restock: Overview["restock"], compact = false) {
  return !restock.stockValue.length && restock.uncosted ? unavailable : formatMoney(restock.stockValue, compact)
}

function reorderCaption(restock: Overview["restock"]) {
  const due = restock.stockouts + restock.reorders
  if (!due) {
    return "Nothing is due for a reorder"
  }
  const items = `${due} ${due === 1 ? "item" : "items"}`
  if (restock.reorderUncosted === due) {
    return `Add unit costs in Shopify to estimate ${due === 1 ? "the" : "all"} ${items} due`
  }
  if (restock.reorderUncosted) {
    return `For ${items} due, ${restock.reorderUncosted} without a unit cost`
  }
  return `For ${items} due for a reorder`
}

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
          {trend && <Sparkline values={trend} />}
        </div>
        <div className={styles.kpiFoot}>{children}</div>
      </CardContent>
    </Card>
  )
}

const toneIcons = { critical: AlertTriangle, warning: AlertTriangle, info: Info }

function Attention({ items }: { items: AttentionItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Needs attention</CardTitle>
        <CardDescription>
          {items.length
            ? "The things that need you, most urgent first."
            : "Stock, shipments and syncs are all on track."}
        </CardDescription>
        {items.length > 0 && (
          <CardAction>
            <Badge variant={items.some((item) => item.tone === "critical") ? "destructive" : "secondary"}>
              {items.length} {items.length === 1 ? "item" : "items"}
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {items.length ? (
          <div className={styles.attentionList}>
            {items.map((item) => {
              const Icon = toneIcons[item.tone]
              return (
                <Link key={item.key} href={item.href} className={styles.attentionRow}>
                  <span className={styles.toneIcon[item.tone]} aria-hidden>
                    <Icon />
                  </span>
                  <span className={styles.attentionText}>
                    <span className={styles.attentionTitle}>{item.title}</span>
                    <span className={styles.attentionDetail}>{item.detail}</span>
                  </span>
                  <span className={styles.attentionAction}>
                    {item.action}
                    <ChevronRight aria-hidden />
                  </span>
                </Link>
              )
            })}
          </div>
        ) : (
          <div className={styles.attentionList}>
            <div className={styles.attentionRow}>
              <span className={styles.toneIcon.success} aria-hidden>
                <CheckCircle2 />
              </span>
              <span className={styles.attentionText}>
                <span className={styles.attentionTitle}>You’re all caught up</span>
                <span className={styles.attentionDetail}>Nothing needs your attention right now.</span>
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={styles.cardLink}>
      {children}
      <ArrowRight aria-hidden />
    </Link>
  )
}

function StockByChannel({ restock }: { restock: Overview["restock"] }) {
  const largest = Math.max(1, ...restock.channels.map((channel) => channel.available + channel.incoming))
  return (
    <Card>
      <CardHeader>
        <CardTitle className={styles.sectionTitle}>
          <Warehouse aria-hidden />
          Stock by channel
        </CardTitle>
        <CardDescription>Sellable units on hand and on the way.</CardDescription>
        <CardAction>
          <CardLink href="/products">Products</CardLink>
        </CardAction>
      </CardHeader>
      <CardContent className={styles.stack}>
        {restock.channels.length ? (
          <div className={styles.meters}>
            {restock.channels.map((channel) => {
              const color = channel.key === "amazon" ? vars.color.chart1 : vars.color.chart2
              return (
                <div key={channel.key} className={styles.meter}>
                  <div className={styles.meterHead}>
                    <span className={styles.meterName}>{channel.label}</span>
                    <span className={styles.meterValue}>{formatNumber(channel.available)} on hand</span>
                  </div>
                  <div className={styles.meterTrack} aria-hidden>
                    <span
                      className={styles.meterFill}
                      style={{ width: `${(channel.available / largest) * 100}%`, backgroundColor: color }}
                    />
                    {channel.incoming > 0 && (
                      <span
                        className={styles.meterFill}
                        style={{
                          width: `${(channel.incoming / largest) * 100}%`,
                          backgroundColor: `color-mix(in oklch, ${color} 35%, transparent)`
                        }}
                      />
                    )}
                  </div>
                  <div className={styles.meterDetail}>
                    <span>{formatNumber(channel.incoming)} on the way</span>
                    <span>{channel.value.length ? `${formatMoney(channel.value)} at cost` : "No unit costs"}</span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className={styles.note}>Sync stock on the Products page to see it here.</p>
        )}
        <div className={styles.figures}>
          <div className={styles.figure}>
            <span className={styles.figureLabel}>Units on hand</span>
            <span className={styles.figureValue}>{formatNumber(restock.unitsOnHand)}</span>
          </div>
          <div className={styles.figure}>
            <span className={styles.figureLabel}>Value at cost</span>
            <span className={styles.figureValue}>{stockValue(restock)}</span>
          </div>
        </div>
        {restock.uncosted > 0 && (
          <p className={styles.note}>
            {restock.uncosted} {restock.uncosted === 1 ? "item in stock has" : "items in stock have"} no unit cost in
            Shopify, so {restock.uncosted === 1 ? "it isn't" : "they aren't"} counted in the value.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

const sellerStatus = {
  stockout: { label: "Reorder now", variant: "destructive" },
  reorder: { label: "Reorder soon", variant: "secondary" },
  stocked: { label: "Stocked", variant: "outline" }
} as const

function BestSellers({ restock }: { restock: Overview["restock"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className={styles.sectionTitle}>
          <ShoppingBag aria-hidden />
          Best sellers
        </CardTitle>
        <CardDescription>Units sold in the last {restock.days / 7} weeks, across every channel.</CardDescription>
        <CardAction>
          <CardLink href="/restock">Restock</CardLink>
        </CardAction>
      </CardHeader>
      <CardContent>
        {restock.bestSellers.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className={styles.number}>Sold</TableHead>
                <TableHead className={styles.number}>On hand</TableHead>
                <TableHead className={styles.number}>Days of cover</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {restock.bestSellers.map((seller) => {
                const status = sellerStatus[seller.status]
                return (
                  <TableRow key={seller.variantId}>
                    <TableCell>
                      <div className={styles.product}>
                        {seller.imageUrl ? (
                          <Image
                            src={seller.imageUrl}
                            alt=""
                            width={36}
                            height={36}
                            unoptimized
                            className={styles.thumb}
                          />
                        ) : (
                          <span className={styles.thumbEmpty} aria-hidden>
                            <Package />
                          </span>
                        )}
                        <span className={styles.productText}>
                          <span className={styles.productTitle}>{seller.product}</span>
                          <span className={styles.productDetail}>
                            {[seller.variant, seller.sku].filter(Boolean).join(", ") || seller.channels.join(", ")}
                          </span>
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className={styles.number}>{formatNumber(seller.sold)}</TableCell>
                    <TableCell className={styles.number}>{formatNumber(seller.available)}</TableCell>
                    <TableCell className={styles.number}>
                      {seller.daysRemaining === null ? "Unknown" : `${formatNumber(seller.daysRemaining)} days`}
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        ) : (
          <p className={styles.note}>Best sellers appear once orders and stock have synced.</p>
        )}
      </CardContent>
    </Card>
  )
}

const stageDots = {
  you: "you",
  problem: "problem",
  packing: "active",
  booking: "active",
  ready: "active",
  transit: "active"
} as const

function Shipments({ stages }: { stages: Overview["shipments"] }) {
  const total = stages.reduce((sum, stage) => sum + stage.shipments, 0)
  return (
    <Card>
      <CardHeader>
        <CardTitle className={styles.sectionTitle}>
          <Truck aria-hidden />
          Shipments in progress
        </CardTitle>
        <CardDescription>
          {total
            ? `${total} ${total === 1 ? "shipment" : "shipments"} between supplier and Amazon.`
            : "No shipments are in progress."}
        </CardDescription>
        <CardAction>
          <CardLink href="/shipments">Shipments</CardLink>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className={styles.stages}>
          {stages.map((stage) => (
            <div key={stage.key} className={styles.stage}>
              <span className={styles.stageName}>
                <span className={styles.stageDot[stage.shipments ? stageDots[stage.key] : "quiet"]} aria-hidden />
                {stage.label}
              </span>
              <span className={styles.stageCount}>{stage.shipments}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function OpenOrders({ purchasing }: { purchasing: Overview["purchasing"] }) {
  const largest = Math.max(1, ...purchasing.bySupplier.map((supplier) => supplier.value[0]?.minor ?? 0))
  return (
    <Card>
      <CardHeader>
        <CardTitle className={styles.sectionTitle}>
          <ClipboardList aria-hidden />
          Open purchase orders
        </CardTitle>
        <CardDescription>Value sent to each supplier and not yet closed.</CardDescription>
        <CardAction>
          <CardLink href="/orders">Purchase orders</CardLink>
        </CardAction>
      </CardHeader>
      <CardContent className={styles.stack}>
        {purchasing.bySupplier.length ? (
          <div className={styles.meters}>
            {purchasing.bySupplier.slice(0, 5).map((supplier) => (
              <div key={supplier.name} className={styles.meter}>
                <div className={styles.meterHead}>
                  <span className={styles.meterName}>{supplier.name}</span>
                  <span className={styles.meterValue}>{formatMoney(supplier.value)}</span>
                </div>
                <div className={styles.meterTrack} aria-hidden>
                  <span
                    className={styles.meterFill}
                    style={{
                      width: `${((supplier.value[0]?.minor ?? 0) / largest) * 100}%`,
                      backgroundColor: vars.color.chart1
                    }}
                  />
                </div>
                <div className={styles.meterDetail}>
                  <span>
                    {supplier.orders} {supplier.orders === 1 ? "order" : "orders"}
                  </span>
                  {otherCurrencies(supplier.value) && <span>{otherCurrencies(supplier.value)}</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.note}>No purchase orders are with suppliers.</p>
        )}
        <div className={styles.figures}>
          <div className={styles.figure}>
            <span className={styles.figureLabel}>Open</span>
            <span className={styles.figureValue}>{formatMoney(purchasing.open)}</span>
          </div>
          <div className={styles.figure}>
            <span className={styles.figureLabel}>
              {purchasing.draftCount} {purchasing.draftCount === 1 ? "draft" : "drafts"}
            </span>
            <span className={styles.figureValue}>{formatMoney(purchasing.drafts)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function OverviewDashboard({ data }: { data: Overview }) {
  const { sales, restock, purchasing } = data
  const last30 = sales.daily.slice(-30)
  const unitsTrend = last30.map((row) =>
    sales.sources.every((source) => row[source] === null)
      ? null
      : sales.sources.reduce((sum, source) => sum + (row[source]?.units ?? 0), 0)
  )
  const ordersTrend = last30.map((row) =>
    sales.sources.every((source) => row[source] === null)
      ? null
      : sales.sources.reduce((sum, source) => sum + (row[source]?.orders ?? 0), 0)
  )
  const hasSales = unitsTrend.some((value) => value !== null)

  return (
    <div className={styles.page}>
      <Attention items={data.attention} />

      <section className={styles.kpis} aria-label="Key figures">
        <Kpi
          label="Units sold"
          icon={Package}
          value={hasSales ? compactNumber(sales.last30.units) : unavailable}
          trend={unitsTrend}
        >
          <Delta current={sales.last30.units} previous={sales.last30.previous?.units} label="vs previous 30 days" />
          {!sales.last30.previous && <span>{hasSales ? "Last 30 days" : "Sync orders to see sales"}</span>}
        </Kpi>
        <Kpi
          label="Orders"
          icon={ShoppingBag}
          value={hasSales ? compactNumber(sales.last30.orders) : unavailable}
          trend={ordersTrend}
        >
          <Delta current={sales.last30.orders} previous={sales.last30.previous?.orders} label="vs previous 30 days" />
          {!sales.last30.previous && <span>{hasSales ? "Last 30 days" : "Sync orders to see sales"}</span>}
        </Kpi>
        <Kpi label="Stock value at cost" icon={Boxes} value={stockValue(restock, true)}>
          <span>
            {!restock.stockValue.length && restock.uncosted
              ? "Add unit costs in Shopify to value your stock"
              : `${formatNumber(restock.unitsOnHand)} units on hand`}
          </span>
        </Kpi>
        <Kpi
          label="Reorder estimate"
          icon={Warehouse}
          value={
            !restock.reorderCost.length && restock.reorderUncosted
              ? unavailable
              : formatMoney(restock.reorderCost, true)
          }
        >
          <span>{reorderCaption(restock)}</span>
        </Kpi>
      </section>

      <div className={styles.wide}>
        <Card>
          <CardHeader>
            <CardTitle>Units sold</CardTitle>
            <CardDescription>By sales channel, from the orders copied from Shopify and Amazon.</CardDescription>
            <CardAction>
              <CardLink href="/sales">Orders</CardLink>
            </CardAction>
          </CardHeader>
          <CardContent>
            {sales.sources.length ? (
              <SalesTrend daily={sales.daily} sources={sales.sources} />
            ) : (
              <p className={styles.note}>Connect Shopify or Amazon in Settings to see sales.</p>
            )}
          </CardContent>
        </Card>
        <StockByChannel restock={restock} />
      </div>

      <div className={styles.halves}>
        <Card>
          <CardHeader>
            <CardTitle>Days of cover</CardTitle>
            <CardDescription>
              How long each item’s stock lasts in each channel at the last {restock.days / 7} weeks’ sales rate.
            </CardDescription>
          </CardHeader>
          <CardContent className={styles.stack}>
            <CoverChart buckets={restock.cover} />
            {restock.lostDays > 0 && (
              <p className={styles.note}>
                {restock.itemsOut} {restock.itemsOut === 1 ? "item was" : "items were"} out of stock for a combined{" "}
                {formatNumber(restock.lostDays)} days in the last {restock.days / 7} weeks.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Purchasing</CardTitle>
            <CardDescription>
              {purchasing.spend.currency
                ? `Purchase orders sent each month, in ${purchasing.spend.currency}.`
                : "Purchase orders sent each month."}
            </CardDescription>
            <CardAction>
              <CardLink href="/orders">Purchase orders</CardLink>
            </CardAction>
          </CardHeader>
          <CardContent className={styles.stack}>
            {purchasing.spend.currency ? (
              <SpendChart months={purchasing.spend.months} currency={purchasing.spend.currency} />
            ) : (
              <p className={styles.note}>Send a purchase order to see spending by month.</p>
            )}
            {purchasing.spend.otherCurrencies && (
              <p className={styles.note}>Purchase orders in other currencies aren’t included in the chart.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className={styles.wide}>
        <BestSellers restock={restock} />
        <div className={styles.stack}>
          <Shipments stages={data.shipments} />
          <OpenOrders purchasing={purchasing} />
        </div>
      </div>
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
