"use client"

import { AlertTriangle, ChevronRight, ImageOff } from "lucide-react"
import Image from "next/image"
import { useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Field, FieldLabel } from "@/components/ui/field"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, errorMessage, useSuppliersQuery } from "@/lib/api"
import type { ProductWithoutSupplier } from "@/server/product-suppliers"
import * as styles from "./products-without-supplier.css"
import { srOnly } from "@/styles/utilities.css"

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

// Restock only suggests products with a known supplier, so this lists the ones without, and sets their supplier in
// bulk. `syncKey` reloads the list after a stock sync brings in new products.
export function ProductsWithoutSupplier({ syncKey }: { syncKey: string }) {
  const { currentData: products = [] } = productSuppliersApi.useProductsWithoutSupplierQuery(syncKey)
  const { data: suppliers = [] } = useSuppliersQuery()
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set())
  const [supplierId, setSupplierId] = useState("")
  const [assign, result] = productSuppliersApi.useAssignSupplierMutation()
  if (!products.length) {
    return null
  }
  const chosen = products.filter((product) => ticked.has(product.productId)).map((product) => product.productId)
  const allTicked = chosen.length === products.length
  return (
    <Alert>
      <AlertTriangle />
      <AlertTitle>
        {products.length} {products.length === 1 ? "product has" : "products have"} no supplier in Shopify
      </AlertTitle>
      <AlertDescription>
        <p>Restock only suggests products with a supplier. Choose one here.</p>
        <Collapsible className={styles.list}>
          <CollapsibleTrigger className={styles.trigger}>
            <ChevronRight className={styles.chevron} aria-hidden="true" />
            Show products
          </CollapsibleTrigger>
          <CollapsibleContent className={styles.list}>
            {suppliers.length ? (
              <div className={styles.assign}>
                <Field className={styles.select}>
                  <FieldLabel htmlFor="unassigned-supplier">Supplier for the ticked products</FieldLabel>
                  <NativeSelect
                    id="unassigned-supplier"
                    value={supplierId}
                    onChange={(event) => setSupplierId(event.target.value)}
                  >
                    <NativeSelectOption value="">Choose a supplier</NativeSelectOption>
                    {suppliers.map((supplier) => (
                      <NativeSelectOption key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Button
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
                  {result.isLoading
                    ? "Assigning…"
                    : `Assign ${chosen.length} ${chosen.length === 1 ? "product" : "products"}`}
                </Button>
                {result.isError && (
                  <p role="alert" className={styles.problem}>
                    {errorMessage(result.error, "The supplier couldn’t be saved. Try again.")}
                  </p>
                )}
              </div>
            ) : (
              <p>Invite a supplier on the Suppliers page first.</p>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Checkbox
                      checked={allTicked}
                      indeterminate={chosen.length > 0 && !allTicked}
                      onCheckedChange={(checked) =>
                        setTicked(checked ? new Set(products.map((product) => product.productId)) : new Set())
                      }
                      aria-label="Tick all products"
                    />
                  </TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>SKUs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.productId}>
                    <TableCell>
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
                        aria-label={`Tick ${product.title}`}
                      />
                    </TableCell>
                    <TableCell>
                      <span className={styles.name}>
                        {product.imageUrl ? (
                          <Image
                            src={product.imageUrl}
                            alt=""
                            width={32}
                            height={32}
                            unoptimized
                            className={styles.thumb}
                          />
                        ) : (
                          <span className={styles.placeholder} aria-hidden="true">
                            <ImageOff />
                          </span>
                        )}
                        {product.title}
                      </span>
                    </TableCell>
                    <TableCell className={styles.skus}>
                      {product.skus.slice(0, 3).join(", ")}
                      {product.skus.length > 3 && ` and ${product.skus.length - 3} more`}
                      {!product.skus.length && (
                        <>
                          None<span className={srOnly}> set in Shopify</span>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CollapsibleContent>
        </Collapsible>
      </AlertDescription>
    </Alert>
  )
}
