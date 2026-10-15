import { redirect } from "next/navigation"
import { CatalogsPageView } from "@/components/catalogs-page"
import { requirePage, session, titleFor } from "@/server/auth"
import { withRequest } from "@/server/next-request"
import { catalogsPageData } from "@/server/workspace-pages"

export const generateMetadata = titleFor("supplier.pages.catalogs", "catalogs")

export default withRequest(async function CatalogsPage() {
  const s = await session()
  if (s.org.kind !== "supplier") {
    redirect("/")
  }
  requirePage(s, "catalogs")
  requirePage(s, "prices")
  return <CatalogsPageView {...await catalogsPageData(s)} />
})
