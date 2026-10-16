import { redirect } from "next/navigation"
import { requirePage, session, titleFor } from "@/server/auth"
import { withRequest } from "@/server/next-request"
import { productsPageData } from "@/server/workspace-pages"
import { ProductsContent } from "./content"

export const generateMetadata = titleFor("products.page.title", "products")
export default withRequest(async function ProductsPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string | string[] }>
}) {
  const s = await session()
  requirePage(s, "products")
  if (s.org.kind !== "supplier" && s.org.kind !== "buyer") {
    redirect("/orders")
  }
  return <ProductsContent page={await productsPageData(s, (await searchParams).q)} />
})
