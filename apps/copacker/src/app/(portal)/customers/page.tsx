import { CustomersPageView } from "@/components/customers-page"
import type { PageData } from "@/server/page-result"
import type { readCustomers } from "@/workspace.functions"

export default function CustomersPage({ page }: { page: PageData<typeof readCustomers> }) {
  return <CustomersPageView {...page} />
}
