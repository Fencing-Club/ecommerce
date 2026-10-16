import { Link } from "@tanstack/react-router"
import { FileUp, Plus } from "lucide-react"
import { useTranslations } from "use-intl"
import { EmptyState, PageHeader } from "@/components/common"
import { OrderList } from "@/components/order-list"
import { StatCard, StatGrid } from "@/components/stat-card"
import { SupplierOrderIndex } from "@/components/supplier/order-index"
import { Button } from "@/components/ui/button"
import type { ordersPage } from "@/server/orders-page"

export default function OrdersPage({ page }: { page: Awaited<ReturnType<typeof ordersPage>> }) {
  const t = useTranslations("orders.index")
  if (page.view === "supplier") {
    return (
      <>
        <PageHeader title={t("supplierTitle")} />
        <SupplierOrderIndex orders={page.orders} initialTab={page.tab} />
      </>
    )
  }
  const { rows, showValue, isBuyer, creates, nextStep, guided, kind, status, timeZone } = page
  return (
    <>
      <PageHeader title={t("title")}>
        {creates && (
          <>
            <Button variant="outline" nativeButton={false} render={<Link to="/orders/import" />}>
              <FileUp data-icon="inline-start" />
              {t("import")}
            </Button>
            <Button nativeButton={false} render={<Link to="/orders/new" />}>
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
          {/* Only buyers have drafts. */}
          {isBuyer && (
            <StatCard label={t("stats.drafts")} value={rows.filter((r) => r.order.status === "draft").length} />
          )}
        </StatGrid>
      )}

      {rows.length ? (
        <OrderList rows={rows} status={status} showValue={showValue} drafts={isBuyer} timeZone={timeZone} />
      ) : (
        <EmptyState
          title={guided ? t("empty.guidedTitle") : t("empty.title")}
          description={guided ? nextStep.description : t(kind === "forwarder" ? "empty.forwarder" : "empty.other")}
        >
          {guided && (
            <Button nativeButton={false} render={<Link to="." href={nextStep.href} />}>
              {nextStep.action}
            </Button>
          )}
        </EmptyState>
      )}
    </>
  )
}
