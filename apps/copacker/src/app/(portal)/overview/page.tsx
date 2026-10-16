import type { readOverview } from "@/workspace.functions"
import { OverviewContent } from "./content"

type Data = Extract<Awaited<ReturnType<typeof readOverview>>, { forbidden: false }>["page"]
export default function OverviewPage({ page, query }: { page: Data["data"]; query: Data["query"] }) {
  return <OverviewContent page={page} query={query} />
}
