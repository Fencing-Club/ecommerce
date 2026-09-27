import { money, orderTotal } from "@repo/aisle"
import { and, eq, isNull } from "drizzle-orm"
import { Plus } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { EmptyState, PageHeader, StatCard, StatGrid, Status, formatDestination } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { db } from "@/db"
import { connections, suppliers } from "@/db/schema"
import { visibleOrders } from "@/server/access"
import { session } from "@/server/auth"
import { rowLink } from "../portal.css"
import { sx } from "@/styles/sprinkles.css"

export const metadata: Metadata = { title: "Purchase orders" }

export default async function OrdersPage() {
  const s = await session()
  const rows = (await visibleOrders(s)).reverse()
  const isBuyer = s.org.kind === "buyer"
  // With no POs yet, a buyer is pointed at whichever step comes next: connecting Shopify, inviting a supplier, or the
  // first PO.
  const [shopify] = isBuyer
    ? await db()
        .select({ id: connections.externalId })
        .from(connections)
        .where(and(eq(connections.orgId, s.org.id), eq(connections.provider, "shopify")))
    : []
  const [supplierLink] =
    isBuyer && !rows.length
      ? await db()
          .select({ id: suppliers.id })
          .from(suppliers)
          .where(and(eq(suppliers.buyerOrgId, s.org.id), isNull(suppliers.removedAt)))
          .limit(1)
      : []
  let nextStep = {
    description: "Choose products from your catalog, then send the purchase order to your supplier.",
    href: "/orders/new",
    action: "Create purchase order"
  }
  if (!shopify) {
    nextStep = {
      description: "Connect Shopify so purchase orders can use your catalog, then invite your supplier.",
      href: "/settings",
      action: "Connect Shopify"
    }
  } else if (!supplierLink) {
    nextStep = {
      description: "Invite your supplier, then create your first purchase order.",
      href: "/suppliers",
      action: "Invite a supplier"
    }
  }

  return (
    <>
      <PageHeader title="Purchase orders">
        {isBuyer && (
          <Button nativeButton={false} render={<Link href="/orders/new" />}>
            <Plus data-icon="inline-start" />
            Create purchase order
          </Button>
        )}
      </PageHeader>

      {/* Counts only help once there is something to count. */}
      {rows.length > 0 && (
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
      )}

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
                  <TableHead className={sx({ textAlign: "right" })}>Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ order, supplier }) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Link className={rowLink} href={`/orders/${order.id}`}>
                        {order.data.reference}
                      </Link>
                      <p className={sx({ text: "xs", color: "muted" })}>{order.data.items.length} products</p>
                    </TableCell>
                    <TableCell>{supplier.name}</TableCell>
                    <TableCell className={sx({ color: "muted" })}>
                      {formatDestination(order.data.destination)}
                    </TableCell>
                    <TableCell>
                      <Status status={order.status} />
                    </TableCell>
                    <TableCell className={sx({ textAlign: "right", fontVariantNumeric: "tabular" })}>
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
                  ? nextStep.description
                  : "Accept a buyer invitation to see the purchase orders shared with your workspace."
              }
            >
              {isBuyer && (
                <Button nativeButton={false} render={<Link href={nextStep.href} />}>
                  {nextStep.action}
                </Button>
              )}
            </EmptyState>
          )}
        </CardContent>
      </Card>
    </>
  )
}
