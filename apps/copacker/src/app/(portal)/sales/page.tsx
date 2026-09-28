import { redirect } from "next/navigation"
import { PageHeader } from "@/components/common"
import { SalesOrders } from "@/components/sales-orders"
import { requirePage, session, titleFor } from "@/server/auth"

export const generateMetadata = titleFor("Orders", "sales")

// `?q=` starts the list filtered, such as a header search for an order number. The orders API takes up to 100
// characters.
export default async function SalesPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const s = await session()
  const raw = (await searchParams).q
  const q = (typeof raw === "string" ? raw : "").trim().slice(0, 100)
  if (s.org.kind !== "buyer") {
    redirect("/orders")
  }
  requirePage(s, "sales")
  return (
    <>
      <PageHeader title="Orders" />
      <SalesOrders initialSearch={q} />
    </>
  )
}
