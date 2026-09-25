import { PageBreadcrumb, PageHeader } from "@/components/common"
import { ImportIntake } from "@/components/import-intake"
import { requireBuyer, session } from "@/server/auth"

export default async function ImportOrder() {
  requireBuyer(await session())
  return (
    <>
      <PageBreadcrumb parents={[{ label: "Purchase orders", href: "/orders" }]} current="Import document" />
      <PageHeader title="Import document" description="Start a purchase order from a supplier document." />
      <ImportIntake />
    </>
  )
}
