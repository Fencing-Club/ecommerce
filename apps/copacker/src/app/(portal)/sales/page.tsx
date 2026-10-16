import { SalesPageView } from "@/components/sales-page"
import type { readSales } from "@/workspace.functions"

type Data = Extract<Awaited<ReturnType<typeof readSales>>, { forbidden: false }>["page"]
export default function SalesPage({ page }: { page: Data["data"] }) {
  return <SalesPageView {...page} />
}
