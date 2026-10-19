import { Link } from "@tanstack/react-router"
import { AlertTriangle } from "lucide-react"
import { useTranslations } from "use-intl"
import { EmptyState, PageHeader } from "@/components/common"
import { LogisticsList } from "@/components/logistics-list"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { shipmentsPage } from "@/server/shipments-page"

export default function ShipmentsPage({ page }: { page: Awaited<ReturnType<typeof shipmentsPage>> }) {
  const { viewer, seesOrders, amazonFailed, view, rows } = page
  const t = useTranslations("shipments.list")
  const failed = amazonFailed && (
    <Alert>
      <AlertTriangle />
      <AlertTitle>{t("amazonFailed.title")}</AlertTitle>
      <AlertDescription>{t("amazonFailed.description")}</AlertDescription>
    </Alert>
  )
  if (!rows.length) {
    return (
      <>
        <PageHeader title={t("title")} />
        {failed}
        <EmptyState
          title={t("none.title")}
          description={viewer === "supplier" ? t("none.supplierDescription") : t("none.buyerDescription")}
        >
          {seesOrders && (
            <Button variant="outline" nativeButton={false} render={<Link to="/orders" />}>
              {viewer === "supplier" ? t("none.viewOrders") : t("none.viewPurchaseOrders")}
            </Button>
          )}
        </EmptyState>
      </>
    )
  }
  return <LogisticsList kind="shipments" viewer={viewer} rows={rows} view={view} notice={failed} />
}
