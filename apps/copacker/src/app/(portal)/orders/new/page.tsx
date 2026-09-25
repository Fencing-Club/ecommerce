import { eq } from "drizzle-orm"
import { PageBreadcrumb, PageHeader } from "@/components/common"
import { OrderBuilder } from "@/components/order-builder"
import { db } from "@/db"
import { suppliers } from "@/db/schema"
import { requireBuyer, session } from "@/server/auth"

export default async function NewOrder() {
  const s = await session()
  requireBuyer(s)
  const rows = await db().select().from(suppliers).where(eq(suppliers.buyerOrgId, s.org.id))

  return (
    <>
      <PageBreadcrumb parents={[{ label: "Purchase orders", href: "/orders" }]} current="New purchase order" />
      <PageHeader
        title="Create purchase order"
        description="Choose products, set quantities, and give your supplier a clear starting point."
      />
      <OrderBuilder suppliers={rows.map((r) => ({ id: r.id, name: r.name }))} />
    </>
  )
}
