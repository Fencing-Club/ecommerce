import { CustomerPageView } from "@/components/customer-page"
import type { readCustomer } from "@/workspace.functions"

type Data = Extract<Awaited<ReturnType<typeof readCustomer>>, { forbidden: false }>["page"]
export default function CustomerPage({ page }: { page: Data["data"] }) {
  return <CustomerPageView {...page} />
}
