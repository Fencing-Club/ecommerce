import { ProductEditor } from "@/components/supplier/product-editor"
import type { readProduct } from "@/workspace.functions"

type Data = Extract<Awaited<ReturnType<typeof readProduct>>, { forbidden: false }>["page"]
export default function ProductPage({ page }: { page: Data["data"] }) {
  return <ProductEditor key={`${page.initial.id}:${page.initial.revision}`} {...page} />
}
