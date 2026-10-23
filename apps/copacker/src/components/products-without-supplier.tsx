import {
  Button,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@buildkitgg/shadcn-baseui-kit"
import { useSet } from "@mantine/hooks"
import { useState } from "react"
import { useTranslations } from "use-intl"
import { PageLink, useCan } from "@/components/access"
import { IssuePanel } from "@/components/inventory-products"
import { NoValue } from "@/components/no-value"
import { OptionSelect } from "@/components/option-select"
import { ProductThumb } from "@/components/product-thumb"
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
    <PageLink href="/partners" className="text-link text-foreground">
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
  const ticked = useSet<string>()
  const [supplierId, setSupplierId] = useState<string | null>(null)
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
            <OptionSelect
              options={options}
              value={supplierId}
              onValueChange={setSupplierId}
              placeholder={t("chooseSupplier")}
              label={t("supplierLabel")}
              size="sm"
              className="w-56"
            />
            <Button
              size="sm"
              disabled={!supplierId || !chosen.length || result.isLoading}
              onClick={async () => {
                if (!supplierId) {
                  return
                }
                try {
                  await assign({ productIds: chosen, supplierId }).unwrap()
                  ticked.clear()
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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10 ps-4">
              <Checkbox
                checked={allTicked}
                indeterminate={chosen.length > 0 && !allTicked}
                onCheckedChange={(checked) => {
                  ticked.clear()
                  if (checked) {
                    for (const product of products) {
                      ticked.add(product.productId)
                    }
                  }
                }}
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
                  onCheckedChange={(checked) => {
                    if (checked) {
                      ticked.add(product.productId)
                    } else {
                      ticked.delete(product.productId)
                    }
                  }}
                  aria-label={t("select", { product: product.title })}
                />
              </TableCell>
              <TableCell className="whitespace-normal">
                <span className="flex items-center gap-3">
                  <ProductThumb url={product.imageUrl} className="size-8" />
                  <span className="font-medium [overflow-wrap:anywhere]">{product.title}</span>
                </span>
              </TableCell>
              <TableCell className="pe-4 text-xs whitespace-normal text-muted-foreground">
                {product.skus.length === 0 && <NoValue reason={t("noSkus")} />}
                {product.skus.length > 3
                  ? t("moreSkus", { skus: product.skus.slice(0, 3).join(", "), count: product.skus.length - 3 })
                  : product.skus.join(", ")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </IssuePanel>
  )
}
