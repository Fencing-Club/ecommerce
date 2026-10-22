import { CatalogEditor } from "@/components/supplier/catalog-editor"
import type { PageData } from "@/server/page-result"
import type { readNewCatalog } from "@/workspace.functions"

export default function NewCatalogPage({ page }: { page: PageData<typeof readNewCatalog> }) {
  return <CatalogEditor {...page} />
}
