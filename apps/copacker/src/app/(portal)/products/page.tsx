import { useRouter } from "@tanstack/react-router"
import { ProductsPageView } from "@/components/products-page"
import type { ProductsSearch } from "@/lib/page-search"
import type { PageData } from "@/server/page-result"
import type { readProducts } from "@/workspace.functions"

export default function ProductsPage({
  page,
  search
}: {
  page: PageData<typeof readProducts>
  search: ProductsSearch
}) {
  const router = useRouter()
  return <ProductsPageView page={page} search={search.q} refresh={() => router.invalidate()} />
}
