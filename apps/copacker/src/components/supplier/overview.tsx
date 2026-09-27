import { money } from "@repo/aisle"
import { ArrowRight, BookOpen, CircleCheck, CircleDollarSign, PackageOpen, PackageX, Tag, Truck } from "lucide-react"
import Link from "next/link"
import { Status } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { supplierOverview } from "@/server/supplier-workspace"
import { ProductThumb } from "./shared"

type Data = Awaited<ReturnType<typeof supplierOverview>>

function plural(count: number, one: string, many = `${one}s`) {
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`
}

function amounts(rows: Array<{ currency: string; amount: number }>) {
  return rows.length ? rows.map((row) => money(row.amount, row.currency)).join(" + ") : money(0)
}

// What needs the supplier, most urgent first. Each links to the list that has it.
function tasks(counts: Data["counts"]) {
  return [
    {
      show: counts.pack,
      icon: PackageOpen,
      title: `Pack ${plural(counts.pack, "order")}`,
      description: "Add cartons and the commercial invoice.",
      href: "/orders?tab=pack",
      tone: "default"
    },
    {
      show: counts.ship,
      icon: Truck,
      title: `Ship ${plural(counts.ship, "order")}`,
      description: "Labels are ready. Print them and mark the goods shipped.",
      href: "/orders?tab=ship",
      tone: "default"
    },
    {
      show: counts.short,
      icon: PackageX,
      title: `${plural(counts.short, "variant")} short of open orders`,
      description: "Open orders need more than you have on hand.",
      href: "/inventory?tab=short",
      tone: "destructive"
    },
    {
      show: counts.unpriced,
      icon: CircleDollarSign,
      title: `Price ${plural(counts.unpriced, "product")}`,
      description: "Customers can't get a price for these.",
      href: "/products",
      tone: "warning"
    },
    {
      show: counts.uncatalogued,
      icon: BookOpen,
      title: `${plural(counts.uncatalogued, "customer")} without a catalog`,
      description: "They see every active product at its own price.",
      href: "/customers",
      tone: "default"
    }
  ].filter((task) => task.show > 0)
}

function Stat({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums group-data-[size=sm]/card:text-2xl">
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{caption}</CardContent>
    </Card>
  )
}

export function SupplierOverview({ data }: { data: Data }) {
  const todo = tasks(data.counts)
  return (
    <div className="@container flex flex-col gap-6">
      <div className="grid gap-4 @lg:grid-cols-2 @4xl:grid-cols-4">
        <Stat label="Open orders" value={data.open.orders.toLocaleString("en-US")} caption={amounts(data.open.value)} />
        <Stat
          label="Pieces to ship"
          value={data.open.pieces.toLocaleString("en-US")}
          caption={
            data.counts.waiting ? `${plural(data.counts.waiting, "order")} waiting on customers` : "Across open orders"
          }
        />
        <Stat
          label="Ordered in 30 days"
          value={amounts(data.recent.value)}
          caption={plural(data.recent.orders, "order")}
        />
        <Stat label="Customers" value={data.customers.toLocaleString("en-US")} caption="Buyers ordering from you" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>To do</CardTitle>
        </CardHeader>
        <CardContent>
          {todo.length ? (
            <ItemGroup className="gap-2">
              {todo.map((task) => (
                <Item key={task.title} variant="outline" size="sm" render={<Link href={task.href} />}>
                  <ItemMedia
                    variant="icon"
                    className={cn(
                      task.tone === "destructive" && "text-destructive",
                      task.tone === "warning" && "text-warning"
                    )}
                  >
                    <task.icon />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{task.title}</ItemTitle>
                    <ItemDescription>{task.description}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CircleCheck className="size-4 text-success" aria-hidden />
              You’re all caught up.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 @4xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
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
            {data.orders.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead className="hidden @lg:table-cell">Customer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.orders.map((order) => (
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

        <Card>
          <CardHeader>
            <CardTitle>Stock to watch</CardTitle>
            <CardAction>
              <Button size="sm" variant="ghost" nativeButton={false} render={<Link href="/inventory" />}>
                Inventory
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {data.stock.length ? (
              <ItemGroup className="gap-1">
                {data.stock.map((row) => (
                  <Item key={row.id} size="sm" className="px-0">
                    <ItemMedia>
                      <ProductThumb image={row.image} className="size-9" />
                    </ItemMedia>
                    <ItemContent className="min-w-0">
                      <ItemTitle className="w-full truncate">{row.title}</ItemTitle>
                      <ItemDescription className="truncate">{row.variant ?? row.supplierSku}</ItemDescription>
                    </ItemContent>
                    <ItemActions className="flex-col items-end gap-0 text-right">
                      <span className={cn("text-sm font-medium tabular-nums", row.available < 0 && "text-destructive")}>
                        {row.available.toLocaleString("en-US")}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {row.committed.toLocaleString("en-US")} committed
                      </span>
                    </ItemActions>
                  </Item>
                ))}
              </ItemGroup>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                {data.tracked ? (
                  <>
                    <CircleCheck className="size-4 text-success" aria-hidden />
                    Stock covers every open order.
                  </>
                ) : (
                  <>
                    <Tag className="size-4" aria-hidden />
                    Track inventory on products to see stock here.
                  </>
                )}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
