import { RestockPageView } from "@/components/restock-page"
import type { RestockSearch } from "@/lib/page-search"
import type { PageData } from "@/server/page-result"
import type { readRestock } from "@/workspace.functions"

export default function RestockPage({ page, search }: { page: PageData<typeof readRestock>; search: RestockSearch }) {
  return <RestockPageView {...page} link={search} />
}
