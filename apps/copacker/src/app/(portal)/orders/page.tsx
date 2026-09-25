import { money, orderTotal } from "@repo/aisle"
import { Plus } from "lucide-react"
import Link from "next/link"
import { EmptyState, PageHeader, StatCard, StatGrid, Status, formatDestination } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { visibleOrders } from "@/server/access"
import { session } from "@/server/auth"

export default async function OrdersPage() {
  const s = await session()
  const rows = (await visibleOrders(s)).reverse()
  const isBuyer = s.org.kind === "buyer"

  return (
    <>
      <PageHeader
        title="Purchase orders"
        description="A shared view of every order, from the first piece to the last carton."
      >
        {isBuyer && (
          <Button nativeButton={false} render={<Link href="/orders/new" />}>
            <Plus data-icon="inline-start" />
            Create purchase order
          </Button>
        )}
      </PageHeader>

      <StatGrid>
        <StatCard
          label="Open orders"
          value={rows.filter((r) => r.order.status !== "closed").length}
          caption="Across your suppliers"
        />
        <StatCard
          label="With suppliers"
          value={rows.filter((r) => r.order.status === "submitted").length}
          caption="Submitted and in progress"
        />
        <StatCard
          label="Drafts"
          value={rows.filter((r) => r.order.status === "draft").length}
          caption="Ready when you are"
        />
      </StatGrid>

      <Card>
        <CardHeader>
          <CardTitle>All purchase orders</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Purchase order</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ order, supplier }) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Link className="font-medium underline-offset-4 hover:underline" href={`/orders/${order.id}`}>
                        {order.data.reference}
                      </Link>
                      <p className="text-xs text-muted-foreground">{order.data.items.length} products</p>
                    </TableCell>
                    <TableCell>{supplier.name}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDestination(order.data.destination)}</TableCell>
                    <TableCell>
                      <Status status={order.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(orderTotal(order.data), order.data.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title="Your next shipment starts here"
              description={
                isBuyer
                  ? "Connect Shopify and Amazon, invite your supplier, then create your first purchase order."
                  : "Accept a buyer invitation to see the purchase orders shared with your workspace."
              }
            >
              {isBuyer && (
                <Button nativeButton={false} render={<Link href="/settings" />}>
                  Connect your accounts
                </Button>
              )}
            </EmptyState>
          )}
        </CardContent>
      </Card>
    </>
  )
}
