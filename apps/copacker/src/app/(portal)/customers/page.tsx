import { redirect } from "next/navigation"
import { CustomersPageView } from "@/components/customers-page"
import { requirePage, session, titleFor } from "@/server/auth"
import { customersPageData } from "@/server/workspace-pages"

export const generateMetadata = titleFor("supplier.pages.customers", "customers")

export default async function CustomersPage() {
  const s = await session()
  if (s.org.kind !== "supplier") {
    redirect("/")
  }
  requirePage(s, "customers")

  return <CustomersPageView {...await customersPageData(s)} />
}
