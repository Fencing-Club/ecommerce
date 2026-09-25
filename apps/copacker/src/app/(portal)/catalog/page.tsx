import { asc, desc, eq } from "drizzle-orm"
import { PageHeader } from "@/components/common"
import { SupplierCatalogManager } from "@/components/supplier-catalog-manager"
import { db } from "@/db"
import { supplierProducts } from "@/db/schema"
import { session } from "@/server/auth"

export default async function CatalogPage() {
  const s = await session()
  if (s.org.kind !== "supplier") {
    return <PageHeader title="Supplier catalog" description="Switch to a supplier workspace to manage its products." />
  }
  const rows = await db()
    .select()
    .from(supplierProducts)
    .where(eq(supplierProducts.supplierOrgId, s.org.id))
    .orderBy(desc(supplierProducts.active), asc(supplierProducts.supplierSku))
  return (
    <>
      <PageHeader
        title="Supplier catalog"
        description="Upload a price list or maintain individual products. Buyers match products by your exact supplier SKU."
      />
      <SupplierCatalogManager products={rows.map((row) => ({ ...row, active: row.active === 1 }))} />
    </>
  )
}
