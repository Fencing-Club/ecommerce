import { redirect } from "next/navigation"
import { blankProduct, ProductEditor } from "@/components/supplier/product-editor"
import { requirePage, session, titleFor } from "@/server/auth"

export const generateMetadata = titleFor("products.page.addProduct", "products", "edit")

export default async function NewProductPage() {
  const s = await session()
  if (s.org.kind !== "supplier") {
    redirect("/products")
  }
  requirePage(s, "products", "edit")
  return <ProductEditor initial={blankProduct()} />
}
