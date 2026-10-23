import { Button } from "@buildkitgg/shadcn-baseui-kit"
import { Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { useTranslations } from "use-intl"
import type { productsPageData } from "@/server/workspace-pages"
import { PageHeader } from "./common"
import { InventorySync } from "./inventory-sync"
import { ProductIndex } from "./supplier/product-index"
import { ProductActions } from "./supplier/product-transfer"

// `search` is a buyer's search from the URL, such as the header search's ?q=.
export function ProductsPageView({
  page,
  search = "",
  refresh
}: {
  page: Awaited<ReturnType<typeof productsPageData>>
  search?: string
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
      <InventorySync providers={page.providers} search={search} />
    </>
  )
}
