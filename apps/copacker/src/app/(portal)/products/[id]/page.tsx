import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { z } from "zod"
import { type EditorProduct, ProductEditor } from "@/components/supplier/product-editor"
import { session } from "@/server/auth"
import { productDetail } from "@/server/supplier-products"

export const metadata: Metadata = { title: "Product" }

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await session()
  if (s.org.kind !== "supplier") {
    redirect("/products")
  }
  const id = z.uuid().safeParse((await params).id)
  const detail = id.success ? await productDetail(s.org.id, id.data) : null
  if (!detail) {
    notFound()
  }
  const { group } = detail
  const initial: EditorProduct = {
    id: group.id,
    revision: group.revision,
    title: group.title,
    status: detail.status,
    category: group.category ?? "",
    productCode: group.productCode ?? "",
    url: group.url ?? "",
    description: group.description ?? "",
    optionNames: group.optionNames,
    images: group.images,
    variants: detail.variants.map((variant) => ({
      key: variant.id,
      id: variant.id,
      supplierSku: variant.supplierSku,
      options: variant.options,
      currency: variant.currency as EditorProduct["variants"][number]["currency"],
      priceMinor: variant.priceMinor,
      priceBasis: variant.priceBasis,
      piecesPerSellablePack: variant.piecesPerSellablePack,
      sellablePacksPerCase: variant.sellablePacksPerCase,
      trackInventory: variant.trackInventory,
      onHand: variant.onHand,
      continueSelling: variant.continueSelling,
      priceBreaks: variant.priceBreaks,
      quantityRules: variant.quantityRules,
      notes: variant.notes ?? ""
    }))
  }
  // A new revision remounts the form with what was saved.
  return <ProductEditor key={group.revision} initial={initial} catalogs={detail.catalogs} />
}
