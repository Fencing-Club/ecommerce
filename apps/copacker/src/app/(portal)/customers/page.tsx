import { CustomersPageView } from "@/components/customers-page"
import type { readCustomers } from "@/workspace.functions"

type Data = Extract<Awaited<ReturnType<typeof readCustomers>>, { forbidden: false }>["page"]
export default function CustomersPage({ page }: { page: Data["data"] }) {
  return <CustomersPageView {...page} />
}
