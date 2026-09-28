import { PageHeader } from "@/components/common"
import { ImportIntake } from "@/components/import-intake"
import { requireBuyer, requirePage, session, titleFor } from "@/server/auth"

export const generateMetadata = titleFor("Import purchase order", "orders", "edit")

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
