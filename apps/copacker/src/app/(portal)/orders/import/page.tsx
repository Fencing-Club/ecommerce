import type { Metadata } from "next"
import { PageHeader } from "@/components/common"
import { ImportIntake } from "@/components/import-intake"
import { requireBuyer, requirePage, session } from "@/server/auth"

export const metadata: Metadata = { title: "Import purchase order" }

export default async function ImportOrder() {
  const s = await session()
  requireBuyer(s)
  requirePage(s, "orders", "edit")
  return (
    <>
      <PageHeader parents={[{ label: "Purchase orders", href: "/orders" }]} title="Import purchase order" />
      <ImportIntake />
    </>
  )
}
