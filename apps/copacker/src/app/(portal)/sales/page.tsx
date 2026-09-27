import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/common"
import { SalesOrders } from "@/components/sales-orders"
import { session } from "@/server/auth"

export const metadata: Metadata = { title: "Orders" }

export default async function SalesPage() {
  const s = await session()
  if (s.org.kind !== "buyer") {
    redirect("/orders")
  }
  return (
    <>
      <PageHeader title="Orders" />
      <SalesOrders />
    </>
  )
}
