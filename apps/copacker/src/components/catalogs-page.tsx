import { Button } from "@buildkitgg/shadcn"
import { Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { useTranslations } from "use-intl"
import type { catalogsPageData } from "@/server/workspace-pages"
import { PageHeader } from "./common"
import { CatalogIndex } from "./supplier/catalog-index"

export function CatalogsPageView({ catalogs, editable }: Awaited<ReturnType<typeof catalogsPageData>>) {
  const t = useTranslations("supplier.pages")
  return (
    <>
      <PageHeader title={t("catalogs")}>
        {catalogs.length > 0 && editable && (
          <Button nativeButton={false} render={<Link to="/catalogs/new" />}>
            <Plus data-icon="inline-start" />
            {t("createCatalog")}
          </Button>
        )}
      </PageHeader>
      <CatalogIndex catalogs={catalogs} />
    </>
  )
}
