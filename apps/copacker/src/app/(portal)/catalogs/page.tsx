import { CatalogsPageView } from "@/components/catalogs-page"
import type { readCatalogs } from "@/workspace.functions"

type Data = Extract<Awaited<ReturnType<typeof readCatalogs>>, { forbidden: false }>["page"]
export default function CatalogsPage({ page }: { page: Data["data"] }) {
  return <CatalogsPageView {...page} />
}
