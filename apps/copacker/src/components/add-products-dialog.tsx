"use client"

import { Search } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { type CatalogProduct, errorMessage } from "@/lib/api"
import { FormError } from "./actions"

type Level = { locationId: string; available: number | null }
type Variant = {
  variantId: string
  title: string | null
  sku: string | null
  available: number | null
  levels: Level[]
}
type Product = { productId: string; title: string; imageUrl: string | null; variants: Variant[] }

// Where stock counts toward a destination: Amazon's pools for Amazon, a Shopify location for the buyer's own address.
export type StockAt = { locationIds: string[] | null; label: string }

// Searches the store's products and adds the chosen variations to a PO, showing each one's stock where the PO ships
// and in total, like Shopify's purchase order product picker.
export function AddProductsDialog({
  added,
  stockAt,
  onAdd
}: {
  // Variations already on the PO.
  added: ReadonlySet<string>
  stockAt: StockAt
  onAdd: (variants: CatalogProduct[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) {
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setLoading(true)
      setError("")
      const params = new URLSearchParams({ pageSize: "50", ...(query.trim() && { q: query.trim() }) })
      fetch(`/api/inventory/products?${params}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("Couldn’t load your products. Try again.")
          }
          const data = (await response.json()) as { products: Product[] }
          setProducts(data.products)
        })
        .catch((failure: unknown) => {
          if (!controller.signal.aborted) {
            setError(errorMessage(failure, "Couldn’t load your products. Try again."))
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setLoading(false)
          }
        })
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [open, query])

  const atDestination = (variant: Variant) =>
    stockAt.locationIds === null
      ? null
      : variant.levels
          .filter((level) => stockAt.locationIds?.includes(level.locationId))
          .reduce((sum, level) => sum + (level.available ?? 0), 0)

  const choosable = useMemo(
    () =>
      new Map(products.map((product) => [product.productId, product.variants.filter((v) => !added.has(v.variantId))])),
    [products, added]
  )

  function toggle(ids: string[], on: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      for (const id of ids) {
        if (on) {
          next.add(id)
        } else {
          next.delete(id)
        }
      }
      return next
    })
  }

  async function add() {
    setAdding(true)
    setError("")
    try {
      const response = await fetch(`/api/catalog?${new URLSearchParams({ ids: [...selected].join(",") })}`)
      if (!response.ok) {
        throw new Error("Couldn’t add those products. Try again.")
      }
      onAdd((await response.json()) as CatalogProduct[])
      setSelected(new Set())
      setOpen(false)
    } catch (failure) {
      setError(errorMessage(failure, "Couldn’t add those products. Try again."))
    } finally {
      setAdding(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setSelected(new Set())
        }
      }}
    >
      <DialogTrigger
        render={
          <button
            type="button"
            aria-label="Search products to add"
            className="flex h-8 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-left text-sm text-muted-foreground transition-colors outline-none hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          />
        }
      >
        <Search className="size-4" />
        Search products to add
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add products</DialogTitle>
        </DialogHeader>
        <InputGroup>
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Search products"
            placeholder="Search products"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </InputGroup>
        <div className="-mx-4 min-h-64 flex-1 overflow-y-auto border-t">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Product</th>
                <th className="w-32 px-4 py-2 text-right font-medium">{stockAt.label}</th>
                <th className="w-24 px-4 py-2 text-right font-medium">Available</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const open = choosable.get(product.productId) ?? []
                const allOn = open.length > 0 && open.every((variant) => selected.has(variant.variantId))
                const single = product.variants.length === 1 && !product.variants[0]!.title
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
                          aria-label={`Select all of ${product.title}`}
                        />
                        {product.imageUrl ? (
                          <img src={product.imageUrl} alt="" className="size-9 rounded border object-contain" />
                        ) : (
                          <span className="size-9 rounded border bg-muted" />
                        )}
                        <span className="font-medium">{product.title}</span>
                        {single && added.has(product.variants[0]!.variantId) && (
                          <span className="text-xs text-muted-foreground">Already on the PO</span>
                        )}
                      </label>
                    </td>
                    {single && <Stock variant={product.variants[0]!} at={atDestination(product.variants[0]!)} />}
                  </tr>,
                  ...(single
                    ? []
                    : product.variants.map((variant) => {
                        const already = added.has(variant.variantId)
                        return (
                          <tr key={variant.variantId} className={already ? "text-muted-foreground" : undefined}>
                            <td className="py-1.5 pr-4 pl-12">
                              <label className="flex items-center gap-3">
                                <Checkbox
                                  checked={already || selected.has(variant.variantId)}
                                  disabled={already}
                                  onCheckedChange={(on) => toggle([variant.variantId], on)}
                                  aria-label={`Select ${product.title} ${variant.title ?? ""}`}
                                />
                                <span>
                                  {variant.title}
                                  {already && <span className="block text-xs">Already on the PO</span>}
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
          {!loading && !products.length && !error && (
            <p className="p-8 text-center text-sm text-muted-foreground">No products match.</p>
          )}
          {loading && !products.length && <p className="p-8 text-center text-sm text-muted-foreground">Loading…</p>}
        </div>
        <DialogFooter className="mt-0 sm:items-center sm:justify-between">
          <span className="text-muted-foreground">
            {selected.size} {selected.size === 1 ? "variant" : "variants"} selected
          </span>
          <FormError message={error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={!selected.size || adding} onClick={() => void add()}>
              {adding ? "Adding…" : "Add to purchase order"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Stock({ variant, at }: { variant: Variant; at: number | null }) {
  return (
    <>
      <td className="px-4 py-1.5 text-right tabular-nums">{at ?? "–"}</td>
      <td className="px-4 py-1.5 text-right tabular-nums">{variant.available ?? "–"}</td>
    </>
  )
}
