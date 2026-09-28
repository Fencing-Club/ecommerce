import { money } from "@repo/aisle"
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CircleAlert,
  CircleCheck,
  CircleDollarSign,
  CircleSlash,
  PackageOpen,
  PackageX,
  TriangleAlert,
  Truck
} from "lucide-react"
import Link from "next/link"
import { Status } from "@/components/common"
import { PeriodPicker } from "@/components/period-picker"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { SupplierOverviewData } from "@/server/supplier-overview"
import { OrdersChart } from "./overview-chart"
import { ProductThumb } from "./shared"

type Data = SupplierOverviewData

function plural(count: number, one: string, many = `${one}s`) {
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`
}

// What needs the supplier, most urgent first. Each links to the list that has it.
function tasks(counts: Data["attention"]) {
  return [
    {
      show: counts.short,
      icon: PackageX,
      tone: "critical",
      title: `${plural(counts.short, "variant")} short of open orders`,
      description: "Open orders need more than you have on hand.",
      href: "/inventory?tab=short",
      action: "View inventory"
    },
    {
      show: counts.pack,
      icon: PackageOpen,
      tone: "warning",
      title: `${plural(counts.pack, "order")} to pack`,
      description: "Add cartons and the commercial invoice.",
      href: "/orders?tab=pack",
      action: "View orders"
    },
    {
      show: counts.ship,
      icon: Truck,
      tone: "warning",
      title: `${plural(counts.ship, "order")} ready to ship`,
      description: "Labels are ready. Print them and mark the goods shipped.",
      href: "/orders?tab=ship",
      action: "View orders"
    },
    {
      show: counts.unpriced,
      icon: CircleDollarSign,
      tone: "info",
      title: `${plural(counts.unpriced, "product")} without a price`,
      description: "Customers can’t get a price for these.",
      href: "/products",
      action: "View products"
    },
    {
      show: counts.uncatalogued,
      icon: BookOpen,
      tone: "info",
      title: `${plural(counts.uncatalogued, "customer")} without a catalog`,
      description: "They see every active product at its own price.",
      href: "/customers",
      action: "View customers"
    }
  ].filter((task) => task.show > 0)
}

const tones: Record<string, string> = {
  critical: "bg-destructive/10 text-destructive",
  warning: "bg-warning/15 text-warning",
  info: "bg-muted text-muted-foreground"
}

function Delta({ change, label }: { change: number | null; label: string | null }) {
  if (change === null || !label) {
    return <span className="text-xs text-muted-foreground">No earlier orders to compare</span>
  }
  const up = change >= 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <Badge variant="outline" className={up ? "text-success" : "text-destructive"}>
        <Icon data-icon="inline-start" />
        {up ? "+" : "−"}
        {Math.abs(Math.round(change * 100))}%
      </Badge>
      vs {label.toLowerCase()}
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
        <Delta change={change} label={comparison} />
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

const stages = {
  pack: { label: "To pack", tab: "pack" },
  waiting: { label: "Waiting on customers", tab: "waiting" },
  ship: { label: "Ready to ship", tab: "ship" },
  shipped: { label: "In transit", tab: "shipped" }
} as const

// A supplier's Overview, about its supply operations: what needs doing, orders coming in against the period before,
// where open orders stand, what's ordered most and by whom, and how stock stands against open orders.
export function SupplierOverview({ data }: { data: Data }) {
  const todo = tasks(data.attention)
  const comparison = data.period.previousLabel ? data.period.comparisonLabel : null
  const price = (value: number) => money(value, data.currency)
  const pipelineMax = Math.max(...data.pipeline.map((row) => row.pieces), 1)
  const { inventory } = data
  const health = [
    { key: "short", label: "Short", count: inventory.short, icon: CircleAlert, className: "text-destructive" },
    { key: "out", label: "Out of stock", count: inventory.out, icon: CircleSlash, className: "text-destructive" },
    { key: "low", label: "Low", count: inventory.low, icon: TriangleAlert, className: "text-warning" },
    { key: "healthy", label: "In stock", count: inventory.healthy, icon: CircleCheck, className: "text-success" }
  ]

  return (
    <div className="@container flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <PeriodPicker period={data.period} />
      </div>

      {todo.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
            <CardAction>
              <Badge variant="secondary">{plural(todo.length, "item")}</Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ItemGroup className="gap-1">
              {todo.map((task) => (
                <Item key={task.title} size="sm" className="px-0" render={<Link href={task.href} />}>
                  <ItemMedia className={cn("size-8 rounded-md", tones[task.tone])}>
                    <task.icon className="size-4" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{task.title}</ItemTitle>
                    <ItemDescription>{task.description}</ItemDescription>
                  </ItemContent>
                  <ItemActions className="hidden text-sm text-muted-foreground @md:flex">
                    {task.action}
                    <ArrowRight className="size-4" aria-hidden />
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 @lg:grid-cols-2 @4xl:grid-cols-4">
        <Kpi
          label="Orders received"
          value={data.kpis.orders.value.toLocaleString("en-US")}
          change={data.kpis.orders.change}
          comparison={comparison}
        />
        <Kpi
          label="Order value"
          value={price(data.kpis.value.value)}
          change={data.kpis.value.change}
          comparison={comparison}
        />
        <Kpi
          label="Pieces ordered"
          value={data.kpis.pieces.value.toLocaleString("en-US")}
          change={data.kpis.pieces.change}
          comparison={comparison}
        />
        <Kpi
          label="Pieces shipped"
          value={data.kpis.shipped.value.toLocaleString("en-US")}
          change={data.kpis.shipped.change}
          comparison={comparison}
        />
      </div>

      <div className="grid items-start gap-4 @4xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Orders received</CardTitle>
            <CardDescription>Order value in {data.currency}, by the day each order arrived</CardDescription>
          </CardHeader>
          <CardContent>
            <OrdersChart series={data.series} currency={data.currency} previousLabel={data.period.previousLabel} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Open orders</CardTitle>
            <CardDescription>
              {plural(data.backlog.orders, "order")}, {plural(data.backlog.pieces, "piece")}
            </CardDescription>
            <CardAction>
              <Button size="sm" variant="ghost" nativeButton={false} render={<Link href="/orders" />}>
                View all
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3">
              {data.pipeline.map((row) => (
                <li key={row.key}>
                  <Link href={`/orders?tab=${stages[row.key].tab}`} className="flex flex-col gap-1 hover:opacity-80">
                    <span className="flex items-baseline justify-between gap-3 text-sm">
                      <span>{stages[row.key].label}</span>
                      <span className="tabular-nums">
                        <span className="font-medium">{row.orders}</span>
                        <span className="text-muted-foreground"> {row.orders === 1 ? "order" : "orders"}</span>
                      </span>
                    </span>
                    <span className="h-1.5 rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-chart-1"
                        style={{ width: `${row.pieces ? Math.max(2, (row.pieces / pipelineMax) * 100) : 0}%` }}
                      />
                    </span>
                    <span className="text-xs text-muted-foreground">{plural(row.pieces, "piece")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid items-start gap-4 @3xl:grid-cols-2 @6xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Top products</CardTitle>
            <CardDescription>Pieces ordered, {data.period.label.toLowerCase()}</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              empty="No orders in this period."
              rows={data.topProducts.map((row) => ({
                key: row.sku,
                label: row.groupId ? (
                  <Link href={`/products/${row.groupId}`} className="hover:underline">
                    {row.title}
                  </Link>
                ) : (
                  row.title
                ),
                detail: `${row.sku}, ${price(Math.round(row.value))}`,
                value: row.pieces,
                display: row.pieces.toLocaleString("en-US")
              }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top customers</CardTitle>
            <CardDescription>Order value, {data.period.label.toLowerCase()}</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              empty="No orders in this period."
              rows={data.topCustomers.map((row) => ({
                key: row.id,
                label: (
                  <Link href={`/customers/${row.id}`} className="hover:underline">
                    {row.name}
                  </Link>
                ),
                detail: plural(row.orders, "order"),
                value: row.value,
                display: price(row.value)
              }))}
            />
          </CardContent>
        </Card>
        <Card className="@3xl:col-span-2 @6xl:col-span-1">
          <CardHeader>
            <CardTitle>Inventory health</CardTitle>
            <CardDescription>
              {inventory.tracked
                ? `${plural(inventory.tracked, "tracked variant")}, ${inventory.value.map((row) => money(row.amount, row.currency)).join(" + ") || money(0, data.currency)} on hand`
                : "Track inventory on products to see stock here."}
            </CardDescription>
            <CardAction>
              <Button size="sm" variant="ghost" nativeButton={false} render={<Link href="/inventory" />}>
                Inventory
              </Button>
            </CardAction>
          </CardHeader>
          {inventory.tracked > 0 && (
            <CardContent className="flex flex-col gap-4">
              <ul className="grid grid-cols-2 gap-2">
                {health.map((row) => (
                  <li key={row.key} className="rounded-lg border px-3 py-2">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <row.icon className={cn("size-3.5", row.className)} aria-hidden />
                      {row.label}
                    </span>
                    <span className="text-lg font-semibold tabular-nums">{row.count.toLocaleString("en-US")}</span>
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
                      <ItemActions className="flex-col items-end gap-0 text-right">
                        <span
                          className={cn("text-sm font-medium tabular-nums", row.available < 0 && "text-destructive")}
                        >
                          {row.available.toLocaleString("en-US")}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {row.committed.toLocaleString("en-US")} committed
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

      <Card>
        <CardHeader>
          <CardTitle>Recent orders</CardTitle>
          <CardAction>
            <Button size="sm" variant="ghost" nativeButton={false} render={<Link href="/orders" />}>
              View all
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {data.recent.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead className="hidden @lg:table-cell">Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden text-right @2xl:table-cell">Pieces</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recent.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Link href={`/orders/${order.id}`} className="font-medium hover:underline">
                        {order.reference}
                      </Link>
                      <p className="text-xs text-muted-foreground">{formatDate(order.sentAt)}</p>
                    </TableCell>
                    <TableCell className="hidden @lg:table-cell">{order.customer}</TableCell>
                    <TableCell>
                      <Status status={order.status} />
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums @2xl:table-cell">
                      {order.pieces.toLocaleString("en-US")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{money(order.total, order.currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">Orders your customers send appear here.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
