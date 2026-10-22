import { CustomerPageView } from "@/components/customer-page"
import type { PageData } from "@/server/page-result"
import type { readCustomer } from "@/workspace.functions"

export default function CustomerPage({ page }: { page: PageData<typeof readCustomer> }) {
  return <CustomerPageView {...page} />
}
