"use client"

import { Plus } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "use-intl"
import type { catalogsPageData } from "@/server/workspace-pages"
import { PageHeader } from "./common"
import { CatalogIndex } from "./supplier/catalog-index"
import { Button } from "./ui/button"

export function CatalogsPageView({ catalogs, editable }: Awaited<ReturnType<typeof catalogsPageData>>) {
  const t = useTranslations("supplier.pages")
  return (
    <>
      <PageHeader title={t("catalogs")}>
        {catalogs.length > 0 && editable && (
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
