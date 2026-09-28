import { and, eq, isNull } from "drizzle-orm"
import { FileUp, Plus } from "lucide-react"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import Link from "next/link"
import { EmptyState, PageHeader, StatCard, StatGrid } from "@/components/common"
import { OrderList } from "@/components/order-list"
import { SupplierOrderIndex } from "@/components/supplier/order-index"
import { Button } from "@/components/ui/button"
import { db } from "@/db"
import { connections, suppliers } from "@/db/schema"
import { can, isAdmin } from "@/lib/access"
import { forwarderOrders, visibleOrders } from "@/server/access"
import { noAccessTitle, requirePage, session } from "@/server/auth"
import { supplierOrders, withoutTotals } from "@/server/supplier-workspace"

export async function generateMetadata(): Promise<Metadata> {
  const [s, t] = await Promise.all([session(), getTranslations("orders.index")])
  if (!can(s, "orders")) {
    return noAccessTitle()
  }
  return { title: s.org.kind === "supplier" ? t("supplierTitle") : t("title") }
}

export default async function OrdersPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; tab?: string }>
}) {
  const [s, t] = await Promise.all([session(), getTranslations("orders.index")])
  requirePage(s, "orders")
  if (s.org.kind === "supplier") {
    const [orders, { tab }] = await Promise.all([supplierOrders(s.org.id), searchParams])
    return (
      <>
        <PageHeader title={t("supplierTitle")} />
        <SupplierOrderIndex orders={can(s, "prices") ? orders : withoutTotals(orders)} initialTab={tab} />
      </>
    )
  }
  // A forwarder sees the POs whose goods pass through it, without their prices.
  const rows = (s.org.kind === "forwarder" ? await forwarderOrders(s) : await visibleOrders(s)).reverse()
  // A forwarder never sees what a purchase order is worth, and a member sees it only with prices.
  const showValue = s.org.kind !== "forwarder" && can(s, "prices")
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
  const creates = isBuyer && can(s, "orders", "edit")
  let nextStep = {
    description: t("next.create.description"),
    href: "/orders/new",
    action: t("create"),
    allowed: creates
  }
  if (!shopify) {
    nextStep = {
      description: t("next.shopify.description"),
      href: "/settings#integrations",
      action: t("next.shopify.action"),
      allowed: isAdmin(s)
    }
  } else if (!supplierLink) {
    nextStep = {
      description: t("next.supplier.description"),
      href: "/partners",
      action: t("next.supplier.action"),
      allowed: can(s, "partners", "edit")
    }
  }
  // Someone who can't take the next step just hears there are none yet.
  const guided = isBuyer && nextStep.allowed

  return (
    <>
      <PageHeader title={t("title")}>
        {creates && (
          <>
            <Button variant="outline" nativeButton={false} render={<Link href="/orders/import" />}>
              <FileUp data-icon="inline-start" />
              {t("import")}
            </Button>
            <Button nativeButton={false} render={<Link href="/orders/new" />}>
              <Plus data-icon="inline-start" />
              {t("create")}
            </Button>
          </>
        )}
      </PageHeader>

      {/* Counts only help once there is something to count. */}
      {rows.length > 0 && (
        <StatGrid>
          <StatCard label={t("stats.open")} value={rows.filter((r) => r.order.status !== "closed").length} />
          <StatCard
            label={t("stats.withSuppliers")}
            value={rows.filter((r) => r.order.status === "submitted").length}
          />
          <StatCard label={t("stats.drafts")} value={rows.filter((r) => r.order.status === "draft").length} />
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
          title={guided ? t("empty.guidedTitle") : t("empty.title")}
          description={
            guided ? nextStep.description : t(s.org.kind === "forwarder" ? "empty.forwarder" : "empty.other")
          }
        >
          {guided && (
            <Button nativeButton={false} render={<Link href={nextStep.href} />}>
              {nextStep.action}
            </Button>
          )}
        </EmptyState>
      )}
    </>
  )
}
