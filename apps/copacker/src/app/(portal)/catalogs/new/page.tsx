import { CatalogEditor } from "@/components/supplier/catalog-editor"
import type { readNewCatalog } from "@/workspace.functions"

type Data = Extract<Awaited<ReturnType<typeof readNewCatalog>>, { forbidden: false }>["page"]
export default function NewCatalogPage({ page }: { page: Data["data"] }) {
  return <CatalogEditor {...page} />
}
