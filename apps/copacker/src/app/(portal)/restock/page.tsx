import { RestockPageView } from "@/components/restock-page"
import type { readRestock } from "@/workspace.functions"

type Data = Extract<Awaited<ReturnType<typeof readRestock>>, { forbidden: false }>["page"]
export default function RestockPage({ page }: { page: Data["data"] }) {
  return <RestockPageView {...page} />
}
