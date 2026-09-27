import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/common"
import { RestockReport } from "@/components/restock-report"
import { session } from "@/server/auth"

export const metadata: Metadata = { title: "Restock" }

export default async function RestockPage() {
  const s = await session()
  if (s.org.kind !== "buyer") {
    redirect("/orders")
  }
  return (
    <>
      <PageHeader
        title="Restock"
        description="Suggested reorders from recent sales, your stock and what's already on order."
      />
      <RestockReport />
    </>
  )
}
