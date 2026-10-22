import { CatalogEditor } from "@/components/supplier/catalog-editor"
import type { PageData } from "@/server/page-result"
import type { readCatalog } from "@/workspace.functions"

export default function CatalogPage({ page }: { page: PageData<typeof readCatalog> }) {
  return <CatalogEditor key={`${page.data.catalog?.id}:${page.data.catalog?.revision}`} {...page} />
}
