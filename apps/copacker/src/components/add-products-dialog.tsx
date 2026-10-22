import { useDebouncedValue, useSelection } from "@mantine/hooks"
import { skipToken } from "@reduxjs/toolkit/query"
import { Search } from "lucide-react"
import { useId, useState } from "react"
import { useTranslations } from "use-intl"
import { FormError } from "@/components/form-feedback"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { useErrorMessage } from "@/hooks/use-error-text"
import { type CatalogProduct, type ListedVariant, useInventoryProductsQuery, useLazyCatalogQuery } from "@/lib/api"

// Where stock counts toward a destination: Amazon's pools for Amazon, a Shopify location for the buyer's own address.
export type StockAt = { locationIds: string[] | null; label: string }

// Searches the store's products and adds the chosen variations to a PO, showing each one's stock where the PO ships
// and in total, like Shopify's purchase order product picker. The search waits for a pause in typing, and each opening
// asks again.
export function AddProductsDialog({
  added,
  stockAt,
  onAdd,
  title,
  description,
  addLabel
}: {
  // Variations already on the PO.
  added: ReadonlySet<string>
  stockAt: StockAt
  onAdd: (variants: CatalogProduct[]) => void
  title?: string
  description?: string
  addLabel?: string
}) {
  const t = useTranslations("orders.addProducts")
  const errorMessage = useErrorMessage()
  // Each checkbox is named by the text beside it, a variation's with its product's: "Waffle towel Sand". The wrapping
  // label would otherwise name it with everything in the row.
  const id = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [q] = useDebouncedValue(query.trim(), 250)
  const search = useInventoryProductsQuery(open ? { pageSize: 50, q } : skipToken, {
    refetchOnMountOrArgChange: true
  })
  // The last results stay while the next search loads.
  const products = search.data?.products ?? []
  const [loadCatalog, { isFetching: adding }] = useLazyCatalogQuery()
  const [addFailure, setAddFailure] = useState<unknown>(null)

  const atDestination = (variant: ListedVariant) =>
    stockAt.locationIds === null
      ? null
      : variant.levels
          .filter((level) => stockAt.locationIds?.includes(level.locationId))
          .reduce((sum, level) => sum + (level.available ?? 0), 0)

  // Each product's variations that aren't on the PO yet.
  const choosable = new Map(
    products.map((product) => [product.productId, product.variants.filter((v) => !added.has(v.variantId))])
  )
  const [selection, selecting] = useSelection({
    data: [...choosable.values()].flat().map((variant) => variant.variantId)
  })
  const selected = new Set(selection)
  function toggle(ids: string[], on: boolean) {
    for (const variantId of ids) {
      if (on) {
        selecting.select(variantId)
      } else {
        selecting.deselect(variantId)
      }
    }
  }

  async function add() {
    setAddFailure(null)
    try {
      onAdd(await loadCatalog(selection).unwrap())
      selecting.resetSelection()
      setOpen(false)
    } catch (failure) {
      setAddFailure(failure)
    }
  }

  let failure: string | undefined
  if (addFailure) {
    failure = errorMessage(addFailure, t("addFailed"))
  } else if (search.error) {
    failure = errorMessage(search.error, t("loadFailed"))
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        setAddFailure(null)
        if (!next) {
          selecting.resetSelection()
        }
      }}
    >
      <DialogTrigger
        render={
          <button
            type="button"
            aria-label={title ?? t("trigger")}
            className="focus-ring flex h-8 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-start text-sm text-muted-foreground transition-colors hover:bg-muted/50 focus-visible:border-ring dark:bg-input/30"
          />
        }
      >
        <Search className="size-4" />
        {title ?? t("trigger")}
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title ?? t("title")}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <InputGroup>
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            aria-label={t("search")}
            placeholder={t("search")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </InputGroup>
        <div className="-mx-4 min-h-64 flex-1 overflow-y-auto border-t">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-start font-medium">{t("product")}</th>
                <th className="w-32 px-4 py-2 text-end font-medium">{stockAt.label}</th>
                <th className="w-24 px-4 py-2 text-end font-medium">{t("available")}</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const open = choosable.get(product.productId) ?? []
                const allOn = open.length > 0 && open.every((variant) => selected.has(variant.variantId))
                // A product with one untitled variation is chosen on its own row.
                const only = product.variants.length === 1 ? product.variants[0] : undefined
                const single = only && !only.title ? only : undefined
                const titleId = `${id}-${product.productId}`
                return [
                  <tr key={product.productId} className="border-t">
                    <td className="px-4 py-2" colSpan={single ? 1 : 3}>
                      <label className="flex items-center gap-3">
                        <Checkbox
                          checked={allOn}
                          disabled={!open.length}
                          onCheckedChange={(on) =>
                            toggle(
                              open.map((variant) => variant.variantId),
                              on
                            )
                          }
                          aria-labelledby={titleId}
                        />
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt=""
                            className="hidden size-9 rounded border object-contain sm:block"
                          />
                        ) : (
                          <span className="hidden size-9 rounded border bg-muted sm:block" />
                        )}
                        <span id={titleId} className="font-medium">
                          {product.title}
                        </span>
                        {single && added.has(single.variantId) && (
                          <span className="text-xs text-muted-foreground">{t("alreadyAdded")}</span>
                        )}
                      </label>
                    </td>
                    {single && <Stock variant={single} at={atDestination(single)} />}
                  </tr>,
                  ...(single
                    ? []
                    : product.variants.map((variant) => {
                        const already = added.has(variant.variantId)
                        return (
                          <tr key={variant.variantId} className={already ? "text-muted-foreground" : undefined}>
                            <td className="py-1.5 pe-4 ps-12">
                              <label className="flex items-center gap-3">
                                <Checkbox
                                  checked={already || selected.has(variant.variantId)}
                                  disabled={already}
                                  onCheckedChange={(on) => toggle([variant.variantId], on)}
                                  aria-labelledby={`${titleId} ${id}-${variant.variantId}`}
                                />
                                <span>
                                  <span id={`${id}-${variant.variantId}`}>{variant.title}</span>
                                  {already && <span className="block text-xs">{t("alreadyAdded")}</span>}
                                </span>
                              </label>
                            </td>
                            <Stock variant={variant} at={atDestination(variant)} />
                          </tr>
                        )
                      }))
                ]
              })}
            </tbody>
          </table>
          {!search.isFetching && !products.length && !search.error && (
            <p className="p-8 text-center text-sm text-muted-foreground">{t("noMatches")}</p>
          )}
          {search.isFetching && !products.length && (
            <p className="p-8 text-center text-sm text-muted-foreground">{t("loading")}</p>
          )}
        </div>
        <DialogFooter className="mt-0 sm:items-center sm:justify-between">
          <span className="text-muted-foreground">{t("selected", { count: selection.length })}</span>
          <FormError message={failure} />
          <div className="flex justify-end gap-2">
            <DialogClose render={<Button type="button" variant="outline" />}>{t("cancel")}</DialogClose>
            <Button type="button" disabled={!selection.length || adding} onClick={() => void add()}>
              {adding ? t("adding") : (addLabel ?? t("add"))}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Stock({ variant, at }: { variant: { available: number | null }; at: number | null }) {
  return (
    <>
      <td className="px-4 py-1.5 text-end tabular-nums">{at ?? "—"}</td>
      <td className="px-4 py-1.5 text-end tabular-nums">{variant.available ?? "—"}</td>
    </>
  )
}
