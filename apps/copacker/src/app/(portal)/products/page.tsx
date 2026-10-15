import { redirect } from "next/navigation"
import { ProductsPageView } from "@/components/products-page"
import { requirePage, session, titleFor } from "@/server/auth"
import { productsPageData } from "@/server/workspace-pages"

export const generateMetadata = titleFor("products.page.title", "products")
export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const s = await session()
  requirePage(s, "products")
  if (s.org.kind !== "supplier" && s.org.kind !== "buyer") {
    redirect("/orders")
  }
  return <ProductsPageView page={await productsPageData(s, (await searchParams).q)} />
}
