"use client"

import { useState } from "react"
import { useTranslations } from "use-intl"
import { PageLink, useCan } from "@/components/access"
import { IssuePanel } from "@/components/inventory-products"
import { ProductImage } from "@/components/product-details"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useErrorMessage } from "@/hooks/use-error-text"
import { api, useSuppliersQuery } from "@/lib/api"
import type { ProductWithoutSupplier } from "@/server/product-suppliers"

const productSuppliersApi = api.injectEndpoints({
  overrideExisting: true,
  endpoints: (build) => ({
    productsWithoutSupplier: build.query<ProductWithoutSupplier[], string>({
      query: () => "products/without-supplier",
      providesTags: ["ProductSupplier"]
    }),
    assignSupplier: build.mutation<{ updated: number }, { productIds: string[]; supplierId: string }>({
      query: (body) => ({ url: "restock/assign-supplier", method: "POST", body }),
      invalidatesTags: ["ProductSupplier", "Restock"]
    })
  })
})

function partnersLink(chunks: React.ReactNode) {
  return (
    <PageLink href="/partners" className="text-foreground underline underline-offset-4">
      {chunks}
    </PageLink>
  )
}

// Restock only suggests products with a known supplier, so this lists the ones without, and sets their supplier in
// bulk. `syncKey` reloads the list after a stock sync brings in new products.
export function ProductsWithoutSupplier({ syncKey }: { syncKey: string }) {
  const t = useTranslations("products.withoutSupplier")
  const errorMessage = useErrorMessage()
  const { currentData: products = [] } = productSuppliersApi.useProductsWithoutSupplierQuery(syncKey)
  const { data: suppliers = [] } = useSuppliersQuery()
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set())
  const [supplierId, setSupplierId] = useState("")
  const [assign, result] = productSuppliersApi.useAssignSupplierMutation()
  // Assigning suppliers changes products, so the panel is for those who can.
  const editable = useCan("products", "edit")
  if (!products.length || !editable) {
    return null
  }
  const chosen = products.filter((product) => ticked.has(product.productId)).map((product) => product.productId)
  const allTicked = chosen.length === products.length
  const options = suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))
  let assignLabel = t("assign")
  if (result.isLoading) {
    assignLabel = t("assigning")
  } else if (chosen.length) {
    assignLabel = t("assignTo", { count: chosen.length })
  }
  return (
    <IssuePanel title={t("title", { count: products.length })} hint={t("hint")}>
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        {suppliers.length ? (
          <>
            <Select items={options} value={supplierId || null} onValueChange={(value) => setSupplierId(value ?? "")}>
              <SelectTrigger size="sm" aria-label={t("supplierLabel")} className="w-56">
                <SelectValue>
                  {(value: string | null) =>
                    options.find((option) => option.value === value)?.label ?? t("chooseSupplier")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={!supplierId || !chosen.length || result.isLoading}
              onClick={async () => {
                try {
                  await assign({ productIds: chosen, supplierId }).unwrap()
                  setTicked(new Set())
                } catch {
                  // RTK Query keeps the failure for the message below.
                }
              }}
            >
              {assignLabel}
            </Button>
            {result.isError && (
              <p role="alert" className="basis-full text-sm text-destructive">
                {errorMessage(result.error, t("saveFailed"))}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t.rich("addSupplierFirst", {
              link: partnersLink
            })}
          </p>
        )}
      </div>
      <Table framed={false}>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10 ps-4">
              <Checkbox
                checked={allTicked}
                indeterminate={chosen.length > 0 && !allTicked}
                onCheckedChange={(checked) =>
                  setTicked(checked ? new Set(products.map((product) => product.productId)) : new Set())
                }
                aria-label={t("selectAll")}
              />
            </TableHead>
            <TableHead>{t("product")}</TableHead>
            <TableHead className="pe-4">{t("skus")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => (
            <TableRow key={product.productId}>
              <TableCell className="w-10 ps-4">
                <Checkbox
                  checked={ticked.has(product.productId)}
                  onCheckedChange={(checked) =>
                    setTicked((current) => {
                      const next = new Set(current)
                      if (checked) {
                        next.add(product.productId)
                      } else {
                        next.delete(product.productId)
                      }
                      return next
                    })
                  }
                  aria-label={t("select", { product: product.title })}
                />
              </TableCell>
              <TableCell className="whitespace-normal">
                <span className="flex items-center gap-3">
                  <ProductImage url={product.imageUrl} small />
                  <span className="font-medium [overflow-wrap:anywhere]">{product.title}</span>
                </span>
              </TableCell>
              <TableCell className="pe-4 text-xs whitespace-normal text-muted-foreground">
                {product.skus.length ? (
                  <>
                    {product.skus.length > 3
                      ? t("moreSkus", { skus: product.skus.slice(0, 3).join(", "), count: product.skus.length - 3 })
                      : product.skus.join(", ")}
                  </>
                ) : (
                  <>
                    <span aria-hidden="true">—</span>
                    <span className="sr-only">{t("noSkus")}</span>
                  </>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </IssuePanel>
  )
}
