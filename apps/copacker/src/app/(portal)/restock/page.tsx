import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/common"
import { RestockReport } from "@/components/restock-report"
import { requirePage, session } from "@/server/auth"
import { restockSettings } from "@/server/restock-report"

export const metadata: Metadata = { title: "Restock" }

export default async function RestockPage() {
  const s = await session()
  if (s.org.kind !== "buyer") {
    redirect("/orders")
  }
  requirePage(s, "restock")
  return (
    <>
      <PageHeader title="Restock" />
      <RestockReport settings={restockSettings(s.org)} />
    </>
  )
}
