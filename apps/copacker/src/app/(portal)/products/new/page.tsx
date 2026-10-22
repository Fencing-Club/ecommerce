import { ProductEditor } from "@/components/supplier/product-editor"
import type { PageData } from "@/server/page-result"
import type { readNewProduct } from "@/workspace.functions"

export default function NewProductPage({ page }: { page: PageData<typeof readNewProduct> }) {
  return <ProductEditor {...page} />
}
