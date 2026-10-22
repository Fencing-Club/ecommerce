import type { OverviewSearch } from "@/lib/page-search"
import type { PageData } from "@/server/page-result"
import type { readOverview } from "@/workspace.functions"
import { OverviewContent } from "./content"

export default function OverviewPage({
  page,
  search
}: {
  page: PageData<typeof readOverview>
  search: OverviewSearch
}) {
  return <OverviewContent page={page} search={search} />
}
