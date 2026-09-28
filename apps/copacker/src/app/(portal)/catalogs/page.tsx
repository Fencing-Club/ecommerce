import { Plus } from "lucide-react"
import { getTranslations } from "next-intl/server"
import Link from "next/link"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/common"
import { CatalogIndex } from "@/components/supplier/catalog-index"
import { Button } from "@/components/ui/button"
import { can } from "@/lib/access"
import { requirePage, session, titleFor } from "@/server/auth"
import { catalogList } from "@/server/catalogs"

export const generateMetadata = titleFor("supplier.pages.catalogs", "catalogs")

export default async function CatalogsPage() {
  const s = await session()
  if (s.org.kind !== "supplier") {
    redirect("/")
  }
  requirePage(s, "catalogs")
  const [catalogs, t] = await Promise.all([catalogList(s.org.id), getTranslations("supplier.pages")])
  return (
    <>
      <PageHeader title={t("catalogs")}>
        {catalogs.length > 0 && can(s, "catalogs", "edit") && (
          <Button nativeButton={false} render={<Link href="/catalogs/new" />}>
            <Plus data-icon="inline-start" />
            {t("createCatalog")}
          </Button>
        )}
      </PageHeader>
      <CatalogIndex catalogs={catalogs} />
    </>
  )
}
