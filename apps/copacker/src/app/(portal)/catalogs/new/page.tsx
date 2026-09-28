import { redirect } from "next/navigation"
import { CatalogEditor } from "@/components/supplier/catalog-editor"
import { requirePage, session, titleFor } from "@/server/auth"
import { catalogEditor } from "@/server/catalogs"

export const generateMetadata = titleFor("supplier.pages.newCatalog", "catalogs", "edit")

export default async function NewCatalogPage() {
  const s = await session()
  if (s.org.kind !== "supplier") {
    redirect("/")
  }
  requirePage(s, "catalogs", "edit")
  return <CatalogEditor data={(await catalogEditor(s.org.id, null))!} />
}
