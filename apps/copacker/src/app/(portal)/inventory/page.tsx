import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/common"
import { InventoryTable } from "@/components/supplier/inventory"
import { requirePage, session } from "@/server/auth"
import { inventoryRows } from "@/server/supplier-workspace"

export const metadata: Metadata = { title: "Inventory" }

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const s = await session()
  if (s.org.kind !== "supplier") {
    redirect("/products")
  }
  requirePage(s, "inventory")
  const [rows, { tab }] = await Promise.all([inventoryRows(s.org.id), searchParams])
  return (
    <>
      <PageHeader title="Inventory" />
      <InventoryTable rows={rows} initialTab={tab} />
    </>
  )
}
