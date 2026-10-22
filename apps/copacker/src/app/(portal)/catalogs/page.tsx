import { CatalogsPageView } from "@/components/catalogs-page"
import type { PageData } from "@/server/page-result"
import type { readCatalogs } from "@/workspace.functions"

export default function CatalogsPage({ page }: { page: PageData<typeof readCatalogs> }) {
  return <CatalogsPageView {...page} />
}
