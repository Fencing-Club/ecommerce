import { notFound, redirect } from "next/navigation"
import { z } from "zod"
import { CatalogEditor } from "@/components/supplier/catalog-editor"
import { can } from "@/lib/access"
import { requirePage, session, titleFor } from "@/server/auth"
import { catalogEditor } from "@/server/catalogs"

export const generateMetadata = titleFor("supplier.pages.catalog", "catalogs")

export default async function CatalogPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await session()
  if (s.org.kind !== "supplier") {
    redirect("/")
  }
  requirePage(s, "catalogs")
  const id = z.uuid().safeParse((await params).id)
  const data = id.success ? await catalogEditor(s.org.id, id.data) : null
  if (!data?.catalog) {
    notFound()
  }
  // A new revision remounts the form with what was saved.
  return <CatalogEditor key={data.catalog.revision} data={data} readOnly={!can(s, "catalogs", "edit")} />
}
