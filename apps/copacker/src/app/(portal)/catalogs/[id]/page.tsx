import { notFound, redirect } from "next/navigation"
import { CatalogEditor } from "@/components/supplier/catalog-editor"
import { requirePage, session, titleFor } from "@/server/auth"
import { withRequest } from "@/server/next-request"
import { catalogPageData } from "@/server/workspace-pages"

export const generateMetadata = titleFor("supplier.pages.catalog", "catalogs")
export default withRequest(async function CatalogPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await session()
  if (s.org.kind !== "supplier") {
    redirect("/")
  }
  requirePage(s, "catalogs")
  requirePage(s, "prices")
  const page = await catalogPageData(s, (await params).id)
  if (!page) {
    notFound()
  }
  return <CatalogEditor key={page.data.catalog?.revision} {...page} />
})
