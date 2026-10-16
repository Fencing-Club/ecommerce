import { InventoryPageView } from "@/components/inventory-page"
import type { readInventory } from "@/workspace.functions"

type Data = Extract<Awaited<ReturnType<typeof readInventory>>, { forbidden: false }>["page"]
export default function InventoryPage({ page }: { page: Data["data"] }) {
  return <InventoryPageView {...page} />
}
