"use client"

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
import { useFormatter, useLocale, useTranslations } from "use-intl"
import { Status } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { rangeLabel } from "@/lib/date-range"
import { change } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { AttentionItem, Money, Overview, SetupStep } from "@/server/overview"
import { ForAdmins, IfCanOpen, PageLink } from "./access"
import { InfoTip } from "./info-tip"
import { CoverChart } from "./overview-charts"
import { RefreshWhile } from "./refresh-while"

type MoneyList = readonly { currency: string; minor: number }[]

// Numbers and money in the reader's language, as the Overview shows them. Money is in minor units, and an amount in
// several currencies shows the one most of it is in, the others named beneath.
export function useFigures() {
  const t = useTranslations("overview")
  const format = useFormatter()
  const exact = (minor: number, currency: string) => format.number(minor / 100, { style: "currency", currency })
  return {
    number: (value: number) => format.number(value, { maximumFractionDigits: 0 }),
    // A headline amount in whole units, such as $16,997, shortened only from a million ($1.2M).
    whole: (minor: number, currency: string) => {
      const short = Math.abs(minor / 100) >= 1000000
      return format.number(minor / 100, {
        style: "currency",
        currency,
        notation: short ? "compact" : "standard",
        maximumFractionDigits: short ? 1 : 0
      })
    },
    // `fallback` is the currency to show zero in.
    money: (value: MoneyList, fallback = "USD") => {
      const first = value[0] ?? { minor: 0, currency: fallback }
      return exact(first.minor, first.currency)
    },
    others: (value: MoneyList) =>
      value.length > 1
        ? t("plusCurrencies", {
            amounts: format.list(
              value.slice(1).map((entry) => exact(entry.minor, entry.currency)),
              { type: "conjunction" }
            )
          })
        : null,
    percent: (value: number) => format.number(value, { style: "percent", maximumFractionDigits: 1 }),
    change: (value: number) =>
      format.number(value, {
        style: "percent",
        maximumFractionDigits: Math.abs(value) < 0.1 ? 1 : 0,
        signDisplay: "exceptZero"
      })
  }
}

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

// A card header's link to the page with the whole list, for someone who can open it.
export function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <IfCanOpen href={href}>
      <Button
        variant="ghost"
        size="sm"
        nativeButton={false}
        render={<a href={href}>{children}</a>}
        className="-my-1 -me-2 text-muted-foreground"
      >
        {children}
        <ChevronRight data-icon="inline-end" className="rtl:rotate-180" />
      </Button>
    </IfCanOpen>
  )
}

// The one placeholder for a value that doesn't apply, with the reason on hover and for screen readers.
export function Dash({ reason }: { reason?: string }) {
  const t = useTranslations("overview")
  const why = reason ?? t("notAvailable")
  return (
    <span className="text-muted-foreground" title={why}>
      <span aria-hidden>—</span>
      <span className="sr-only">{why}</span>
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
  const t = useTranslations("overview")
  const figures = useFigures()
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
      {value === null ? t("new") : figures.change(value)}
    </span>
  )
}

function Thumbnail({ url }: { url: string | null }) {
  const frame = "size-9 shrink-0 rounded-md bg-muted ring-1 ring-foreground/10"
  return url ? (
    <img
      loading="lazy"
      decoding="async"
      src={url}
      alt=""
      width={36}
      height={36}
      className={cn(frame, "object-cover")}
    />
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
        <PageLink
          href={href}
          title={name}
          className="truncate rounded-sm text-sm font-medium outline-none hover:underline hover:underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {name}
        </PageLink>
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
  const figures = useFigures()
  const others = figures.others(value)
  return (
    <>
      {figures.money(value)}
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

// A table that runs edge to edge inside its card: the first and last columns line up with the card's padding.
const edgeTable = "[&_td:first-child]:ps-4 [&_td:last-child]:pe-4 [&_th:first-child]:ps-4 [&_th:last-child]:pe-4"
// A card holding an edge-to-edge table or list, under a header with a rule.
const tableCard = "@container gap-0 py-0"
const tableCardHeader = "border-b pt-4"

export function SetupChecklist({ steps, refresh }: { steps: SetupStep[]; refresh: () => void }) {
  const t = useTranslations("overview.setup")
  const tSync = useTranslations("common.sync")
  const done = steps.filter((step) => step.done).length
  return (
    <Card>
      {/* A first sync ticks its step off when it finishes, so the page reloads while one runs. */}
      <RefreshWhile active={steps.some((step) => step.syncing)} refresh={refresh} />
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardAction className="text-sm text-muted-foreground tabular-nums">
          {t("progress", { done, total: steps.length })}
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
                  <span className="sr-only">{t("done")}</span>
                </div>
              ) : (
                <PageLink
                  href={step.href}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {step.syncing ? (
                    <Spinner className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <Circle className="size-4 shrink-0 text-muted-foreground/60" aria-hidden />
                  )}
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{step.title}</span>
                    {step.syncing ? (
                      <span className="truncate text-xs text-muted-foreground" aria-live="polite">
                        {typeof step.syncing.progress === "number"
                          ? tSync("syncingProgress", { progress: step.syncing.progress })
                          : tSync("syncing")}
                      </span>
                    ) : (
                      <span className="truncate text-xs text-muted-foreground" title={step.detail}>
                        {step.detail}
                      </span>
                    )}
                  </span>
                  <ChevronRight className="ms-auto size-4 rtl:rotate-180 shrink-0 text-muted-foreground" aria-hidden />
                </PageLink>
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
  const t = useTranslations("overview.attention")
  const figures = useFigures()
  return (
    <Card className={tableCard}>
      <CardHeader className={tableCardHeader}>
        <CardTitle className="flex items-center gap-2">
          {t("title")}
          {items.length > 0 && (
            <Badge variant={items.some((item) => item.tone === "critical") ? "destructive" : "secondary"}>
              {figures.number(items.length)}
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
                <PageLink
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
                    <ChevronRight data-icon="inline-end" className="rtl:rotate-180" />
                  </span>
                </PageLink>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="flex items-center gap-3 px-4 py-3 text-sm font-medium">
          <CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
          {t("caughtUp")}
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
  const t = useTranslations("overview.inventory")
  const figures = useFigures()
  const largest = Math.max(1, ...restock.channels.map((channel) => channel.available + channel.incoming))
  const profit = potentialProfit(restock)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          {t("title")}
          <InfoTip label={t("aboutLabel")}>{t("about")}</InfoTip>
        </CardTitle>
        <CardAction>
          <CardLink href="/products">{t("products")}</CardLink>
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
                    <span className="shrink-0 font-medium tabular-nums">
                      {t("onHand", { count: channel.available })}
                    </span>
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
                    <span>{t("onTheWay", { count: channel.incoming })}</span>
                    <span>
                      {channel.value.length ? t("atCost", { amount: figures.money(channel.value) }) : t("noUnitCosts")}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("noStock")}</p>
        )}
        <dl className="mt-auto grid grid-cols-2 gap-4 border-t pt-4">
          <Figure label={t("unitsOnHand")} value={figures.number(restock.unitsOnHand)} />
          <Figure
            label={t("valueAtCost")}
            value={
              restock.stockValue.length || !restock.uncosted ? (
                figures.money(restock.stockValue)
              ) : (
                <Dash reason={t("noUnitCosts")} />
              )
            }
            note={figures.others(restock.stockValue)}
          />
          <Figure
            label={t("retailValue")}
            value={
              restock.retailValue.length || !restock.unpriced ? (
                figures.money(restock.retailValue)
              ) : (
                <Dash reason={t("noPrices")} />
              )
            }
            note={figures.others(restock.retailValue)}
          />
          <Figure label={t("potentialProfit")} value={profit ? figures.money(profit) : <Dash />} />
        </dl>
      </CardContent>
    </Card>
  )
}

export function DaysOfCover({ restock, channel }: { restock: Overview["restock"]; channel: string | null }) {
  const t = useTranslations("overview.cover")
  const buckets = useTranslations("restock.cover")
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          {t("title")}
          <InfoTip label={t("aboutLabel")}>{t("about")}</InfoTip>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <CoverChart
          buckets={restock.cover.map((bucket) => ({
            key: bucket.key,
            label: buckets(bucket.key),
            items: bucket.items,
            href: bucket.items ? restockHref({ channel: channel ?? bucket.channel, cover: bucket.key }) : null
          }))}
        />
      </CardContent>
    </Card>
  )
}

// When sent purchase orders fall due, as the server groups them for the upcoming spend.
const dueGroups = ["overdue", "next30", "next60", "later"] as const
const isDueGroup = (key: string): key is (typeof dueGroups)[number] => dueGroups.some((group) => group === key)

export function UpcomingSpend({ upcoming, channel }: { upcoming: Overview["upcoming"]; channel: string | null }) {
  const t = useTranslations("overview.upcoming")
  const figures = useFigures()
  const rows = [
    {
      key: "reorders",
      label: t("reorders"),
      detail: t("reordersDetail"),
      value: upcoming.reorders,
      href: restockHref({ status: "order", channel })
    },
    // Only the due dates that have purchase orders.
    ...upcoming.purchaseOrders
      .filter((bucket) => bucket.orders > 0)
      .map((bucket) => ({
        key: bucket.key,
        label: isDueGroup(bucket.key) ? t(`due.${bucket.key}`) : bucket.label,
        detail: t("purchaseOrders", { count: bucket.orders }),
        value: bucket.value,
        href: "/orders"
      }))
  ]
  const others = figures.others(upcoming.next60)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          {t("title")}
          <InfoTip label={t("aboutLabel")}>{t("about")}</InfoTip>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">{t("next60")}</span>
          <span className="text-2xl leading-8 font-semibold tracking-tight tabular-nums">
            {figures.money(upcoming.next60)}
          </span>
          {others && <span className="text-xs text-muted-foreground">{others}</span>}
        </div>
        <ul className="-mx-2 flex flex-col divide-y">
          {rows.map((row) => (
            <li key={row.key}>
              <PageLink
                href={row.href}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-2 transition-colors outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{row.label}</span>
                  <span className="truncate text-xs text-muted-foreground">{row.detail}</span>
                </span>
                <span className="shrink-0 text-end text-sm font-medium tabular-nums">
                  <Amount value={row.value} />
                </span>
              </PageLink>
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
  const t = useTranslations("overview.trending")
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
                detail={
                  mover.variant
                    ? t("variantUnits", { variant: mover.variant, from: mover.previous, count: mover.current })
                    : t("units", { from: mover.previous, count: mover.current })
                }
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
  const t = useTranslations("overview.trending")
  const locale = useLocale()
  let empty: string | null = null
  if (!comparable) {
    empty = period.previous ? t("noPreviousOrders", { period: rangeLabel(period.previous, locale) }) : t("noComparison")
  } else if (!movers.rising.length && !movers.falling.length) {
    empty = t("noChanges")
  }
  return (
    <Card className="@container">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        {empty ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 @xl:grid-cols-2">
            <MoverList title={t("sellingMore")} movers={movers.rising} empty={t("nothingMore")} />
            <MoverList title={t("sellingLess")} movers={movers.falling} empty={t("nothingLess")} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function SlowStock({ restock }: { restock: Overview["restock"] }) {
  const t = useTranslations("overview.slow")
  const figures = useFigures()
  const { slow } = restock
  const summary = slow.value.length
    ? t("summaryAtCost", { items: slow.items, units: slow.units, amount: figures.money(slow.value) })
    : t("summary", { items: slow.items, units: slow.units })
  return (
    <Card className={tableCard}>
      <CardHeader className={tableCardHeader}>
        <CardTitle className="flex items-center gap-1.5">
          {t("title")}
          <InfoTip label={t("aboutLabel")}>{t("about")}</InfoTip>
        </CardTitle>
        {slow.items > 0 && <CardDescription>{summary}</CardDescription>}
      </CardHeader>
      {slow.items ? (
        <Table framed={false} className={edgeTable}>
          <TableHeader>
            <TableRow>
              <TableHead>{t("product")}</TableHead>
              <TableHead className="text-end">{t("onHand")}</TableHead>
              <TableHead className="hidden text-end @lg:table-cell">{t("cover")}</TableHead>
              <TableHead className="text-end">{t("atCost")}</TableHead>
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
                <TableCell className="text-end tabular-nums">{figures.number(item.available)}</TableCell>
                <TableCell className="hidden text-end tabular-nums @lg:table-cell">
                  {item.bucket === "unsold" || item.daysRemaining === null ? (
                    <Dash reason={t("notSelling")} />
                  ) : (
                    t("days", { count: item.daysRemaining })
                  )}
                </TableCell>
                <TableCell className="text-end tabular-nums">
                  {item.value ? figures.money([item.value]) : <Dash reason={t("noUnitCost")} />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <CardContent className="py-4 text-sm text-muted-foreground">{t("empty")}</CardContent>
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
  const t = useTranslations("overview.bestSellers")
  const figures = useFigures()
  return (
    <Card className={tableCard}>
      <CardHeader className={tableCardHeader}>
        <CardTitle>{t("title")}</CardTitle>
        <CardAction>
          <CardLink href="/restock">{t("restock")}</CardLink>
        </CardAction>
      </CardHeader>
      {restock.bestSellers.length ? (
        <Table framed={false} className={edgeTable}>
          <TableHeader>
            <TableRow>
              <TableHead>{t("product")}</TableHead>
              <TableHead className="text-end">{t("sold")}</TableHead>
              <TableHead className="hidden text-end @lg:table-cell">{t("onHand")}</TableHead>
              <TableHead className="hidden text-end @lg:table-cell">{t("cover")}</TableHead>
              <TableHead>{t("status")}</TableHead>
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
                <TableCell className="text-end tabular-nums">{figures.number(seller.sold)}</TableCell>
                <TableCell className="hidden text-end tabular-nums @lg:table-cell">
                  {figures.number(seller.available)}
                </TableCell>
                <TableCell className="hidden text-end tabular-nums @lg:table-cell">
                  {seller.daysRemaining === null ? <Dash /> : t("days", { count: seller.daysRemaining })}
                </TableCell>
                <TableCell>
                  <Status status={sellerStatus[seller.status]} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <CardContent className="py-4 text-sm text-muted-foreground">{t("empty")}</CardContent>
      )}
    </Card>
  )
}

export function OpenOrders({ purchasing }: { purchasing: Overview["purchasing"] }) {
  const t = useTranslations("overview.openOrders")
  const figures = useFigures()
  const shown = purchasing.bySupplier.slice(0, 5)
  const rest = purchasing.bySupplier.slice(5)
  return (
    <Card className={tableCard}>
      <CardHeader className={tableCardHeader}>
        <CardTitle>{t("title")}</CardTitle>
        <CardAction>
          <CardLink href="/orders">{t("link")}</CardLink>
        </CardAction>
      </CardHeader>
      {shown.length ? (
        <Table framed={false} className={edgeTable}>
          <TableHeader>
            <TableRow>
              <TableHead>{t("supplier")}</TableHead>
              <TableHead className="text-end">{t("orders")}</TableHead>
              <TableHead className="text-end">{t("openValue")}</TableHead>
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
                <TableCell className="text-end tabular-nums">{figures.number(supplier.orders)}</TableCell>
                <TableCell className="text-end tabular-nums">
                  <Amount value={supplier.value} />
                </TableCell>
              </TableRow>
            ))}
            {rest.length > 0 && (
              <TableRow>
                <TableCell className="text-muted-foreground">{t("otherSuppliers", { count: rest.length })}</TableCell>
                <TableCell className="text-end tabular-nums">
                  {figures.number(rest.reduce((sum, supplier) => sum + supplier.orders, 0))}
                </TableCell>
                <TableCell className="text-end tabular-nums">
                  <Amount value={combine(rest.map((supplier) => supplier.value))} />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      ) : (
        <CardContent className="py-4 text-sm text-muted-foreground">{t("empty")}</CardContent>
      )}
      {/* The totals sit at the foot of the card, level with the card beside it. */}
      <CardFooter className="mt-auto">
        <dl className="grid w-full grid-cols-2 gap-4">
          <Figure
            label={t("open")}
            value={<Amount value={purchasing.open} />}
            note={t("purchaseOrders", { count: purchasing.openCount })}
          />
          <Figure
            label={t("drafts")}
            value={<Amount value={purchasing.drafts} />}
            note={t("purchaseOrders", { count: purchasing.draftCount })}
          />
        </dl>
      </CardFooter>
    </Card>
  )
}

// Deductions from sales, grouped so the card reads at a glance; each group's parts show on hover.
const profitGroups: { name: "refunds" | "shipping" | "advertising" | "monthly"; keys: (key: string) => boolean }[] = [
  { name: "refunds", keys: (key) => key === "amazon-refunds" || key === "shopify-disputes" },
  {
    name: "shipping",
    keys: (key) => key === "amazon-freight" || key === "shopify-labels" || key === "shopify-duties"
  },
  { name: "advertising", keys: (key) => key === "amazon-ads" },
  { name: "monthly", keys: (key) => key.startsWith("monthly:") }
]
// The platform charges the server names, by their message keys. Monthly costs keep the names people gave them.
const chargeNames = {
  "amazon-refunds": "amazonRefunds",
  "amazon-ads": "amazonAds",
  "amazon-charges": "amazonCharges",
  "amazon-mcf": "amazonMcf",
  "amazon-freight": "amazonFreight",
  "shopify-labels": "shopifyLabels",
  "shopify-bill": "shopifyBill",
  "shopify-disputes": "shopifyDisputes",
  "shopify-duties": "shopifyDuties"
} as const
const isChargeName = (key: string): key is keyof typeof chargeNames => Object.hasOwn(chargeNames, key)

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
      <dt className={cn("flex min-w-0 items-center gap-1.5 pe-1", strong ? "font-medium" : "text-muted-foreground")}>
        <span className="min-w-0">{label}</span>
        {children}
      </dt>
      {share && <dd className="text-end text-xs text-muted-foreground tabular-nums">{share}</dd>}
      <dd className={cn("text-end tabular-nums", !share && "col-span-2", strong ? "font-semibold" : "font-medium")}>
        {value}
      </dd>
    </div>
  )
}

export function ProfitBreakdown({ sales }: { sales: Overview["sales"] }) {
  const t = useTranslations("overview.profit")
  const format = useFormatter()
  const figures = useFigures()
  const { profit } = sales
  const currency = profit.currency
  const percent = (value: number) => format.number(value, { style: "percent", maximumFractionDigits: 0 })
  const share = (minor: number) =>
    profit.costedRevenueMinor > 0 ? percent(Math.abs(minor) / profit.costedRevenueMinor) : null
  // A monthly cost is named "<name>, monthly cost"; its group already says it's monthly.
  const charges = profit.charges.map((charge) => ({
    ...charge,
    label: isChargeName(charge.key)
      ? t(`charges.${chargeNames[charge.key]}`)
      : charge.label.replace(/, monthly cost$/, "")
  }))
  const parts = [{ key: "fees", label: t("orderFees"), minor: -profit.feesMinor }, ...charges]
  const grouped = profitGroups.map((group) => ({
    label: t(`groups.${group.name}`),
    parts: parts.filter((part) => group.keys(part.key))
  }))
  // Fees: order fees and every other platform charge.
  const fees = parts.filter((part) => !profitGroups.some((group) => group.keys(part.key)))
  const lines = [
    { label: t("costOfGoods"), parts: [{ key: "cost", label: t("costOfGoods"), minor: -profit.costMinor }] },
    { label: t("fees"), parts: fees },
    ...grouped
  ]
    .map((line) => ({ ...line, minor: line.parts.reduce((sum, part) => sum + part.minor, 0) }))
    .filter((line) => line.minor !== 0)
    .toSorted((a, b) => a.minor - b.minor)
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardAction>
          <CardLink href="/settings#monthly-costs">{t("monthlyCosts")}</CardLink>
        </CardAction>
      </CardHeader>
      <CardContent className="flex-1">
        {currency && profit.costedRevenueMinor > 0 ? (
          <dl className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-2 divide-y text-sm">
            <ProfitLine
              label={t("sales")}
              value={figures.money([{ minor: profit.costedRevenueMinor, currency }])}
              strong
            />
            {lines.map((line) => (
              <ProfitLine
                key={line.label}
                label={line.label}
                share={share(line.minor)}
                value={figures.money([{ minor: line.minor, currency }])}
              >
                {line.parts.length > 1 && (
                  <Tooltip>
                    <TooltipTrigger
                      aria-label={t("whatsIn", { line: line.label })}
                      className="rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <Info className="size-3.5" aria-hidden />
                    </TooltipTrigger>
                    <TooltipContent side="inline-end" align="start">
                      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5">
                        {line.parts.map((part) => (
                          <div key={part.key} className="col-span-2 grid grid-cols-subgrid">
                            <dt>{part.label}</dt>
                            <dd className="text-end tabular-nums">
                              {figures.money([{ minor: part.minor, currency }])}
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
              label={t("title")}
              share={profit.margin === null ? null : percent(profit.margin)}
              value={figures.money([{ minor: profit.profitMinor, currency }])}
              strong
            />
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">{t("needsCosts")}</p>
        )}
      </CardContent>
    </Card>
  )
}

const settingsLink = (chunks: React.ReactNode) => (
  <PageLink href="/settings#integrations" className="font-medium text-foreground underline underline-offset-2">
    {chunks}
  </PageLink>
)

// Shopify customers: who ordered in the period and how many came back, and what a customer is worth over a year.
export function Customers({ customers }: { customers: NonNullable<Overview["sales"]["customers"]> }) {
  const t = useTranslations("overview.customers")
  const format = useFormatter()
  const figures = useFigures()
  const percent = (part: number, whole: number) =>
    whole > 0 ? (
      format.number(part / whole, { style: "percent", maximumFractionDigits: 0 })
    ) : (
      <Dash reason={t("noCustomers")} />
    )
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          {t("title")}
          <InfoTip label={t("aboutLabel")}>{t("about")}</InfoTip>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        {customers.status === "reconnect" && (
          <p className="text-sm text-muted-foreground">
            <ForAdmins fallback={t("reconnectAskAdmin")}>{t.rich("reconnect", { settings: settingsLink })}</ForAdmins>
          </p>
        )}
        {customers.status === "syncing" && <p className="text-sm text-muted-foreground">{t("syncing")}</p>}
        {customers.status === "ready" && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
            <Figure
              label={t("lifetimeValue")}
              value={
                customers.yearCustomers ? (
                  figures.money([
                    {
                      minor: Math.round(customers.yearRevenueMinor / customers.yearCustomers),
                      currency: customers.currency
                    }
                  ])
                ) : (
                  <Dash reason={t("noCustomers")} />
                )
              }
            />
            <Figure
              label={t("returning")}
              value={percent(customers.returning, customers.customers)}
              note={t("returningNote", { returning: customers.returning, customers: customers.customers })}
            />
            <Figure label={t("repeat")} value={percent(customers.repeatCustomers, customers.yearCustomers)} />
            <Figure
              label={t("ordersPerCustomer")}
              value={
                customers.yearCustomers ? (
                  format.number(customers.yearOrders / customers.yearCustomers, { maximumFractionDigits: 2 })
                ) : (
                  <Dash reason={t("noCustomers")} />
                )
              }
            />
          </dl>
        )}
      </CardContent>
    </Card>
  )
}
