import { ProductEditor } from "@/components/supplier/product-editor"
import type { readNewProduct } from "@/workspace.functions"

type Data = Extract<Awaited<ReturnType<typeof readNewProduct>>, { forbidden: false }>["page"]
export default function NewProductPage({ page }: { page: Data["data"] }) {
  return <ProductEditor {...page} />
}
