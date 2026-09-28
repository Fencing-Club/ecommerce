import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  Circle,
  CircleAlert,
  CircleCheck,
  Info,
  Minus,
  Package,
  TriangleAlert
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { Status } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { change, formatChange, formatMoney, formatNumber, otherCurrencies } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { AttentionItem, Money, Overview, SetupStep } from "@/server/overview"
import { InfoTip } from "./info-tip"
import { CoverChart } from "./overview-charts"

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

// A card header's link to the page with the whole list.
export function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      nativeButton={false}
      render={<Link href={href} />}
      className="-my-1 -mr-2 text-muted-foreground"
    >
      {children}
      <ChevronRight data-icon="inline-end" />
    </Button>
  )
}

// The one placeholder for a value that doesn't apply, with the reason on hover and for screen readers.
export function Dash({ reason = "Not available" }: { reason?: string }) {
  return (
    <span className="text-muted-foreground" title={reason}>
      <span aria-hidden>—</span>
      <span className="sr-only">{reason}</span>
    </span>
  )
}

const deltaTones = {
  up: { icon: ArrowUpRight, className: "bg-success/10 text-success" },
  down: { icon: ArrowDownRight, className: "bg-destructive/10 text-destructive" },
  flat: { icon: Minus, className: "bg-muted text-muted-foreground" }
}

function deltaTone(value: number | null) {
  if (value === null) {
    return "up"
  }
  if (Math.abs(value) < 0.005) {
    return "flat"
  }
  return value > 0 ? "up" : "down"
}

// A change as a small pill: green up, red down, grey under half a percent either way. Null reads as new, for something
// that had nothing before.
export function DeltaPill({ value, title }: { value: number | null; title?: string }) {
  const { icon: Icon, className } = deltaTones[deltaTone(value)]
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full px-1.5 text-xs font-medium tabular-nums",
        className
      )}
    >
      <Icon className="size-3" aria-hidden />
      {value === null ? "New" : formatChange(value)}
    </span>
  )
}

function Thumbnail({ url }: { url: string | null }) {
  const frame = "size-9 shrink-0 rounded-md bg-muted ring-1 ring-foreground/10"
  return url ? (
    <Image src={url} alt="" width={36} height={36} unoptimized className={cn(frame, "object-cover")} />
  ) : (
    <span className={cn(frame, "flex items-center justify-center text-muted-foreground")} aria-hidden>
      <Package className="size-4" />
    </span>
  )
}

// A product's picture, its name (a link to it in Restock) and one line of detail, each kept to one line.
function Product({
  href,
  name,
  detail,
  imageUrl
}: {
  href: string
  name: string
  detail: string | null
  imageUrl: string | null
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <Thumbnail url={imageUrl} />
      <div className="flex min-w-0 flex-col">
        <Link
          href={href}
          title={name}
          className="truncate rounded-sm text-sm font-medium outline-none hover:underline hover:underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {name}
        </Link>
        {detail && (
          <span title={detail} className="truncate text-xs text-muted-foreground">
            {detail}
          </span>
        )}
      </div>
    </div>
  )
}

// A label over a figure, with an optional note beneath. Used inside a <dl>.
function Figure({ label, value, note }: { label: string; value: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="truncate text-xs text-muted-foreground" title={label}>
        {label}
      </dt>
      <dd className="text-base font-semibold tabular-nums">{value}</dd>
      {note && <dd className="text-xs text-muted-foreground">{note}</dd>}
    </div>
  )
}

// An amount in its main currency, with any other currencies it includes beneath.
function Amount({ value }: { value: Money }) {
  const others = otherCurrencies(value)
  return (
    <>
      {formatMoney(value)}
      {others && <span className="block text-xs font-normal text-muted-foreground">{others}</span>}
    </>
  )
}

// Amounts added up by currency, largest first.
function combine(values: Money[]): Money {
  const totals = new Map<string, number>()
  for (const entry of values.flat()) {
    totals.set(entry.currency, (totals.get(entry.currency) ?? 0) + entry.minor)
  }
  return [...totals].map(([currency, minor]) => ({ currency, minor })).toSorted((a, b) => b.minor - a.minor)
}

function plural(count: number, one: string, many: string) {
  return `${formatNumber(count)} ${count === 1 ? one : many}`
}

// A table that runs edge to edge inside its card: the first and last columns line up with the card's padding.
const edgeTable = "[&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4"
// A card holding an edge-to-edge table or list, under a header with a rule.
const tableCard = "@container gap-0 py-0"
const tableCardHeader = "border-b pt-4"

export function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  const done = steps.filter((step) => step.done).length
  return (
    <Card>
      <CardHeader>
        <CardTitle>Finish setting up</CardTitle>
        <CardAction className="text-sm text-muted-foreground tabular-nums">
          {done} of {steps.length} done
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <span
            className="block h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${(done / steps.length) * 100}%` }}
          />
        </div>
        <ol className="-mx-3 grid grid-cols-1 gap-1 md:grid-cols-2">
          {steps.map((step) => (
            <li key={step.key}>
              {step.done ? (
                <div className="flex items-center gap-3 px-3 py-2 text-muted-foreground">
                  <CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
                  <span className="truncate text-sm font-medium">{step.title}</span>
                  <span className="sr-only">Done</span>
                </div>
              ) : (
                <Link
                  href={step.href}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <Circle className="size-4 shrink-0 text-muted-foreground/60" aria-hidden />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{step.title}</span>
                    <span className="truncate text-xs text-muted-foreground" title={step.detail}>
                      {step.detail}
                    </span>
                  </span>
                  <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              )}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

// One icon per tone, all the same size and weight, colored by how urgent the item is.
const toneIcons = {
  critical: { icon: CircleAlert, className: "text-destructive" },
  warning: { icon: TriangleAlert, className: "text-warning" },
  info: { icon: Info, className: "text-muted-foreground" }
}

export function Attention({ items }: { items: AttentionItem[] }) {
  return (
    <Card className={tableCard}>
      <CardHeader className={tableCardHeader}>
        <CardTitle className="flex items-center gap-2">
          Needs attention
          {items.length > 0 && (
            <Badge variant={items.some((item) => item.tone === "critical") ? "destructive" : "secondary"}>
              {formatNumber(items.length)}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      {items.length ? (
        <ul className="divide-y">
          {items.map((item) => {
            const { icon: Icon, className } = toneIcons[item.tone]
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="group flex items-center gap-3 px-4 py-2.5 transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
                >
                  <Icon className={cn("size-4 shrink-0", className)} aria-hidden />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium" title={item.title}>
                      {item.title}
                    </span>
                    <span className="truncate text-xs text-muted-foreground" title={item.detail}>
                      {item.detail}
                    </span>
                  </span>
                  <span
                    className={cn(
                      buttonVariants({ variant: "ghost", size: "sm" }),
                      "shrink-0 text-muted-foreground group-hover:bg-muted group-hover:text-foreground"
                    )}
                  >
                    <span className="hidden sm:inline">{item.action}</span>
                    <ChevronRight data-icon="inline-end" />
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="flex items-center gap-3 px-4 py-3 text-sm font-medium">
          <CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
          All caught up
        </div>
      )}
    </Card>
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

// Each channel's bar: on hand in the channel's color, on the way in a lighter step of it.
const channelFills = {
  amazon: { onHand: "bg-chart-1", incoming: "bg-chart-1/35" },
  shopify: { onHand: "bg-chart-2", incoming: "bg-chart-2/35" }
}

export function StockByChannel({ restock }: { restock: Overview["restock"] }) {
  const largest = Math.max(1, ...restock.channels.map((channel) => channel.available + channel.incoming))
  const profit = potentialProfit(restock)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          Inventory
          <InfoTip label="About inventory values">
            Retail value uses what each unit recently sold for, or its Shopify price. Costs include landed costs from
            purchase orders.
          </InfoTip>
        </CardTitle>
        <CardAction>
          <CardLink href="/products">Products</CardLink>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {restock.channels.length ? (
          <div className="flex flex-col gap-4">
            {restock.channels.map((channel) => {
              const fills = channelFills[channel.key === "amazon" ? "amazon" : "shopify"]
              return (
                <div key={channel.key} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium" title={channel.label}>
                      {channel.label}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">{formatNumber(channel.available)} on hand</span>
                  </div>
                  <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <span
                      className={cn("h-full min-w-0.5 rounded-full", fills.onHand)}
                      style={{ width: `${(channel.available / largest) * 100}%` }}
                    />
                    {channel.incoming > 0 && (
                      <span
                        className={cn("h-full min-w-0.5 rounded-full", fills.incoming)}
                        style={{ width: `${(channel.incoming / largest) * 100}%` }}
                      />
                    )}
                  </div>
                  <div className="flex justify-between gap-3 text-xs text-muted-foreground tabular-nums">
                    <span>{formatNumber(channel.incoming)} on the way</span>
                    <span>{channel.value.length ? `${formatMoney(channel.value)} at cost` : "No unit costs"}</span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No stock synced</p>
        )}
        <dl className="mt-auto grid grid-cols-2 gap-4 border-t pt-4">
          <Figure label="Units on hand" value={formatNumber(restock.unitsOnHand)} />
          <Figure
            label="Value at cost"
            value={
              restock.stockValue.length || !restock.uncosted ? (
                formatMoney(restock.stockValue)
              ) : (
                <Dash reason="No unit costs" />
              )
            }
            note={otherCurrencies(restock.stockValue)}
          />
          <Figure
            label="Retail value"
            value={
              restock.retailValue.length || !restock.unpriced ? (
                formatMoney(restock.retailValue)
              ) : (
                <Dash reason="No prices" />
              )
            }
            note={otherCurrencies(restock.retailValue)}
          />
          <Figure label="Potential gross profit" value={profit ? formatMoney(profit) : <Dash />} />
        </dl>
      </CardContent>
    </Card>
  )
}

export function DaysOfCover({ restock, channel }: { restock: Overview["restock"]; channel: string | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          Days of cover
          <InfoTip label="About days of cover">How long each item’s stock lasts at its recent sales rate.</InfoTip>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <CoverChart
          buckets={restock.cover.map((bucket) => ({
            key: bucket.key,
            label: bucket.label,
            items: bucket.items,
            href: bucket.items ? restockHref({ channel: channel ?? bucket.channel, cover: bucket.key }) : null
          }))}
        />
      </CardContent>
    </Card>
  )
}

export function UpcomingSpend({ upcoming, channel }: { upcoming: Overview["upcoming"]; channel: string | null }) {
  const rows = [
    {
      key: "reorders",
      label: "Reorders due now",
      detail: "Estimated from unit costs",
      value: upcoming.reorders,
      href: restockHref({ status: "order", channel })
    },
    // Only the due dates that have purchase orders.
    ...upcoming.purchaseOrders
      .filter((bucket) => bucket.orders > 0)
      .map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        detail: plural(bucket.orders, "purchase order", "purchase orders"),
        value: bucket.value,
        href: "/orders"
      }))
  ]
  const others = otherCurrencies(upcoming.next60)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          Upcoming spend
          <InfoTip label="About upcoming spend">
            Reorders that are due, and sent purchase orders by their due date.
          </InfoTip>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Next 60 days</span>
          <span className="text-2xl leading-8 font-semibold tracking-tight tabular-nums">
            {formatMoney(upcoming.next60)}
          </span>
          {others && <span className="text-xs text-muted-foreground">{others}</span>}
        </div>
        <ul className="-mx-2 flex flex-col divide-y">
          {rows.map((row) => (
            <li key={row.key}>
              <Link
                href={row.href}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-2 transition-colors outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{row.label}</span>
                  <span className="truncate text-xs text-muted-foreground">{row.detail}</span>
                </span>
                <span className="shrink-0 text-right text-sm font-medium tabular-nums">
                  <Amount value={row.value} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function MoverList({
  title,
  movers,
  empty
}: {
  title: string
  movers: Overview["sales"]["movers"]["rising"]
  empty: string
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {movers.length ? (
        <ul className="flex flex-col gap-3">
          {movers.map((mover) => (
            <li key={mover.id} className="flex min-w-0 items-center gap-3">
              <Product
                href={restockHref({ q: mover.sku ?? mover.product })}
                name={mover.product}
                detail={[mover.variant, `${formatNumber(mover.previous)} to ${formatNumber(mover.current)} units`]
                  .filter(Boolean)
                  .join(", ")}
                imageUrl={mover.imageUrl}
              />
              <DeltaPill value={change(mover.current, mover.previous)} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
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
  let empty: string | null = null
  if (!comparable) {
    empty = period.previousLabel ? `No orders synced for ${period.previousLabel}` : "No comparison period"
  } else if (!movers.rising.length && !movers.falling.length) {
    empty = "No product changed by more than a few units"
  }
  return (
    <Card className="@container">
      <CardHeader>
        <CardTitle>Trending products</CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        {empty ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 @xl:grid-cols-2">
            <MoverList title="Selling more" movers={movers.rising} empty="Nothing selling more" />
            <MoverList title="Selling less" movers={movers.falling} empty="Nothing selling less" />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function SlowStock({ restock }: { restock: Overview["restock"] }) {
  const { slow } = restock
  const summary = [
    plural(slow.items, "item", "items"),
    plural(slow.units, "unit", "units"),
    slow.value.length ? `${formatMoney(slow.value)} at cost` : null
  ]
    .filter(Boolean)
    .join(", ")
  return (
    <Card className={tableCard}>
      <CardHeader className={tableCardHeader}>
        <CardTitle className="flex items-center gap-1.5">
          Slow-moving stock
          <InfoTip label="About slow-moving stock">Stock that lasts over 3 months, or hasn’t sold recently.</InfoTip>
        </CardTitle>
        {slow.items > 0 && <CardDescription>{summary}</CardDescription>}
      </CardHeader>
      {slow.items ? (
        <Table framed={false} className={edgeTable}>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">On hand</TableHead>
              <TableHead className="hidden text-right @lg:table-cell">Cover</TableHead>
              <TableHead className="text-right">At cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {slow.top.map((item) => (
              <TableRow key={`${item.channelKey}:${item.variantId}`}>
                <TableCell className="w-full max-w-0">
                  <Product
                    href={restockHref({ channel: item.channelKey, cover: item.bucket, q: item.sku ?? item.product })}
                    name={item.product}
                    detail={[item.variant, item.channel].filter(Boolean).join(", ")}
                    imageUrl={item.imageUrl}
                  />
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(item.available)}</TableCell>
                <TableCell className="hidden text-right tabular-nums @lg:table-cell">
                  {item.bucket === "unsold" || item.daysRemaining === null ? (
                    <Dash reason="Not selling" />
                  ) : (
                    `${formatNumber(item.daysRemaining)} days`
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {item.value ? formatMoney([item.value]) : <Dash reason="No unit cost" />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <CardContent className="py-4 text-sm text-muted-foreground">No slow-moving stock</CardContent>
      )}
    </Card>
  )
}

// Each best-seller state as the shared stock status it reads as: needs a reorder now or is out, due soon, or fine.
const sellerStatus = {
  stockout: "reorder_now",
  out: "out_of_stock",
  reorder: "reorder_soon",
  stocked: "in_stock"
} as const

export function BestSellers({ restock }: { restock: Overview["restock"] }) {
  return (
    <Card className={tableCard}>
      <CardHeader className={tableCardHeader}>
        <CardTitle>Best sellers</CardTitle>
        <CardAction>
          <CardLink href="/restock">Restock</CardLink>
        </CardAction>
      </CardHeader>
      {restock.bestSellers.length ? (
        <Table framed={false} className={edgeTable}>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Sold</TableHead>
              <TableHead className="hidden text-right @lg:table-cell">On hand</TableHead>
              <TableHead className="hidden text-right @lg:table-cell">Cover</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {restock.bestSellers.map((seller) => (
              <TableRow key={seller.variantId}>
                <TableCell className="w-full max-w-0">
                  <Product
                    href={restockHref({ channel: seller.channel, q: seller.sku ?? seller.product })}
                    name={seller.product}
                    detail={[seller.variant, seller.sku].filter(Boolean).join(", ") || seller.channels.join(", ")}
                    imageUrl={seller.imageUrl}
                  />
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(seller.sold)}</TableCell>
                <TableCell className="hidden text-right tabular-nums @lg:table-cell">
                  {formatNumber(seller.available)}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums @lg:table-cell">
                  {seller.daysRemaining === null ? <Dash /> : `${formatNumber(seller.daysRemaining)} days`}
                </TableCell>
                <TableCell>
                  <Status status={sellerStatus[seller.status]} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <CardContent className="py-4 text-sm text-muted-foreground">No sales yet</CardContent>
      )}
    </Card>
  )
}

export function OpenOrders({ purchasing }: { purchasing: Overview["purchasing"] }) {
  const shown = purchasing.bySupplier.slice(0, 5)
  const rest = purchasing.bySupplier.slice(5)
  return (
    <Card className={tableCard}>
      <CardHeader className={tableCardHeader}>
        <CardTitle>Open purchase orders</CardTitle>
        <CardAction>
          <CardLink href="/orders">Purchase orders</CardLink>
        </CardAction>
      </CardHeader>
      {shown.length ? (
        <Table framed={false} className={edgeTable}>
          <TableHeader>
            <TableRow>
              <TableHead>Supplier</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead className="text-right">Open value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((supplier) => (
              <TableRow key={supplier.name}>
                <TableCell className="w-full max-w-0">
                  <span className="block truncate font-medium" title={supplier.name}>
                    {supplier.name}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(supplier.orders)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  <Amount value={supplier.value} />
                </TableCell>
              </TableRow>
            ))}
            {rest.length > 0 && (
              <TableRow>
                <TableCell className="text-muted-foreground">
                  {plural(rest.length, "other supplier", "other suppliers")}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(rest.reduce((sum, supplier) => sum + supplier.orders, 0))}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <Amount value={combine(rest.map((supplier) => supplier.value))} />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      ) : (
        <CardContent className="py-4 text-sm text-muted-foreground">No open purchase orders</CardContent>
      )}
      {/* The totals sit at the foot of the card, level with the card beside it. */}
      <CardFooter className="mt-auto">
        <dl className="grid w-full grid-cols-2 gap-4">
          <Figure
            label="Open"
            value={<Amount value={purchasing.open} />}
            note={plural(purchasing.openCount, "purchase order", "purchase orders")}
          />
          <Figure
            label="Drafts"
            value={<Amount value={purchasing.drafts} />}
            note={plural(purchasing.draftCount, "purchase order", "purchase orders")}
          />
        </dl>
      </CardFooter>
    </Card>
  )
}

// Deductions from sales, grouped so the card reads at a glance; each group's parts show on hover.
const profitGroups: { label: string; keys: (key: string) => boolean }[] = [
  { label: "Refunds and disputes", keys: (key) => key === "amazon-refunds" || key === "shopify-disputes" },
  {
    label: "Shipping and freight",
    keys: (key) => key === "amazon-freight" || key === "shopify-labels" || key === "shopify-duties"
  },
  { label: "Advertising", keys: (key) => key === "amazon-ads" },
  { label: "Monthly costs", keys: (key) => key.startsWith("monthly:") }
]

// One line of the gross profit breakdown, in the list's three columns: its label, its share of sales and its amount.
// The share column is only as wide as its widest figure and sits close to the amounts, so the labels keep the rest.
function ProfitLine({
  label,
  share,
  value,
  strong,
  children
}: {
  label: string
  share?: string | null
  value: string
  strong?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className="col-span-3 grid grid-cols-subgrid items-baseline py-2">
      <dt className={cn("flex min-w-0 items-center gap-1.5 pr-1", strong ? "font-medium" : "text-muted-foreground")}>
        <span className="min-w-0">{label}</span>
        {children}
      </dt>
      {share && <dd className="text-right text-xs text-muted-foreground tabular-nums">{share}</dd>}
      <dd className={cn("text-right tabular-nums", !share && "col-span-2", strong ? "font-semibold" : "font-medium")}>
        {value}
      </dd>
    </div>
  )
}

export function ProfitBreakdown({ sales }: { sales: Overview["sales"] }) {
  const { profit } = sales
  const currency = profit.currency
  const share = (minor: number) =>
    profit.costedRevenueMinor > 0 ? `${Math.round((Math.abs(minor) / profit.costedRevenueMinor) * 100)}%` : null
  const parts = [{ key: "fees", label: "Order fees", minor: -profit.feesMinor }, ...profit.charges]
  const grouped = profitGroups.map((group) => ({
    label: group.label,
    parts: parts.filter((part) => group.keys(part.key))
  }))
  // Fees: order fees and every other platform charge.
  const fees = parts.filter((part) => !profitGroups.some((group) => group.keys(part.key)))
  const lines = [
    { label: "Cost of goods", parts: [{ key: "cost", label: "Cost of goods", minor: -profit.costMinor }] },
    { label: "Fees", parts: fees },
    ...grouped
  ]
    .map((line) => ({ ...line, minor: line.parts.reduce((sum, part) => sum + part.minor, 0) }))
    .filter((line) => line.minor !== 0)
    .toSorted((a, b) => a.minor - b.minor)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Gross profit</CardTitle>
        <CardAction>
          <CardLink href="/settings#monthly-costs">Monthly costs</CardLink>
        </CardAction>
      </CardHeader>
      <CardContent className="flex-1">
        {currency && profit.costedRevenueMinor > 0 ? (
          <dl className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-2 divide-y text-sm">
            <ProfitLine label="Sales" value={formatMoney([{ minor: profit.costedRevenueMinor, currency }])} strong />
            {lines.map((line) => (
              <ProfitLine
                key={line.label}
                label={line.label}
                share={share(line.minor)}
                value={formatMoney([{ minor: line.minor, currency }])}
              >
                {line.parts.length > 1 && (
                  <Tooltip>
                    <TooltipTrigger
                      aria-label={`What’s in ${line.label.toLowerCase()}`}
                      className="rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <Info className="size-3.5" aria-hidden />
                    </TooltipTrigger>
                    <TooltipContent side="right" align="start">
                      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5">
                        {line.parts.map((part) => (
                          <div key={part.key} className="col-span-2 grid grid-cols-subgrid">
                            <dt>{part.label.replace(/, monthly cost$/, "")}</dt>
                            <dd className="text-right tabular-nums">
                              {formatMoney([{ minor: part.minor, currency }])}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </TooltipContent>
                  </Tooltip>
                )}
              </ProfitLine>
            ))}
            <ProfitLine
              label="Gross profit"
              share={profit.margin === null ? null : `${Math.round(profit.margin * 100)}%`}
              value={formatMoney([{ minor: profit.profitMinor, currency }])}
              strong
            />
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Needs order prices and unit costs</p>
        )}
      </CardContent>
    </Card>
  )
}

// Shopify customers: who ordered in the period and how many came back, and what a customer is worth over a year.
export function Customers({ customers }: { customers: NonNullable<Overview["sales"]["customers"]> }) {
  const percent = (part: number, whole: number) =>
    whole > 0 ? `${Math.round((part / whole) * 100)}%` : <Dash reason="No customers" />
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          Shopify customers
          <InfoTip label="About customer figures">
            Lifetime value, repeat customers and orders per customer cover the last 12 months. Guest and Amazon orders
            aren’t counted.
          </InfoTip>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        {customers.status === "reconnect" && (
          <p className="text-sm text-muted-foreground">
            Reconnect Shopify in{" "}
            <Link href="/settings#integrations" className="font-medium text-foreground underline underline-offset-2">
              Settings
            </Link>{" "}
            to count repeat customers
          </p>
        )}
        {customers.status === "syncing" && (
          <p className="text-sm text-muted-foreground">Available after the next Shopify order sync</p>
        )}
        {customers.status === "ready" && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
            <Figure
              label="Customer lifetime value"
              value={
                customers.yearCustomers ? (
                  formatMoney([
                    {
                      minor: Math.round(customers.yearRevenueMinor / customers.yearCustomers),
                      currency: customers.currency
                    }
                  ])
                ) : (
                  <Dash reason="No customers" />
                )
              }
            />
            <Figure
              label="Returning customers"
              value={percent(customers.returning, customers.customers)}
              note={`${formatNumber(customers.returning)} of ${formatNumber(customers.customers)} in this period`}
            />
            <Figure label="Repeat customers" value={percent(customers.repeatCustomers, customers.yearCustomers)} />
            <Figure
              label="Orders per customer"
              value={
                customers.yearCustomers ? (
                  (customers.yearOrders / customers.yearCustomers).toLocaleString("en-US", {
                    maximumFractionDigits: 2
                  })
                ) : (
                  <Dash reason="No customers" />
                )
              }
            />
          </dl>
        )}
      </CardContent>
    </Card>
  )
}
