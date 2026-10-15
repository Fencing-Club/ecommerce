import { redirect } from "next/navigation"
import { SalesPageView } from "@/components/sales-page"
import { requirePage, session, titleFor } from "@/server/auth"
import { salesPageData } from "@/server/workspace-pages"

export const generateMetadata = titleFor("sales.title", "sales")

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const s = await session()
  if (s.org.kind !== "buyer") {
    redirect("/orders")
  }
  requirePage(s, "sales")

  return <SalesPageView {...salesPageData(s, (await searchParams).q)} />
}
