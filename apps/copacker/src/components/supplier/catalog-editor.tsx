import { useRouter } from "@tanstack/react-router"
import { Download, Ellipsis, Trash2 } from "lucide-react"
import { useState } from "react"
import { useTranslations } from "use-intl"
import { PageHeader, Status } from "@/components/common"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { SaveBar } from "@/components/list/save-bar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { useDraft } from "@/hooks/use-draft"
import { useErrorMessage } from "@/hooks/use-error-text"
import type { CatalogEntry } from "@/lib/catalog-pricing"
import { useDeleteCatalogMutation, useSaveCatalogMutation } from "@/lib/supplier-api"
import type { CatalogEditorData } from "@/server/catalogs"
import { CatalogProducts, emptyEntry } from "./catalog-products"
import { basisPoints, CatalogSettings, initialSettings } from "./catalog-settings"

// A catalog's form, laid out like Shopify's: its title, status and customers; its pricing; and its products, where
// each variant can have a fixed price, volume pricing and quantity rules of its own.
export function CatalogEditor({
  data,
  readOnly = false
}: {
  data: CatalogEditorData
  // For someone who can only view catalogs: the catalog shows as it's saved, with its searching and paging but nothing
  // that changes it.
  readOnly?: boolean
}) {
  const router = useRouter()
  const { catalog, products, customers } = data
  const { draft, saved, change, dirty, reset, markSaved } = useDraft(() => ({
    ...initialSettings(catalog, customers),
    // A new catalog starts with every product, as Shopify's does.
    entries: new Map<string, CatalogEntry>(
      catalog
        ? data.entries.map(({ productId, ...entry }) => [productId, entry] as const)
        : products.flatMap((product) => product.variants.map((variant) => [variant.id, emptyEntry] as const))
    )
  }))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saveCatalog] = useSaveCatalogMutation()
  const [deleteCatalog] = useDeleteCatalogMutation()
  const t = useTranslations("supplier.catalogEditor")
  const shared = useTranslations("supplier.shared")
  const errorMessage = useErrorMessage()
  const bps = basisPoints(draft)

  async function save() {
    if (!draft.title.trim()) {
      setError(t("addTitle"))
      return
    }
    if (bps === null) {
      setError(draft.direction === "decrease" ? t("decreaseRange") : t("increaseRange"))
      return
    }
    setPending(true)
    setError("")
    try {
      const { id } = await saveCatalog({
        ...(catalog && { id: catalog.id, revision: catalog.revision }),
        title: draft.title.trim(),
        status: draft.status,
        adjustmentBasisPoints: bps,
        includeNewProducts: draft.includeNewProducts,
        customerIds: draft.customerIds,
        products: [...draft.entries].map(([productId, entry]) => ({ productId, ...entry }))
      }).unwrap()
      markSaved()
      if (catalog) {
        router.invalidate()
      } else {
        router.navigate({ href: `/catalogs/${id}`, replace: true })
      }
    } catch (caught) {
      setError(errorMessage(caught, t("saveFailed")))
    } finally {
      setPending(false)
    }
  }

  // The header row stands alone beside the sidebar's button; the form and its save bar follow it, so the bar stays in
  // view while any part of the form does.
  return (
    <>
      <PageHeader
        parents={[{ label: t("catalogs"), href: "/catalogs" }]}
        title={catalog ? saved.title : t("newCatalog")}
        badge={catalog ? <Status status={saved.status} /> : undefined}
      >
        {catalog && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label={shared("moreActions")} />}>
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                disabled={dirty}
                render={
                  <a
                    href={`/api/catalogs/${catalog.id}/export?format=xlsx`}
                    download
                    aria-label={shared("exportExcel")}
                  />
                }
              >
                <Download />
                {shared("exportExcel")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={dirty}
                render={
                  <a href={`/api/catalogs/${catalog.id}/export?format=pdf`} download aria-label={t("exportPdf")} />
                }
              >
                <Download />
                {t("exportPdf")}
              </DropdownMenuItem>
              {!readOnly && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
                    <Trash2 />
                    {t("delete")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </PageHeader>
      <div className="flex flex-col gap-4">
        <CatalogSettings settings={draft} onChange={change} customers={customers} readOnly={readOnly} />
        <CatalogProducts
          products={products}
          entries={draft.entries}
          onEntriesChange={(update) => change((current) => ({ entries: update(current.entries) }))}
          adjustment={bps ?? 0}
          includeNewProducts={draft.includeNewProducts}
          onIncludeNewProductsChange={(includeNewProducts) => change({ includeNewProducts })}
          readOnly={readOnly}
        />
        <SaveBar
          dirty={dirty || !catalog}
          pending={pending}
          error={error}
          onDiscard={() => {
            if (!catalog) {
              router.navigate({ href: "/catalogs" })
              return
            }
            reset()
            setError("")
          }}
          onSave={() => void save()}
        />
      </div>

      {catalog && (
        // Deleting stays pending until the catalogs list opens. A failure, even one that never reached the server,
        // closes the dialog and says why beside Save.
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={t("deleteTitle", { title: saved.title })}
          description={t("deleteDescription")}
          confirmLabel={t("delete")}
          tone="destructive"
          action={async () => {
            await deleteCatalog(catalog.id).unwrap()
            markSaved()
            await router.navigate({ href: "/catalogs" })
            void router.invalidate()
          }}
          data={{}}
          fallback={t("deleteFailed")}
          onError={(message) => {
            setError(message)
            setConfirmDelete(false)
          }}
        />
      )}
    </>
  )
}
