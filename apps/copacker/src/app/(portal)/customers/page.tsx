import { redirect } from "next/navigation"
import { CustomersPageView } from "@/components/customers-page"
import { requirePage, session, titleFor } from "@/server/auth"
import { withRequest } from "@/server/next-request"
import { customersPageData } from "@/server/workspace-pages"

export const generateMetadata = titleFor("supplier.pages.customers", "customers")

export default withRequest(async function CustomersPage() {
  const s = await session()
  if (s.org.kind !== "supplier") {
    redirect("/")
  }
  requirePage(s, "customers")

  return <CustomersPageView {...await customersPageData(s)} />
})
