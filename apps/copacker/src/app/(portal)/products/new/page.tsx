import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { blankProduct, ProductEditor } from "@/components/supplier/product-editor"
import { session } from "@/server/auth"

export const metadata: Metadata = { title: "Add product" }

export default async function NewProductPage() {
  const s = await session()
  if (s.org.kind !== "supplier") {
    redirect("/products")
  }
  return <ProductEditor initial={blankProduct()} />
}
