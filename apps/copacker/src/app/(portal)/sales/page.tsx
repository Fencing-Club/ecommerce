import { SalesPageView } from "@/components/sales-page"
import type { SalesSearch } from "@/lib/page-search"

// The sales list loads its orders itself; the URL's ?q= starts it searched.
export default function SalesPage({ search }: { search: SalesSearch }) {
  return <SalesPageView search={search.q ?? ""} />
}
