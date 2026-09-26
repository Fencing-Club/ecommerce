"use client"

import { useDebouncedValue } from "@mantine/hooks"
import { ChevronLeft, ChevronRight, ImageOff, Search } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { createContext, use, useState } from "react"
import { BulkBarcodeUpload } from "@/components/bulk-barcode-upload"
import { WarningNote } from "@/components/common"
import { ProductDetails } from "@/components/product-details"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, errorMessage } from "@/lib/api"
import { prepOptions } from "@/lib/prep"
import { cn } from "@/lib/utils"
import {
  type AmazonOnlyStock,
  type InventoryProduct,
  type InventoryVariant,
  pageSizes
} from "@/server/inventory-products"
import type { ProductBarcode } from "@/server/product-barcodes"
import type { ProductDefaults } from "@/server/product-defaults"
import * as styles from "./inventory-products.css"
import { sx } from "@/styles/sprinkles.css"
import { srOnly } from "@/styles/utilities.css"

type ProductsPage = {
  observedAt: string | null
  needsResync: boolean
  page: number
  pageSize: number
  totalPages: number
  totalProducts: number
  totalVariants: number
  missingBarcodes: number
  duplicateSkus: DuplicateSku[]
  products: ListedProduct[]
  amazonOnly: AmazonOnlyStock[]
}
// A product on the page with the details and labels Copacker keeps for it.
type ListedVariant = InventoryVariant & { barcode: ProductBarcode | null; fnsku: string | null }
// A SKU more than one Shopify variation uses.
type DuplicateSku = { sku: string; variants: { variantId: string; product: string; variant: string | null }[] }
type ListedProduct = Omit<InventoryProduct, "variants"> & { defaults: ProductDefaults; variants: ListedVariant[] }

type ProductsQuery = {
  page: number
  pageSize: number
  q: string
  missingBarcode: boolean
  // Part of the cache key so a finished sync of any source loads fresh results.
  syncKey: string
}

const productsApi = api.injectEndpoints({
  overrideExisting: true,
  endpoints: (build) => ({
    inventoryProducts: build.query<ProductsPage, ProductsQuery>({
      query: ({ page, pageSize, q, missingBarcode }) => ({
        url: "inventory/products",
        params: {
          page,
          pageSize,
          ...(q && { q }),
          ...(missingBarcode && { barcode: "missing" })
        }
      }),
      keepUnusedDataFor: 60
    })
  })
})

// Reloads the page of products after a row changes something.
const RefreshContext = createContext<() => void>(() => undefined)

// SKUs several Shopify variations share. Uploads by file name and Amazon matching can't tell them apart.
function DuplicateSkus({ duplicates }: { duplicates: DuplicateSku[] }) {
  if (!duplicates.length) {
    return null
  }
  return (
    <Collapsible className={styles.amazonOnly}>
      <CollapsibleTrigger className={styles.amazonOnlyTrigger}>
        <ChevronRight className={styles.chevron} aria-hidden="true" />
        <WarningNote>
          {duplicates.length === 1
            ? "1 SKU is used by more than one variation"
            : `${duplicates.length} SKUs are used by more than one variation`}
        </WarningNote>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <p className={styles.summary}>
          Give each variation its own SKU in Shopify, then sync. Until then, upload their labels from each product’s
          Edit panel, and check restock and Amazon quantities for them.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Variations</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {duplicates.map((duplicate) => (
              <TableRow key={duplicate.sku}>
                <TableCell className={styles.skuCell}>{duplicate.sku}</TableCell>
                <TableCell className={styles.skuCell}>
                  <ul className={styles.duplicateList}>
                    {duplicate.variants.map((variant) => (
                      <li key={variant.variantId}>
                        {variant.variant ? `${variant.product}, ${variant.variant}` : variant.product}
                      </li>
                    ))}
                  </ul>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CollapsibleContent>
    </Collapsible>
  )
}

// Amazon seller SKUs that don't match a single Shopify variant, such as listings with a different SKU.
function AmazonOnly({ stock }: { stock: AmazonOnlyStock[] }) {
  if (!stock.length) {
    return null
  }
  return (
    <Collapsible className={styles.amazonOnly}>
      <CollapsibleTrigger className={styles.amazonOnlyTrigger}>
        <ChevronRight className={styles.chevron} aria-hidden="true" />
        {stock.length} Amazon {stock.length === 1 ? "SKU doesn't" : "SKUs don't"} match a Shopify product
      </CollapsibleTrigger>
      <CollapsibleContent>
        <p className={styles.summary}>
          They aren&apos;t in the totals above. Give the Shopify variant the same SKU to combine them.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Amazon SKU</TableHead>
              <TableHead className={styles.numberCell}>FBA available</TableHead>
              <TableHead className={styles.numberCell}>AWD available</TableHead>
              <TableHead className={styles.numberCell}>Incoming</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stock.map((row) => (
              <TableRow key={row.sku}>
                <TableCell className={styles.skuCell}>{row.sku}</TableCell>
                <TableCell className={styles.numberCell}>{row.fba?.available ?? "None"}</TableCell>
                <TableCell className={styles.numberCell}>{row.awd?.available ?? "None"}</TableCell>
                <TableCell className={styles.numberCell}>
                  {(row.fba?.incoming ?? 0) + (row.awd?.incoming ?? 0)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CollapsibleContent>
    </Collapsible>
  )
}

// Why a count isn't shown: a dash on screen, the reason for screen readers.
const notCounted = { bundle: "Not stocked separately", untracked: "Not tracked" } as const

function Count({
  value,
  label,
  reason,
  className
}: {
  value: number | null
  label: string
  reason?: string
  className?: string
}) {
  return (
    <span className={cn(styles.quantity, className)}>
      {reason ? (
        <span className={styles.unknown}>
          <span aria-hidden="true">—</span>
          <span className={srOnly}>{reason}</span>
        </span>
      ) : (
        <span className={cn(value === null && styles.unknown, value !== null && value < 0 && styles.negative)}>
          {value ?? "Unknown"}
        </span>
      )}
      <span className={styles.quantityLabel}>{label}</span>
    </span>
  )
}

function Thumbnail({ url, small = false }: { url: string | null; small?: boolean }) {
  if (!url) {
    return (
      <span className={small ? styles.placeholderSmall : styles.placeholder} aria-hidden="true">
        <ImageOff />
      </span>
    )
  }
  const size = small ? 32 : 48
  // Shopify's CDN already serves a resized thumbnail, so Next's image optimizer is skipped.
  return (
    <Image
      src={url}
      alt=""
      width={size}
      height={size}
      unoptimized
      className={small ? styles.thumbSmall : styles.thumb}
    />
  )
}

// Warns that a variation's product needs an uploaded label, such as one with size measurements, and it has none.
function NoLabel({ children = "No label uploaded" }: { children?: string }) {
  return <WarningNote>{children}</WarningNote>
}

// Whether a variation still needs its label uploaded: the standard FNSKU label doesn't suit its product.
const needsLabel = (product: ListedProduct, variant: ListedVariant) =>
  product.defaults.productLabel === "uploaded" && !variant.barcode

function Locations({ variant }: { variant: InventoryVariant }) {
  if (variant.levels.length <= 1 || variant.stock !== "tracked") {
    return null
  }
  return (
    <span className={styles.locations}>
      {variant.levels.map((level) => (
        <Badge key={level.locationId} variant="outline">
          {level.locationName}: {level.available ?? "Unknown"}
        </Badge>
      ))}
    </span>
  )
}

function Quantities({ item }: { item: InventoryProduct | InventoryVariant }) {
  const reason = item.stock === "tracked" ? undefined : notCounted[item.stock]
  return (
    <>
      <Count value={item.available} label="Available" reason={item.stock === "untracked" ? reason : undefined} />
      <Count value={item.onHand} label="On hand" reason={reason} className={styles.secondary} />
      <Count value={item.incoming} label="Incoming" reason={reason} className={styles.secondary} />
      <Count value={item.onOrder.units} label="On order" className={styles.secondary} />
    </>
  )
}

// A short note after the SKU or variation count explaining quantities that aren't counted.
const stockNotes = {
  tracked: "",
  bundle: ", bundle sold from its parts' stock",
  untracked: ", inventory not tracked"
} as const

// Shopify's minimum stock at Amazon, after the SKU: what restock keeps there at least.
function amazonTargetNote(target: number | null) {
  if (target === null) {
    return null
  }
  return target === 0 ? ", not stocked at Amazon" : `, keep at least ${target} at Amazon`
}

// Opens a new PO with these variations already added.
function reorderHref(variants: InventoryVariant[]) {
  const params = new URLSearchParams(variants.map((variant) => ["variant", variant.variantId]))
  return `/orders/new?${params}`
}

function Actions({ product, className }: { product: ListedProduct; className: string }) {
  const { units, orders } = product.onOrder
  const refresh = use(RefreshContext)
  const prep = prepOptions.find((option) => option.value === product.defaults.prepCategory)
  return (
    <span className={className}>
      {prep && <span>Preparation: {prep.label}</span>}
      {orders.length > 0 && (
        <span>
          {units} on order in{" "}
          {orders.map((order, index) => (
            <span key={order.id}>
              {index > 0 && ", "}
              <Link href={`/orders/${order.id}`}>{order.reference}</Link>
            </span>
          ))}
        </span>
      )}
      <Button
        variant="outline"
        size="xs"
        nativeButton={false}
        render={<Link href={reorderHref(product.variants)} />}
        aria-label={`Reorder ${product.title}`}
      >
        Reorder
      </Button>
      <ProductDetails
        productId={product.productId}
        title={product.title}
        defaults={product.defaults}
        onSaved={refresh}
        shopifyCaseQuantity={product.shopifyCaseQuantity}
        variants={product.variants.map((variant) => ({
          variantId: variant.variantId,
          title: variant.title,
          amazonStockTarget: variant.amazonStockTarget,
          barcode: variant.barcode,
          fnsku: variant.fnsku
        }))}
      />
    </span>
  )
}

function ProductRow({ product }: { product: ListedProduct }) {
  const only = product.variants.length === 1 && product.variants[0]?.title === null ? product.variants[0] : null
  if (only) {
    return (
      <li className={styles.product}>
        <div className={styles.productRow}>
          <span className={styles.chevronSpacer} />
          <Thumbnail url={product.imageUrl} />
          <span className={styles.name}>
            <span className={styles.title}>{product.title}</span>
            <span className={styles.detail}>
              {only.sku ?? "No SKU"}
              {amazonTargetNote(only.amazonStockTarget)}
              {stockNotes[only.stock]}
            </span>
            {needsLabel(product, only) && <NoLabel />}
            <Locations variant={only} />
            <Actions product={product} className={styles.actions} />
          </span>
          <Quantities item={product} />
        </div>
      </li>
    )
  }
  const count = product.variants.length
  const unlabelled = product.variants.filter((variant) => needsLabel(product, variant)).length
  return (
    <Collapsible render={<li className={styles.product} />}>
      <CollapsibleTrigger className={styles.productRow}>
        <ChevronRight className={styles.chevron} aria-hidden="true" />
        <Thumbnail url={product.imageUrl} />
        <span className={styles.name}>
          <span className={styles.title}>{product.title}</span>
          <span className={styles.detail}>
            {count === 1 ? "1 variation" : `${count} variations`}
            {stockNotes[product.stock]}
          </span>
          {unlabelled > 0 && (
            <NoLabel>
              {unlabelled === count
                ? "No labels uploaded"
                : `${unlabelled} ${unlabelled === 1 ? "variation needs its label uploaded" : "variations need their labels uploaded"}`}
            </NoLabel>
          )}
        </span>
        <Quantities item={product} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Actions product={product} className={styles.panelActions} />
        <ul className={styles.variants} aria-label={`${product.title} variations`}>
          {product.variants.map((variant) => (
            <li key={variant.variantId} className={styles.variantRow}>
              <span className={styles.chevronSpacer} />
              <Thumbnail url={variant.imageUrl} small />
              <span className={styles.name}>
                <span className={styles.title}>{variant.title ?? product.title}</span>
                <span className={styles.detail}>
                  {variant.sku ?? "No SKU"}
                  {amazonTargetNote(variant.amazonStockTarget)}
                  {product.stock === variant.stock ? null : stockNotes[variant.stock]}
                </span>
                {needsLabel(product, variant) && <NoLabel />}
                <Locations variant={variant} />
              </span>
              <Quantities item={variant} />
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

function Pager({ data, onPage }: { data: ProductsPage; onPage: (page: number) => void }) {
  const first = (data.page - 1) * data.pageSize + 1
  const last = Math.min(data.page * data.pageSize, data.totalProducts)
  return (
    <nav aria-label="Inventory pages" className={styles.pager}>
      <p className={styles.summary}>
        Showing {first}–{last} of {data.totalProducts} products
      </p>
      <div className={styles.pagerButtons}>
        <Button variant="outline" size="sm" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>
          <ChevronLeft data-icon="inline-start" />
          Previous
        </Button>
        <span className={styles.summary}>
          Page {data.page} of {data.totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={data.page >= data.totalPages}
          onClick={() => onPage(data.page + 1)}
        >
          Next
          <ChevronRight data-icon="inline-end" />
        </Button>
      </div>
    </nav>
  )
}

export function InventoryProducts({ syncKey }: { syncKey: string }) {
  const [search, setSearch] = useState("")
  const [q] = useDebouncedValue(search.trim(), 300)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(25)
  const [missingBarcode, setMissingBarcode] = useState(false)
  const {
    currentData,
    data: previous,
    isLoading,
    isFetching,
    isError,
    error,
    refetch
  } = productsApi.useInventoryProductsQuery({ page, pageSize, q, missingBarcode, syncKey })
  // Keep showing the last page while the next one loads, so the list doesn't flash empty.
  const data = currentData ?? previous

  if (isLoading && !data) {
    return <p className={styles.summary}>Loading products…</p>
  }
  if (isError || !data) {
    return (
      <div className={sx({ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-start" })}>
        <p role="alert">{errorMessage(error, "Products couldn’t be loaded.")}</p>
        <Button variant="outline" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  return (
    <RefreshContext value={() => void refetch()}>
      <div className={sx({ display: "flex", flexDirection: "column", gap: 4 })}>
        {data.needsResync && <p className={styles.summary}>Sync again to load product photos and location types.</p>}
        <div className={styles.toolbar}>
          <Field>
            <FieldLabel htmlFor="inventory-search">Search products</FieldLabel>
            <div className={sx({ display: "flex", alignItems: "center", gap: 2 })}>
              <Search className={sx({ size: 4, color: "muted" })} aria-hidden="true" />
              <Input
                id="inventory-search"
                type="search"
                placeholder="Product, variation, or SKU"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
              />
            </div>
          </Field>
          <p className={styles.summary}>
            Totals add your Shopify locations and Amazon FBA and AWD. Choose which Shopify locations count in{" "}
            <Link href="/settings">Settings</Link>.
          </p>
        </div>
        {data.missingBarcodes > 0 && (
          <WarningNote>
            {data.missingBarcodes === 1
              ? "1 variation needs its label uploaded, such as one with size measurements. Add it with Upload barcodes or from the product’s Edit panel."
              : `${data.missingBarcodes} variations need their labels uploaded, such as ones with size measurements. Add them with Upload barcodes or from each product’s Edit panel.`}
          </WarningNote>
        )}
        <div className={styles.listHeader}>
          <p className={styles.summary} aria-live="polite">
            {q || missingBarcode
              ? `${data.totalProducts} products match`
              : `${data.totalProducts} products, ${data.totalVariants} variations`}
          </p>
          <div className={styles.listActions}>
            <BulkBarcodeUpload onChanged={() => void refetch()} />
            <Field orientation="horizontal" className={styles.pageSize}>
              <Checkbox
                id="inventory-missing-barcode"
                checked={missingBarcode}
                onCheckedChange={(checked) => {
                  setMissingBarcode(checked)
                  setPage(1)
                }}
              />
              <FieldLabel htmlFor="inventory-missing-barcode">Needs a label only</FieldLabel>
            </Field>
            <Field orientation="horizontal" className={styles.pageSize}>
              <FieldLabel htmlFor="inventory-page-size">Per page</FieldLabel>
              <NativeSelect
                id="inventory-page-size"
                size="sm"
                value={String(pageSize)}
                onChange={(event) => {
                  setPageSize(Number(event.target.value))
                  setPage(1)
                }}
              >
                {pageSizes.map((size) => (
                  <NativeSelectOption key={size} value={String(size)}>
                    {size}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          </div>
        </div>
        {data.products.length === 0 ? (
          <p className={styles.summary}>
            {q || missingBarcode ? "No products match." : "No inventory was reported for this selection."}
          </p>
        ) : (
          <ul className={styles.list} aria-busy={isFetching}>
            {data.products.map((product) => (
              <ProductRow key={product.productId} product={product} />
            ))}
          </ul>
        )}
        {data.totalPages > 1 && <Pager data={data} onPage={setPage} />}
        <DuplicateSkus duplicates={data.duplicateSkus} />
        <AmazonOnly stock={data.amazonOnly} />
      </div>
    </RefreshContext>
  )
}
