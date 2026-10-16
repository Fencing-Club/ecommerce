import { CatalogEditor } from "@/components/supplier/catalog-editor"
import type { readCatalog } from "@/workspace.functions"

type Data = Extract<Awaited<ReturnType<typeof readCatalog>>, { forbidden: false }>["page"]
export default function CatalogPage({ page }: { page: Data["data"] }) {
  return <CatalogEditor {...page} />
}
