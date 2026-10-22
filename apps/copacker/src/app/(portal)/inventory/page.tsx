import { InventoryPageView } from "@/components/inventory-page"
import type { InventorySearch } from "@/lib/page-search"
import type { PageData } from "@/server/page-result"
import type { readInventory } from "@/workspace.functions"

export default function InventoryPage({
  page,
  search
}: {
  page: PageData<typeof readInventory>
  search: InventorySearch
}) {
  return <InventoryPageView {...page} tab={search.tab} />
}
