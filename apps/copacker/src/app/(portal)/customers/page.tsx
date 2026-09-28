import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/common"
import { CustomerIndex } from "@/components/supplier/customers"
import { session } from "@/server/auth"
import { customerList } from "@/server/supplier-workspace"

export const metadata: Metadata = { title: "Customers" }

export default async function CustomersPage() {
  const s = await session()
  if (s.org.kind !== "supplier") {
    redirect("/")
  }
  const { customers, catalogs } = await customerList(s.org.id)
  return (
    <>
      <PageHeader title="Customers" />
      <CustomerIndex customers={customers} catalogs={catalogs} />
    </>
  )
}
