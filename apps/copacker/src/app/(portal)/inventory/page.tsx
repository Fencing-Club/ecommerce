import { redirect } from "next/navigation"
import { InventoryPageView } from "@/components/inventory-page"
import { requirePage, session, titleFor } from "@/server/auth"
import { withRequest } from "@/server/next-request"
import { inventoryPageData } from "@/server/workspace-pages"

export const generateMetadata = titleFor("inventory.page.title", "inventory")

export default withRequest(async function InventoryPage({
  searchParams
}: {
  searchParams: Promise<{ tab?: string | string[] }>
}) {
  const s = await session()
  if (s.org.kind !== "supplier") {
    redirect("/products")
  }
  requirePage(s, "inventory")

  return <InventoryPageView {...await inventoryPageData(s, (await searchParams).tab)} />
})
