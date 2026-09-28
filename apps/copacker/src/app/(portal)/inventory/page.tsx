import { getTranslations } from "next-intl/server"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/common"
import { InventoryTable } from "@/components/supplier/inventory"
import { requirePage, session, titleFor } from "@/server/auth"
import { inventoryRows } from "@/server/supplier-workspace"

export const generateMetadata = titleFor("inventory.page.title", "inventory")

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const s = await session()
  if (s.org.kind !== "supplier") {
    redirect("/products")
  }
  requirePage(s, "inventory")
  const [rows, { tab }, t] = await Promise.all([
    inventoryRows(s.org.id),
    searchParams,
    getTranslations("inventory.page")
  ])
  return (
    <>
      <PageHeader title={t("title")} />
      <InventoryTable rows={rows} initialTab={tab} />
    </>
  )
}
