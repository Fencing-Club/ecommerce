import { ArrowDownRight, ArrowUpRight, CircleAlert, CircleCheck, CircleSlash, TriangleAlert } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { PageLink } from "@/components/access"
import { Status } from "@/components/common"
import { LinkRow } from "@/components/link-row"
import { Attention, CardLink } from "@/components/overview-sections"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useMoney } from "@/hooks/use-money"
import { canOpen, type Permissions } from "@/lib/access"
import { rangeLabel } from "@/lib/date-range"
import { formatDate, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { AttentionItem } from "@/server/overview"
import type { SupplierOverviewData } from "@/server/supplier-overview"
import { OrdersChart } from "./overview-chart"
import { ProductThumb } from "./shared"

type Data = SupplierOverviewData

type TaskText = ReturnType<typeof useTranslations<"supplier.overview.tasks">>

// What needs the supplier, most urgent first, in the buyer Overview's shape. Each links to the list that has it.
function tasks(counts: Data["attention"], t: TaskText) {
  const items: AttentionItem[] = []
  if (counts.short) {
    items.push({
      key: "short",
      tone: "critical",
      title: t("short", { count: counts.short }),
      detail: t("shortDetail"),
      href: "/inventory?tab=short",
      action: t("viewInventory")
    })
  }
  if (counts.pack) {
    items.push({
      key: "pack",
      tone: "warning",
      title: t("pack", { count: counts.pack }),
      detail: t("packDetail"),
      href: "/orders?tab=pack",
      action: t("viewOrders")
    })
  }
  if (counts.ship) {
    items.push({
      key: "ship",
      tone: "warning",
      title: t("ship", { count: counts.ship }),
      detail: t("shipDetail"),
      href: "/orders?tab=ship",
      action: t("viewOrders")
    })
  }
  if (counts.unpriced) {
    items.push({
      key: "unpriced",
      tone: "info",
      title: t("unpriced", { count: counts.unpriced }),
      detail: t("unpricedDetail"),
      href: "/products",
      action: t("viewProducts")
    })
  }
  if (counts.uncatalogued) {
    items.push({
      key: "uncatalogued",
      tone: "info",
      title: t("uncatalogued", { count: counts.uncatalogued }),
      detail: t("uncataloguedDetail"),
      href: "/customers",
      action: t("viewCustomers")
    })
  }
  return items
}

// A table that runs edge to edge inside its card, as on the buyer Overview: the first and last columns line up with the
// card's padding.
const edgeTable = "[&_td:first-child]:ps-4 [&_td:last-child]:pe-4 [&_th:first-child]:ps-4 [&_th:last-child]:pe-4"

// The change against the comparison period, such as +12% vs previous period.
function Delta({ change, comparison }: { change: number | null; comparison: string | null }) {
  const t = useTranslations("supplier.overview")
  const locale = useLocale()
  if (change === null || !comparison) {
    return <span className="text-xs text-muted-foreground">{t("noComparison")}</span>
  }
  const up = change >= 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <Badge variant="outline" className={up ? "text-success" : "text-destructive"}>
        <Icon data-icon="inline-start" />
        {new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0, signDisplay: "always" }).format(
          Math.round(change * 100) / 100
        )}
      </Badge>
      {t("versus", { comparison })}
    </span>
  )
}

function Kpi({
  label,
  value,
  change,
  comparison
}: {
  label: string
  value: string
  change: number | null
  // The comparison period's key, such as previousPeriod, or null for none.
  comparison: string | null
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums group-data-[size=sm]/card:text-2xl">
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Delta change={change} comparison={comparison} />
      </CardContent>
    </Card>
  )
}

// A ranked list with a bar for each row's share of the largest, like Shopify's analytics cards.
function BarList({
  rows,
  empty
}: {
  rows: Array<{ key: string; label: React.ReactNode; detail?: string; value: number; display: string }>
  empty: string
}) {
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">{empty}</p>
  }
  const max = Math.max(...rows.map((row) => row.value), 1)
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.key} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{row.label}</span>
            <span className="shrink-0 font-medium tabular-nums">{row.display}</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-chart-1"
              style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
            />
          </div>
          {row.detail && <span className="text-xs text-muted-foreground">{row.detail}</span>}
        </li>
      ))}
    </ul>
  )
}

// Markup for the open order counts: the number stands out, its noun doesn't.
const strongCount = (chunks: React.ReactNode) => <span className="font-medium">{chunks}</span>
const mutedText = (chunks: React.ReactNode) => <span className="text-muted-foreground">{chunks}</span>

// Each open order stage's tab on the Orders page.
const stages = {
  pack: "pack",
  waiting: "waiting",
  ship: "ship",
  shipped: "shipped"
} as const

// A supplier's Overview, about its supply operations: what needs doing, orders coming in against the period before,
// where open orders stand, what's ordered most and by whom, and how stock stands against open orders.
export function SupplierOverview({ data, permissions }: { data: Data; permissions: Permissions }) {
  // What needs doing on the pages the person can open.
  const t = useTranslations("supplier.overview")
  const locale = useLocale()
  const taskText = useTranslations("supplier.overview.tasks")
  const money = useMoney()
  const todo = tasks(data.attention, taskText).filter((item) => canOpen(permissions, item.href))
  const periods = useTranslations("overview.period")
  const { period } = data
  const periodLabel = period.key === "custom" ? rangeLabel(period.range, locale) : periods(`presets.${period.key}`)
  const comparison = period.comparison === "none" ? null : period.comparison
  const price = (value: number) => money(value, data.currency)
  const pipelineMax = Math.max(...data.pipeline.map((row) => row.pieces), 1)
  const { inventory } = data
  const health = [
    { key: "short", count: inventory.short, icon: CircleAlert, className: "text-destructive" },
    { key: "out", count: inventory.out, icon: CircleSlash, className: "text-destructive" },
    { key: "low", count: inventory.low, icon: TriangleAlert, className: "text-warning" },
    { key: "healthy", count: inventory.healthy, icon: CircleCheck, className: "text-success" }
  ] as const

  return (
    <div className="@container flex flex-col gap-6">
      <Attention items={todo} />

      <div className="grid gap-4 @lg:grid-cols-2 @4xl:grid-cols-4">
        <Kpi
          label={t("ordersReceived")}
          value={data.kpis.orders.value.toLocaleString(locale)}
          change={data.kpis.orders.change}
          comparison={comparison}
        />
        <Kpi
          label={t("orderValue")}
          value={price(data.kpis.value.value)}
          change={data.kpis.value.change}
          comparison={comparison}
        />
        <Kpi
          label={t("piecesOrdered")}
          value={data.kpis.pieces.value.toLocaleString(locale)}
          change={data.kpis.pieces.change}
          comparison={comparison}
        />
        <Kpi
          label={t("piecesShipped")}
          value={data.kpis.shipped.value.toLocaleString(locale)}
          change={data.kpis.shipped.change}
          comparison={comparison}
        />
      </div>

      <div className="grid items-start gap-4 @4xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{t("ordersReceived")}</CardTitle>
            <CardDescription>{t("chartDescription", { currency: data.currency })}</CardDescription>
          </CardHeader>
          <CardContent>
            <OrdersChart series={data.series} currency={data.currency} comparison={comparison} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("openOrders")}</CardTitle>
            <CardDescription>
              {t("backlog", { orders: data.backlog.orders, pieces: data.backlog.pieces })}
            </CardDescription>
            <CardAction>
              <CardLink href="/orders">{t("viewAll")}</CardLink>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3">
              {data.pipeline.map((row) => (
                <li key={row.key}>
                  <PageLink href={`/orders?tab=${stages[row.key]}`} className="flex flex-col gap-1 hover:opacity-80">
                    <span className="flex items-baseline justify-between gap-3 text-sm">
                      <span>{t(`stages.${row.key}`)}</span>
                      <span className="tabular-nums">
                        {t.rich("stageOrders", {
                          count: row.orders,
                          strong: strongCount,
                          muted: mutedText
                        })}
                      </span>
                    </span>
                    <span className="h-1.5 rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-chart-1"
                        style={{ width: `${row.pieces ? Math.max(2, (row.pieces / pipelineMax) * 100) : 0}%` }}
                      />
                    </span>
                    <span className="text-xs text-muted-foreground">{t("pieces", { count: row.pieces })}</span>
                  </PageLink>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid items-start gap-4 @3xl:grid-cols-2 @6xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t("topProducts")}</CardTitle>
            <CardDescription>{t("topProductsDescription", { period: periodLabel })}</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              empty={t("noOrdersInPeriod")}
              rows={data.topProducts.map((row) => ({
                key: row.sku,
                label: row.groupId ? (
                  <PageLink href={`/products/${row.groupId}`} className="hover:underline">
                    {row.title}
                  </PageLink>
                ) : (
                  row.title
                ),
                detail: t("productDetail", { sku: row.sku, value: price(Math.round(row.value)) }),
                value: row.pieces,
                display: row.pieces.toLocaleString(locale)
              }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("topCustomers")}</CardTitle>
            <CardDescription>{t("topCustomersDescription", { period: periodLabel })}</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              empty={t("noOrdersInPeriod")}
              rows={data.topCustomers.map((row) => ({
                key: row.id,
                label: (
                  <PageLink href={`/customers/${row.id}`} className="hover:underline">
                    {row.name}
                  </PageLink>
                ),
                detail: t("orders", { count: row.orders }),
                value: row.value,
                display: price(row.value)
              }))}
            />
          </CardContent>
        </Card>
        <Card className="@3xl:col-span-2 @6xl:col-span-1">
          <CardHeader>
            <CardTitle>{t("inventoryHealth")}</CardTitle>
            <CardDescription>
              {inventory.tracked
                ? t("inventorySummary", {
                    count: inventory.tracked,
                    value:
                      inventory.value.map((row) => money(row.amount, row.currency)).join(" + ") ||
                      money(0, data.currency)
                  })
                : t("noTracked")}
            </CardDescription>
            <CardAction>
              <CardLink href="/inventory">{t("viewAll")}</CardLink>
            </CardAction>
          </CardHeader>
          {inventory.tracked > 0 && (
            <CardContent className="flex flex-col gap-4">
              <ul className="grid grid-cols-2 gap-2">
                {health.map((row) => (
                  <li key={row.key} className="rounded-lg border px-3 py-2">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <row.icon className={cn("size-3.5", row.className)} aria-hidden />
                      {t(`health.${row.key}`)}
                    </span>
                    <span className="text-lg font-semibold tabular-nums">{row.count.toLocaleString(locale)}</span>
                  </li>
                ))}
              </ul>
              {inventory.watch.length > 0 && (
                <ItemGroup className="gap-1">
                  {inventory.watch.map((row) => (
                    <Item key={row.id} size="sm" className="px-0">
                      <ItemMedia>
                        <ProductThumb image={row.image} className="size-9" />
                      </ItemMedia>
                      <ItemContent className="min-w-0">
                        <ItemTitle className="w-full truncate">{row.title}</ItemTitle>
                        <ItemDescription className="truncate">{row.variant ?? row.supplierSku}</ItemDescription>
                      </ItemContent>
                      {/* Short says by how much; low says what's left once open orders are filled. */}
                      <ItemActions className="flex-col items-end gap-0 text-end">
                        <span
                          className={cn("text-sm font-medium tabular-nums", row.available < 0 && "text-destructive")}
                        >
                          {row.available < 0
                            ? t("shortBy", { count: -row.available })
                            : t("available", { count: row.available })}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {t("committedOnHand", { committed: row.committed, onHand: row.onHand })}
                        </span>
                      </ItemActions>
                    </Item>
                  ))}
                </ItemGroup>
              )}
            </CardContent>
          )}
        </Card>
      </div>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b pt-4">
          <CardTitle>{t("recentOrders")}</CardTitle>
          <CardAction>
            <CardLink href="/orders">{t("viewAll")}</CardLink>
          </CardAction>
        </CardHeader>
        {data.recent.length ? (
          <Table framed={false} className={edgeTable}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.order")}</TableHead>
                <TableHead className="hidden @lg:table-cell">{t("columns.customer")}</TableHead>
                <TableHead>{t("columns.status")}</TableHead>
                <TableHead className="hidden text-end @2xl:table-cell">{t("columns.pieces")}</TableHead>
                <TableHead className="text-end">{t("columns.total")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recent.map((order) => (
                <LinkRow key={order.id} href={`/orders/${order.id}`}>
                  <TableCell>
                    <PageLink href={`/orders/${order.id}`} className="font-medium underline-offset-4 hover:underline">
                      {order.reference}
                    </PageLink>
                    <p className="text-xs text-muted-foreground">{formatDate(order.sentAt, locale)}</p>
                  </TableCell>
                  <TableCell className="hidden @lg:table-cell">{order.customer}</TableCell>
                  <TableCell>
                    <Status status={order.status} />
                  </TableCell>
                  <TableCell className="hidden text-end tabular-nums @2xl:table-cell">
                    {formatNumber(order.pieces, locale)}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">{money(order.total, order.currency)}</TableCell>
                </LinkRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <CardContent className="py-4 text-sm text-muted-foreground">{t("noOrders")}</CardContent>
        )}
      </Card>
    </div>
  )
}
