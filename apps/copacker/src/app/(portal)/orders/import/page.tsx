import type { Metadata } from "next"
import { PageBreadcrumb, PageHeader } from "@/components/common"
import { ImportIntake } from "@/components/import-intake"
import { requireBuyer, session } from "@/server/auth"

export const metadata: Metadata = { title: "Import purchase order" }

export default async function ImportOrder() {
  requireBuyer(await session())
  return (
    <>
      <PageBreadcrumb parents={[{ label: "Purchase orders", href: "/orders" }]} current="Import" />
      <PageHeader title="Import purchase order" />
      <ImportIntake />
    </>
  )
}
