import { eq } from "drizzle-orm"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/common"
import { InventorySync } from "@/components/inventory-sync"
import { db } from "@/db"
import { connections } from "@/db/schema"
import { session } from "@/server/auth"

export const metadata: Metadata = { title: "Products" }

export default async function ProductsPage() {
  const s = await session()
  if (s.org.kind !== "buyer") {
    redirect("/orders")
  }
  const linked = await db()
    .select({ provider: connections.provider })
    .from(connections)
    .where(eq(connections.orgId, s.org.id))
  return (
    <>
      <PageHeader
        title="Products"
        description="Your products with stock from your connected accounts. Edit a product to set its supplier, case packs and barcodes."
      />
      <InventorySync providers={linked.map((row) => row.provider)} />
    </>
  )
}
