import { useRouter } from "@tanstack/react-router"
import { ProductsPageView } from "@/components/products-page"
import type { readProducts } from "@/workspace.functions"

type Data = Extract<Awaited<ReturnType<typeof readProducts>>, { forbidden: false }>["page"]
export default function ProductsPage({ page }: { page: Data["data"] }) {
  const router = useRouter()
  return <ProductsPageView page={page} refresh={() => router.invalidate()} />
}
