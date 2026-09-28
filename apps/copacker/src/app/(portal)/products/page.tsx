import { eq } from "drizzle-orm"
import { Plus } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/common"
import { InventorySync } from "@/components/inventory-sync"
import { ProductIndex } from "@/components/supplier/product-index"
import { ProductActions } from "@/components/supplier/product-transfer"
import { Button } from "@/components/ui/button"
import { db } from "@/db"
import { connections } from "@/db/schema"
import { can } from "@/lib/access"
import { requirePage, session } from "@/server/auth"
import { productList } from "@/server/supplier-products"

export const metadata: Metadata = { title: "Products" }

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const s = await session()
  requirePage(s, "products")
  if (s.org.kind === "supplier") {
    return (
      <>
        <PageHeader title="Products">
          <ProductActions />
          {can(s, "products", "edit") && (
            <Button nativeButton={false} render={<Link href="/products/new" />}>
              <Plus data-icon="inline-start" />
              Add product
            </Button>
          )}
        </PageHeader>
        <ProductIndex products={await productList(s.org.id)} />
      </>
    )
  }
  if (s.org.kind !== "buyer") {
    redirect("/orders")
  }
  const linked = await db()
    .select({ provider: connections.provider })
    .from(connections)
    .where(eq(connections.orgId, s.org.id))
  // A search to open the list with, such as a product chosen in the header's search.
  const { q } = await searchParams
  const search = typeof q === "string" ? q.trim().slice(0, 200) : ""
  return (
    <>
      <PageHeader title="Products" />
      <InventorySync providers={linked.map((row) => row.provider)} search={search} />
    </>
  )
}
