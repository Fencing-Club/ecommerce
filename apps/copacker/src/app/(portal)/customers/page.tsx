import { redirect } from "next/navigation"
import { PageHeader } from "@/components/common"
import { CustomerIndex } from "@/components/supplier/customers"
import { can } from "@/lib/access"
import { requirePage, session, titleFor } from "@/server/auth"
import { customerList } from "@/server/supplier-workspace"

export const generateMetadata = titleFor("Customers", "customers")

export default async function CustomersPage() {
  const s = await session()
  if (s.org.kind !== "supplier") {
    redirect("/")
  }
  requirePage(s, "customers")
  const list = await customerList(s.org.id)
  const { catalogs } = list
  // Someone who doesn't see prices gets no amounts spent.
  const customers = can(s, "prices") ? list.customers : list.customers.map((customer) => ({ ...customer, spent: [] }))
  return (
    <>
      <PageHeader title="Customers" />
      <CustomerIndex customers={customers} catalogs={catalogs} />
    </>
  )
}
