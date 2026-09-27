import { Plus } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/common"
import { CatalogIndex } from "@/components/supplier/catalog-index"
import { Button } from "@/components/ui/button"
import { session } from "@/server/auth"
import { catalogList } from "@/server/catalogs"

export const metadata: Metadata = { title: "Catalogs" }

export default async function CatalogsPage() {
  const s = await session()
  if (s.org.kind !== "supplier") {
    redirect("/")
  }
  const catalogs = await catalogList(s.org.id)
  return (
    <>
      <PageHeader title="Catalogs">
        {catalogs.length > 0 && (
          <Button nativeButton={false} render={<Link href="/catalogs/new" />}>
            <Plus data-icon="inline-start" />
            Create catalog
          </Button>
        )}
      </PageHeader>
      <CatalogIndex catalogs={catalogs} />
    </>
  )
}
