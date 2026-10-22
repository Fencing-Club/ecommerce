import { ProductEditor } from "@/components/supplier/product-editor"
import type { PageData } from "@/server/page-result"
import type { readProduct } from "@/workspace.functions"

export default function ProductPage({ page }: { page: PageData<typeof readProduct> }) {
  return <ProductEditor key={`${page.initial.id}:${page.initial.revision}`} {...page} />
}
