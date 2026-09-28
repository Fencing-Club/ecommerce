import { getTranslations } from "next-intl/server"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/common"
import { CustomerIndex } from "@/components/supplier/customers"
import { can } from "@/lib/access"
import { requirePage, session, titleFor } from "@/server/auth"
import { customerList } from "@/server/supplier-workspace"

export const generateMetadata = titleFor("supplier.pages.customers", "customers")

export default async function CustomersPage() {
  const s = await session()
  if (s.org.kind !== "supplier") {
    redirect("/")
  }
  requirePage(s, "customers")
  const [list, t] = await Promise.all([customerList(s.org.id), getTranslations("supplier.pages")])
  const { catalogs } = list
  // Someone who doesn't see prices gets no amounts spent.
  const customers = can(s, "prices") ? list.customers : list.customers.map((customer) => ({ ...customer, spent: [] }))
  return (
    <>
      <PageHeader title={t("customers")} />
      <CustomerIndex customers={customers} catalogs={catalogs} />
    </>
  )
}
