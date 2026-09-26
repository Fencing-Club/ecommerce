import { redirect } from "next/navigation"
import { PageHeader } from "@/components/common"
import { SalesOrders } from "@/components/sales-orders"
import { session } from "@/server/auth"

export default async function SalesPage() {
  const s = await session()
  if (s.org.kind !== "buyer") {
    redirect("/orders")
  }
  return (
    <>
      <PageHeader
        title="Orders"
        description="Customer orders copied from Shopify and Amazon. Restock suggestions use these orders."
      />
      <SalesOrders />
    </>
  )
}
