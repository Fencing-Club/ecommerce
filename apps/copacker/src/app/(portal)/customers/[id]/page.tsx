import { notFound, redirect } from "next/navigation"
import { CustomerPageView } from "@/components/customer-page"
import { requirePage, session, titleFor } from "@/server/auth"
import { withRequest } from "@/server/next-request"
import { customerPageData } from "@/server/workspace-pages"

export const generateMetadata = titleFor("supplier.pages.customer", "customers")
export default withRequest(async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await session()
  if (s.org.kind !== "supplier") {
    redirect("/")
  }
  requirePage(s, "customers")
  const data = await customerPageData(s, (await params).id)
  if (!data) {
    notFound()
  }
  return <CustomerPageView {...data} />
})
