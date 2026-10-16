"use client"

import { useRouter } from "next/navigation"
import { ProductsPageView } from "@/components/products-page"

export function ProductsContent({ page }: Pick<React.ComponentProps<typeof ProductsPageView>, "page">) {
  const router = useRouter()
  return <ProductsPageView page={page} refresh={router.refresh} />
}
