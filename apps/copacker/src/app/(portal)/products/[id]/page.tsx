import { notFound, redirect } from "next/navigation"
import { ProductEditor } from "@/components/supplier/product-editor"
import { requirePage, session, titleFor } from "@/server/auth"
import { withRequest } from "@/server/next-request"
import { productPageData } from "@/server/workspace-pages"

export const generateMetadata = titleFor("products.page.product", "products")
export default withRequest(async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await session()
  if (s.org.kind !== "supplier") {
    redirect("/products")
  }
  requirePage(s, "products")
  const data = await productPageData(s, (await params).id)
  if (!data) {
    notFound()
  }
  return <ProductEditor key={data.initial.revision} {...data} />
})
