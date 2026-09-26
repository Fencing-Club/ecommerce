import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Circle,
  ClipboardList,
  Hourglass,
  Info,
  Package,
  ShoppingBag,
  TrendingUp,
  Truck,
  Wallet,
  Warehouse
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { change, formatChange, formatMoney, formatNumber, otherCurrencies } from "@/lib/format"
import type { AttentionItem, Overview, SetupStep } from "@/server/overview"
import { CoverChart, SpendChart } from "./overview-charts"
import * as styles from "./overview.css"
import { vars } from "@/styles/theme.css"
import { srOnly } from "@/styles/utilities.css"

// Restock filtered to what a card shows. Restock opens on one channel, so a link names the channel it's about.
export function restockHref(filters: { channel?: string | null; cover?: string; q?: string | null; status?: string }) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(key, value)
    }
  }
  const query = params.toString()
  return query ? `/restock?${query}` : "/restock"
}

export function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={styles.cardLink}>
      {children}
      <ArrowRight aria-hidden />
    </Link>
  )
}

function Thumbnail({ url }: { url: string | null }) {
  return url ? (
    <Image src={url} alt="" width={36} height={36} unoptimized className={styles.thumb} />
  ) : (
    <span className={styles.thumbEmpty} aria-hidden>
      <Package />
    </span>
  )
}

function plural(count: number, one: string, many: string) {
  return `${formatNumber(count)} ${count === 1 ? one : many}`
}

export function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  const done = steps.filter((step) => step.done).length
  return (
    <Card>
      <CardHeader>
        <CardTitle>Finish setting up</CardTitle>
        <CardDescription>
          {done} of {steps.length} done. Each step fills in more of this page.
        </CardDescription>
      </CardHeader>
      <CardContent className={styles.stack}>
        {/* The description above says how many steps are done; the bar only shows it. */}
        <div className={styles.progressTrack} aria-hidden>
          <span className={styles.progressFill} style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
        <ol className={styles.steps}>
          {steps.map((step) => (
            <li key={step.key}>
              {step.done ? (
                <div className={styles.step} data-done="">
                  <CheckCircle2 className={styles.stepDone} aria-hidden />
                  <span className={styles.attentionText}>
                    <span className={styles.stepTitle}>{step.title}</span>
                    <span className={srOnly}>Done</span>
                  </span>
                </div>
              ) : (
                <Link href={step.href} className={styles.step}>
                  <Circle className={styles.stepTodo} aria-hidden />
                  <span className={styles.attentionText}>
                    <span className={styles.stepTitle}>{step.title}</span>
                    <span className={styles.attentionDetail}>{step.detail}</span>
                  </span>
                  <ChevronRight className={styles.stepChevron} aria-hidden />
                </Link>
              )}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

const toneIcons = { critical: AlertTriangle, warning: AlertTriangle, info: Info }

export function Attention({ items }: { items: AttentionItem[] }) {
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
              {plural(items.length, "item", "items")}
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <div className={styles.attentionList}>
          {items.length ? (
            items.map((item) => {
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
            })
          ) : (
            <div className={styles.attentionRow}>
              <span className={styles.toneIcon.success} aria-hidden>
                <CheckCircle2 />
              </span>
              <span className={styles.attentionText}>
                <span className={styles.attentionTitle}>You’re all caught up</span>
                <span className={styles.attentionDetail}>Nothing needs your attention right now.</span>
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function Figure({ label, value, note }: { label: string; value: string; note?: string | null }) {
  return (
    <div className={styles.figure}>
      <span className={styles.figureLabel}>{label}</span>
      <span className={styles.figureValue}>{value}</span>
      {note && <span className={styles.figureNote}>{note}</span>}
    </div>
  )
}

// Retail value less cost, when both are known in the same currency.
function potentialProfit(restock: Overview["restock"]) {
  const retail = restock.retailValue[0]
  const cost = restock.stockValue[0]
  return retail && cost && retail.currency === cost.currency && !restock.uncosted && !restock.unpriced
    ? [{ currency: retail.currency, minor: retail.minor - cost.minor }]
    : null
}

export function StockByChannel({ restock }: { restock: Overview["restock"] }) {
  const largest = Math.max(1, ...restock.channels.map((channel) => channel.available + channel.incoming))
  const profit = potentialProfit(restock)
  const notAvailable = "Not available"
  return (
    <Card>
      <CardHeader>
        <CardTitle className={styles.sectionTitle}>
          <Warehouse aria-hidden />
          Inventory
        </CardTitle>
        <CardDescription>Sellable units on hand and on the way, by channel.</CardDescription>
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
          <Figure label="Units on hand" value={formatNumber(restock.unitsOnHand)} />
          <Figure
            label="Value at cost"
            value={restock.stockValue.length || !restock.uncosted ? formatMoney(restock.stockValue) : notAvailable}
            note={otherCurrencies(restock.stockValue)}
          />
          <Figure
            label="Retail value"
            value={restock.retailValue.length || !restock.unpriced ? formatMoney(restock.retailValue) : notAvailable}
            note={otherCurrencies(restock.retailValue)}
          />
          <Figure label="Potential gross profit" value={profit ? formatMoney(profit) : notAvailable} />
        </div>
        <p className={styles.note}>
          Retail value prices each unit at what it sold for in that channel over the last 60 days, or its Shopify price.
          {restock.landedProducts > 0
            ? ` Costs include freight and duty for ${plural(restock.landedProducts, "product", "products")}, from the landed costs on ${restock.landedProducts === 1 ? "its latest purchase order" : "their latest purchase orders"}.`
            : " Costs are Shopify unit costs; add landed costs to a purchase order to include freight and duty."}
          {restock.uncosted > 0 &&
            ` ${plural(restock.uncosted, "item in stock has", "items in stock have")} no unit cost in Shopify.`}
          {restock.unpriced > 0 && ` ${plural(restock.unpriced, "item has", "items have")} no price.`}
          {(restock.uncosted > 0 || restock.unpriced > 0) && " Values leave them out."}
        </p>
      </CardContent>
    </Card>
  )
}

export function DaysOfCover({ restock, channel }: { restock: Overview["restock"]; channel: string | null }) {
  const weeks = restock.days / 7
  return (
    <Card>
      <CardHeader>
        <CardTitle>Days of cover</CardTitle>
        <CardDescription>
          How long each item’s stock lasts in each channel at the last {weeks} weeks’ sales rate. Select a group to see
          its items.
        </CardDescription>
      </CardHeader>
      <CardContent className={styles.stack}>
        <CoverChart
          buckets={restock.cover.map((bucket) => ({
            key: bucket.key,
            label: bucket.label,
            items: bucket.items,
            href: bucket.items ? restockHref({ channel: channel ?? bucket.channel, cover: bucket.key }) : null
          }))}
        />
        {restock.lostDays > 0 && (
          <div className={styles.callout}>
            <Hourglass aria-hidden />
            <p>
              {restock.lostUnits > 0 ? (
                <>
                  <strong>
                    About {plural(restock.lostUnits, "unit", "units")}
                    {restock.lostValue.length > 0 && ` (${formatMoney(restock.lostValue, { compact: true })})`}
                  </strong>{" "}
                  of sales were lost to stockouts in the last {weeks} weeks:{" "}
                  {plural(restock.itemsOut, "item was", "items were")} out of stock for{" "}
                  {plural(restock.lostDays, "day", "days")} in all.
                </>
              ) : (
                <>
                  {plural(restock.itemsOut, "item was", "items were")} out of stock for{" "}
                  {plural(restock.lostDays, "day", "days")} in all in the last {weeks} weeks.
                </>
              )}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function UpcomingSpend({ upcoming, channel }: { upcoming: Overview["upcoming"]; channel: string | null }) {
  const rows = [
    {
      key: "reorders",
      label: "Reorders due now",
      detail: "Estimated from Shopify unit costs",
      value: upcoming.reorders,
      href: restockHref({ status: "order", channel })
    },
    ...upcoming.purchaseOrders.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      detail: bucket.orders ? plural(bucket.orders, "purchase order", "purchase orders") : "No purchase orders",
      value: bucket.value,
      href: "/orders"
    }))
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle className={styles.sectionTitle}>
          <Wallet aria-hidden />
          Upcoming spend
        </CardTitle>
        <CardDescription>Reorders that are due, and sent purchase orders by their due date.</CardDescription>
      </CardHeader>
      <CardContent className={styles.stack}>
        <div className={styles.hero}>
          <span className={styles.figureLabel}>Next 60 days</span>
          <span className={styles.heroValue}>{formatMoney(upcoming.next60)}</span>
          {otherCurrencies(upcoming.next60) && <span className={styles.note}>{otherCurrencies(upcoming.next60)}</span>}
        </div>
        <div className={styles.stages}>
          {rows.map((row) => (
            <Link key={row.key} href={row.href} className={styles.spendRow}>
              <span className={styles.attentionText}>
                <span className={styles.stepTitle}>{row.label}</span>
                <span className={styles.attentionDetail}>{row.detail}</span>
              </span>
              <span className={styles.stageCount}>{formatMoney(row.value)}</span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function MoverRow({ mover }: { mover: Overview["sales"]["movers"]["rising"][number] }) {
  const value = change(mover.current, mover.previous)
  const up = mover.current >= mover.previous
  return (
    <li className={styles.mover}>
      <Thumbnail url={mover.imageUrl} />
      <span className={styles.productText}>
        <Link href={restockHref({ q: mover.sku ?? mover.product })} className={styles.productLink}>
          {mover.product}
        </Link>
        <span className={styles.productDetail}>
          {formatNumber(mover.previous)} to {formatNumber(mover.current)} units
          {mover.variant && `, ${mover.variant}`}
        </span>
      </span>
      <span className={styles.delta[up ? "up" : "down"]}>
        {up ? <ArrowUpRight aria-hidden /> : <ArrowDownRight aria-hidden />}
        {value === null ? "New" : formatChange(value)}
      </span>
    </li>
  )
}

export function Trending({
  movers,
  comparable,
  period
}: {
  movers: Overview["sales"]["movers"]
  comparable: boolean
  period: Overview["period"]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className={styles.sectionTitle}>
          <TrendingUp aria-hidden />
          Trending products
        </CardTitle>
        <CardDescription>
          {period.previousLabel
            ? `Units sold ${period.rangeLabel} against ${period.previousLabel}.`
            : "Units sold in the period against the one before it."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!comparable && (
          <p className={styles.note}>
            {period.previousLabel
              ? "Trends appear once orders cover both periods."
              : "Choose a comparison to see what’s selling more and less."}
          </p>
        )}
        {comparable && !movers.rising.length && !movers.falling.length && (
          <p className={styles.note}>Sales are steady: no product changed by more than a few units.</p>
        )}
        {comparable && (movers.rising.length > 0 || movers.falling.length > 0) && (
          <div className={styles.movers}>
            <div className={styles.stack}>
              <h3 className={styles.listHeading}>Selling more</h3>
              {movers.rising.length ? (
                <ul className={styles.moverList}>
                  {movers.rising.map((mover) => (
                    <MoverRow key={mover.id} mover={mover} />
                  ))}
                </ul>
              ) : (
                <p className={styles.note}>Nothing is selling noticeably more.</p>
              )}
            </div>
            <div className={styles.stack}>
              <h3 className={styles.listHeading}>Selling less</h3>
              {movers.falling.length ? (
                <ul className={styles.moverList}>
                  {movers.falling.map((mover) => (
                    <MoverRow key={mover.id} mover={mover} />
                  ))}
                </ul>
              ) : (
                <p className={styles.note}>Nothing is selling noticeably less.</p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function SlowStock({ restock }: { restock: Overview["restock"] }) {
  const { slow } = restock
  return (
    <Card>
      <CardHeader>
        <CardTitle className={styles.sectionTitle}>
          <Hourglass aria-hidden />
          Slow-moving stock
        </CardTitle>
        <CardDescription>
          Stock that lasts over 3 months at the current rate, or didn’t sell in the last {restock.days / 7} weeks.
        </CardDescription>
      </CardHeader>
      <CardContent className={styles.stack}>
        {slow.items ? (
          <>
            <div className={styles.figures}>
              <Figure label="Held at cost" value={slow.value.length ? formatMoney(slow.value) : "Not available"} />
              <Figure label="Units" value={formatNumber(slow.units)} note={plural(slow.items, "item", "items")} />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className={styles.number}>On hand</TableHead>
                  <TableHead className={styles.number}>Cover</TableHead>
                  <TableHead className={styles.number}>At cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slow.top.map((item) => (
                  <TableRow key={`${item.channelKey}:${item.variantId}`}>
                    <TableCell>
                      <div className={styles.product}>
                        <Thumbnail url={item.imageUrl} />
                        <span className={styles.productText}>
                          <Link
                            href={restockHref({
                              channel: item.channelKey,
                              cover: item.bucket,
                              q: item.sku ?? item.product
                            })}
                            className={styles.productLink}
                          >
                            {item.product}
                          </Link>
                          <span className={styles.productDetail}>
                            {[item.variant, item.channel].filter(Boolean).join(", ")}
                          </span>
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className={styles.number}>{formatNumber(item.available)}</TableCell>
                    <TableCell className={styles.number}>
                      {item.bucket === "unsold" || item.daysRemaining === null
                        ? "Not selling"
                        : `${formatNumber(item.daysRemaining)} days`}
                    </TableCell>
                    <TableCell className={styles.number}>
                      {item.value ? formatMoney([item.value]) : "No cost"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        ) : (
          <p className={styles.note}>Everything in stock is selling through within 3 months.</p>
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

export function BestSellers({ restock }: { restock: Overview["restock"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className={styles.sectionTitle}>
          <ShoppingBag aria-hidden />
          Best sellers
        </CardTitle>
        <CardDescription>Units sold in the last {restock.days / 7} weeks, across the channels shown.</CardDescription>
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
                        <Thumbnail url={seller.imageUrl} />
                        <span className={styles.productText}>
                          <Link
                            href={restockHref({ channel: seller.channel, q: seller.sku ?? seller.product })}
                            className={styles.productLink}
                          >
                            {seller.product}
                          </Link>
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

const stageColors = {
  you: vars.color.warning,
  problem: vars.color.destructive,
  packing: vars.color.chart1,
  booking: vars.color.chart1,
  ready: vars.color.chart1,
  transit: vars.color.success
} as const

export function Shipments({ stages }: { stages: Overview["shipments"] }) {
  const total = stages.reduce((sum, stage) => sum + stage.shipments, 0)
  const active = stages.filter((stage) => stage.shipments > 0)
  return (
    <Card>
      <CardHeader>
        <CardTitle className={styles.sectionTitle}>
          <Truck aria-hidden />
          Shipments in progress
        </CardTitle>
        <CardDescription>
          {total
            ? `${plural(total, "shipment", "shipments")} between supplier and destination.`
            : "No shipments are in progress."}
        </CardDescription>
        <CardAction>
          <CardLink href="/shipments">Shipments</CardLink>
        </CardAction>
      </CardHeader>
      {total > 0 && (
        <CardContent className={styles.stack}>
          <div className={styles.meterTrack} aria-hidden>
            {active.map((stage) => (
              <span
                key={stage.key}
                className={styles.meterFill}
                style={{ width: `${(stage.shipments / total) * 100}%`, backgroundColor: stageColors[stage.key] }}
              />
            ))}
          </div>
          <div className={styles.stages}>
            {active.map((stage) => (
              <div key={stage.key} className={styles.stage}>
                <span className={styles.stageName}>
                  <span className={styles.stageDot} style={{ backgroundColor: stageColors[stage.key] }} aria-hidden />
                  {stage.label}
                </span>
                <span className={styles.stageCount}>{stage.shipments}</span>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

export function OpenOrders({ purchasing }: { purchasing: Overview["purchasing"] }) {
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
                  <span>{plural(supplier.orders, "order", "orders")}</span>
                  {otherCurrencies(supplier.value) && <span>{otherCurrencies(supplier.value)}</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.note}>No purchase orders are with suppliers.</p>
        )}
        <div className={styles.figures}>
          <Figure label="Open" value={formatMoney(purchasing.open)} />
          <Figure label={plural(purchasing.draftCount, "draft", "drafts")} value={formatMoney(purchasing.drafts)} />
        </div>
      </CardContent>
    </Card>
  )
}

export function Purchasing({ purchasing }: { purchasing: Overview["purchasing"] }) {
  return (
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
  )
}

// Gross profit line by line: sales with a unit cost, then everything taken off them over the period.
export function ProfitBreakdown({ sales, period }: { sales: Overview["sales"]; period: Overview["period"] }) {
  const { profit } = sales
  const currency = profit.currency
  const format = (minor: number) => formatMoney([{ minor, currency: currency! }])
  const share = (minor: number) =>
    profit.costedRevenueMinor > 0 ? `${Math.round((Math.abs(minor) / profit.costedRevenueMinor) * 100)}%` : ""
  const lines = currency
    ? [
        { key: "cost", label: "Cost of goods", minor: -profit.costMinor },
        { key: "fees", label: "Order fees (Amazon and Shopify Payments)", minor: -profit.feesMinor },
        ...profit.charges.toSorted((a, b) => a.minor - b.minor)
      ]
    : []
  return (
    <Card>
      <CardHeader>
        <CardTitle className={styles.sectionTitle}>
          <Wallet aria-hidden />
          Gross profit
        </CardTitle>
        <CardDescription>{period.rangeLabel}, from sales with a unit cost to what’s left.</CardDescription>
      </CardHeader>
      <CardContent className={styles.stack}>
        {currency && profit.costedRevenueMinor > 0 ? (
          <>
            <div className={styles.stages}>
              <div className={styles.stage}>
                <span className={styles.stepTitle}>Sales</span>
                <span className={styles.stageCount}>{format(profit.costedRevenueMinor)}</span>
              </div>
              {lines.map((line) => (
                <div key={line.key} className={styles.stage}>
                  <span className={styles.stageName}>{line.label}</span>
                  <span className={styles.profitLine}>
                    <span className={styles.note}>{share(line.minor)}</span>
                    <span className={styles.stageCount}>{format(line.minor)}</span>
                  </span>
                </div>
              ))}
              <div className={styles.stage}>
                <span className={styles.stepTitle}>Gross profit</span>
                <span className={styles.profitLine}>
                  {profit.margin !== null && <span className={styles.note}>{formatPercentShort(profit.margin)}</span>}
                  <span className={styles.stageCount}>{format(profit.profitMinor)}</span>
                </span>
              </div>
            </div>
            <p className={styles.note}>
              Refunds and platform charges are counted when they’re posted. Amazon’s inbound freight is shared by the
              units of each shipment it paid for. Apps, your plan and other costs billed to a card come from your{" "}
              <Link href="/settings">monthly costs</Link>. Shipping labels bought on your Shopify bill aren’t included,
              because Shopify doesn’t share them unless the bill is paid from Shopify Payments payouts.
              {profit.revenueMinor > profit.costedRevenueMinor &&
                ` ${format(profit.revenueMinor - profit.costedRevenueMinor)} of sales without a unit cost aren’t included.`}
            </p>
          </>
        ) : (
          <p className={styles.note}>Gross profit appears once orders have prices and products have unit costs.</p>
        )}
      </CardContent>
    </Card>
  )
}

function formatPercentShort(value: number) {
  return `${Math.round(value * 100)}%`
}
