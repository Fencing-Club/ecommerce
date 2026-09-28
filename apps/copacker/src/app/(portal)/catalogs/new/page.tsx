import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { CatalogEditor } from "@/components/supplier/catalog-editor"
import { requirePage, session } from "@/server/auth"
import { catalogEditor } from "@/server/catalogs"

export const metadata: Metadata = { title: "New catalog" }

export default async function NewCatalogPage() {
  const s = await session()
  if (s.org.kind !== "supplier") {
    redirect("/")
  }
  requirePage(s, "catalogs", "edit")
  return <CatalogEditor data={(await catalogEditor(s.org.id, null))!} />
}
