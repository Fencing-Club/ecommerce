import { redirect } from "next/navigation"
import { RestockPageView } from "@/components/restock-page"
import { requirePage, session, titleFor } from "@/server/auth"
import { restockPageData } from "@/server/workspace-pages"

export const generateMetadata = titleFor("restock.title", "restock")

export default async function RestockPage() {
  const s = await session()
  if (s.org.kind !== "buyer") {
    redirect("/orders")
  }
  requirePage(s, "restock")

  return <RestockPageView {...restockPageData(s)} />
}
