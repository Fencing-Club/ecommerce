import { eq } from "drizzle-orm"
import { Plus } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/common"
import { InventorySync } from "@/components/inventory-sync"
import { ProductIndex } from "@/components/supplier/product-index"
import { ProductExportMenu, ProductImportDialog } from "@/components/supplier/product-transfer"
import { Button } from "@/components/ui/button"
import { db } from "@/db"
import { connections } from "@/db/schema"
import { session } from "@/server/auth"
import { productList } from "@/server/supplier-products"

export const metadata: Metadata = { title: "Products" }

export default async function ProductsPage() {
  const s = await session()
  if (s.org.kind === "supplier") {
    return (
      <>
        <PageHeader title="Products">
          <ProductExportMenu />
          <ProductImportDialog />
          <Button nativeButton={false} render={<Link href="/products/new" />}>
            <Plus data-icon="inline-start" />
            Add product
          </Button>
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
  return (
    <>
      <PageHeader title="Products" />
      <InventorySync providers={linked.map((row) => row.provider)} />
    </>
  )
}
