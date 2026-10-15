import { notFound, redirect } from "next/navigation"
import { CatalogEditor } from "@/components/supplier/catalog-editor"
import { requirePage, session, titleFor } from "@/server/auth"
import { withRequest } from "@/server/next-request"
import { catalogPageData } from "@/server/workspace-pages"

export const generateMetadata = titleFor("supplier.pages.newCatalog", "catalogs", "edit")
export default withRequest(async function NewCatalogPage() {
  const s = await session()
  if (s.org.kind !== "supplier") {
    redirect("/")
  }
  requirePage(s, "catalogs", "edit")
  requirePage(s, "prices")
  const page = await catalogPageData(s, null)
  if (!page) {
    notFound()
  }
  return <CatalogEditor key={page.data.catalog?.revision} {...page} />
})
