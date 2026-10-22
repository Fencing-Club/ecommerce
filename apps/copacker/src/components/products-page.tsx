import { Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { useTranslations } from "use-intl"
import { Button } from "@/components/ui/button"
import type { productsPageData } from "@/server/workspace-pages"
import { PageHeader } from "./common"
import { InventorySync } from "./inventory-sync"
import { ProductIndex } from "./supplier/product-index"
import { ProductActions } from "./supplier/product-transfer"

export function ProductsPageView({
  page,
  refresh
}: {
  page: Awaited<ReturnType<typeof productsPageData>>
  refresh: () => void
}) {
  const t = useTranslations("products.page")
  if (page.kind === "supplier") {
    return (
      <>
        <PageHeader title={t("title")}>
          <ProductActions onImported={refresh} />
          {page.products.length > 0 && page.editable && (
            <Button nativeButton={false} render={<Link to="/products/new" />}>
              <Plus data-icon="inline-start" />
              {t("addProduct")}
            </Button>
          )}
        </PageHeader>
        <ProductIndex products={page.products} />
      </>
    )
  }
  return (
    <>
      <PageHeader title={t("title")} />
      <InventorySync providers={page.providers} search={page.search} />
    </>
  )
}
