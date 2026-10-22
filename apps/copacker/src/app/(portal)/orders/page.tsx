import { Link } from "@tanstack/react-router"
import { FileUp, Plus } from "lucide-react"
import { useTranslations } from "use-intl"
import { EmptyState, PageHeader } from "@/components/common"
import { LogisticsList } from "@/components/logistics-list"
import { SupplierOrderIndex } from "@/components/supplier/order-index"
import { Button } from "@/components/ui/button"
import type { OrdersSearch } from "@/lib/page-search"
import type { ordersPage } from "@/server/orders-page"

// `search` is the URL's: a supplier's tab, or everyone else's view.
export default function OrdersPage({
  page,
  search
}: {
  page: Awaited<ReturnType<typeof ordersPage>>
  search: OrdersSearch
}) {
  const t = useTranslations("orders.index")
  if (page.view === "supplier") {
    return (
      <>
        <PageHeader title={t("supplierTitle")} />
        <SupplierOrderIndex orders={page.orders} initialTab={search.tab} />
      </>
    )
  }
  const { rows, creates, nextStep, guided, kind } = page
  const actions = creates && (
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
  )
  if (!rows.length) {
    return (
      <>
        <PageHeader title={t("title")}>{actions}</PageHeader>
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
      </>
    )
  }
  return <LogisticsList kind="orders" viewer={kind} rows={rows} view={search.view} actions={actions} />
}
