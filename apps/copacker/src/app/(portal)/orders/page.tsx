import { and, eq, isNull } from "drizzle-orm"
import { FileUp, Plus } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { EmptyState, PageHeader, StatCard, StatGrid } from "@/components/common"
import { OrderList } from "@/components/order-list"
import { SupplierOrderIndex } from "@/components/supplier/order-index"
import { Button } from "@/components/ui/button"
import { db } from "@/db"
import { connections, suppliers } from "@/db/schema"
import { forwarderOrders, visibleOrders } from "@/server/access"
import { session } from "@/server/auth"
import { supplierOrders } from "@/server/supplier-workspace"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await session()).org.kind === "supplier" ? "Orders" : "Purchase orders" }
}

export default async function OrdersPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; tab?: string }>
}) {
  const s = await session()
  if (s.org.kind === "supplier") {
    const [orders, { tab }] = await Promise.all([supplierOrders(s.org.id), searchParams])
    return (
      <>
        <PageHeader title="Orders" />
        <SupplierOrderIndex orders={orders} initialTab={tab} />
      </>
    )
  }
  // A forwarder sees the POs whose goods pass through it, without their prices.
  const rows = (s.org.kind === "forwarder" ? await forwarderOrders(s) : await visibleOrders(s)).reverse()
  const showValue = s.org.kind !== "forwarder"
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
      href: "/settings#integrations",
      action: "Connect Shopify"
    }
  } else if (!supplierLink) {
    nextStep = {
      description: "Invite your supplier, then create your first purchase order.",
      href: "/partners",
      action: "Invite a supplier"
    }
  }

  return (
    <>
      <PageHeader title="Purchase orders">
        {isBuyer && (
          <>
            <Button variant="outline" nativeButton={false} render={<Link href="/orders/import" />}>
              <FileUp data-icon="inline-start" />
              Import
            </Button>
            <Button nativeButton={false} render={<Link href="/orders/new" />}>
              <Plus data-icon="inline-start" />
              Create purchase order
            </Button>
          </>
        )}
      </PageHeader>

      {/* Counts only help once there is something to count. */}
      {rows.length > 0 && (
        <StatGrid>
          <StatCard label="Open orders" value={rows.filter((r) => r.order.status !== "closed").length} />
          <StatCard label="With suppliers" value={rows.filter((r) => r.order.status === "submitted").length} />
          <StatCard label="Drafts" value={rows.filter((r) => r.order.status === "draft").length} />
        </StatGrid>
      )}

      {rows.length ? (
        <OrderList
          rows={rows}
          status={(await searchParams).status}
          showValue={showValue}
          drafts={isBuyer}
          timeZone={s.org.timeZone ?? undefined}
        />
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
    </>
  )
}
