"use client"

import { useDebouncedValue } from "@mantine/hooks"
import { ChevronLeft, ChevronRight, ImageOff, Search } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { createContext, use, useState } from "react"
import { InventoryLocations } from "@/components/inventory-locations"
import { ProductDetails } from "@/components/product-details"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select"
import { api, errorMessage } from "@/lib/api"
import { prepOptions } from "@/lib/prep"
import { cn } from "@/lib/utils"
import { salesPeriods, type VariantSales } from "@/server/bundle-sales"
import {
  type InventoryLocation,
  type InventoryProduct,
  type InventoryVariant,
  pageSizes
} from "@/server/inventory-products"
import type { ProductDefaults } from "@/server/product-defaults"
import * as styles from "./inventory-products.css"
import { sx } from "@/styles/sprinkles.css"
import { srOnly } from "@/styles/utilities.css"

type ProductsPage = {
  observedAt: string | null
  needsResync: boolean
  locations: InventoryLocation[]
  page: number
  pageSize: number
  totalPages: number
  totalProducts: number
  totalVariants: number
  products: ListedProduct[]
}
// A product on the page with the details Copacker keeps for it.
type ListedProduct = InventoryProduct & { defaults: ProductDefaults }

type ProductsQuery = {
  page: number
  pageSize: number
  q: string
  locationId: string
  includeExcluded: boolean
  // Part of the cache key so a finished sync loads fresh results.
  observedAt: string | null
}

const productsApi = api.injectEndpoints({
  overrideExisting: true,
  endpoints: (build) => ({
    inventoryProducts: build.query<ProductsPage, ProductsQuery>({
      query: ({ page, pageSize, q, locationId, includeExcluded }) => ({
        url: "inventory/products",
        params: {
          page,
          pageSize,
          includeExcluded,
          ...(q && { q }),
          ...(locationId && { locationId })
        }
      }),
      keepUnusedDataFor: 60
    })
  })
})

type SalesResult = {
  days: number
  unmatchedUnits: number
  sources: { source: "shopify" | "amazon"; error: string | null; gapUnits: number }[]
  variants: Record<string, VariantSales>
}

const salesApi = api.injectEndpoints({
  overrideExisting: true,
  endpoints: (build) => ({
    inventorySales: build.mutation<SalesResult, { days: number }>({
      query: (body) => ({ url: "inventory/sales", method: "POST", body })
    })
  })
})

// Reloads the page of products after a row changes something.
const RefreshContext = createContext<() => void>(() => undefined)

// Sales loaded for the page, read by each row.
const SalesContext = createContext<SalesResult | null>(null)

const sourceNames = { shopify: "Shopify", amazon: "Amazon" } as const

// How these variants sold in the loaded period: alone, inside bundles, and (for bundles) how many bundles.
function SalesLine({ variantIds }: { variantIds: string[] }) {
  const sales = use(SalesContext)
  // With no source read, nothing is known; "no sales" would be wrong.
  if (!sales?.sources.some((source) => source.error === null)) {
    return null
  }
  const totals = variantIds.reduce(
    (sum, id) => {
      const variant = sales.variants[id]
      return {
        soldAlone: sum.soldAlone + (variant?.soldAlone ?? 0),
        soldInBundles: sum.soldInBundles + (variant?.soldInBundles ?? 0),
        bundlesSold: sum.bundlesSold + (variant?.bundlesSold ?? 0)
      }
    },
    { soldAlone: 0, soldInBundles: 0, bundlesSold: 0 }
  )
  const parts = [
    totals.bundlesSold > 0 && `${totals.bundlesSold} bundles sold`,
    totals.soldAlone > 0 && `${totals.soldAlone} sold alone`,
    totals.soldInBundles > 0 && `${totals.soldInBundles} sold in bundles`
  ].filter(Boolean)
  return (
    <span className={styles.detail}>
      Last {sales.days} days: {parts.length ? parts.join(", ") : "no sales"}
    </span>
  )
}

function SalesControls() {
  const [days, setDays] = useState<number>(salesPeriods.at(-1) ?? 56)
  const [load, result] = salesApi.useInventorySalesMutation({ fixedCacheKey: "inventory-sales" })
  return (
    <div className={styles.listActions}>
      <Field orientation="horizontal" className={styles.pageSize}>
        <FieldLabel htmlFor="inventory-sales-days">Sales period</FieldLabel>
        <NativeSelect
          id="inventory-sales-days"
          size="sm"
          value={String(days)}
          onChange={(event) => setDays(Number(event.target.value))}
        >
          {salesPeriods.map((period) => (
            <NativeSelectOption key={period} value={String(period)}>
              {period} days
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Button variant="outline" size="sm" disabled={result.isLoading} onClick={() => void load({ days })}>
        {result.isLoading ? "Loading sales…" : "Show sales"}
      </Button>
      {result.isLoading && (
        <span className={styles.summary} aria-live="polite">
          Reading every order in the period. This can take a few minutes.
        </span>
      )}
    </div>
  )
}

// Explains sources that couldn't be read and sales that couldn't be matched to a product.
function SalesNotes({ sales, error }: { sales: SalesResult | undefined; error: unknown }) {
  if (error) {
    return <p role="alert">{errorMessage(error, "Sales couldn't be loaded. Try again.")}</p>
  }
  if (!sales) {
    return null
  }
  const notes = [
    ...sales.sources.flatMap(({ source, error: message, gapUnits }) => [
      message && `${sourceNames[source]}: ${message}`,
      gapUnits > 0 && `${sourceNames[source]}: ${gapUnits} units weren't counted, such as unshipped orders.`
    ]),
    sales.unmatchedUnits > 0 && `${sales.unmatchedUnits} units sold under SKUs that don't match one Shopify product.`
  ].filter((note) => typeof note === "string")
  return notes.length ? (
    <ul className={styles.salesNotes} aria-live="polite">
      {notes.map((note) => (
        <li key={note}>{note}</li>
      ))}
    </ul>
  ) : null
}

const locationGroups = [
  { classification: "merchant", label: "Your stock" },
  { classification: "amazon_mirror", label: "Amazon" },
  { classification: "unresolved", label: "Needs review" },
  { classification: "excluded", label: "Excluded" }
] as const

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
              {stockNotes[only.stock]}
            </span>
            <SalesLine variantIds={[only.variantId]} />
            <Locations variant={only} />
            <Actions product={product} className={styles.actions} />
          </span>
          <Quantities item={product} />
        </div>
      </li>
    )
  }
  const count = product.variants.length
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
          <SalesLine variantIds={product.variants.map((variant) => variant.variantId)} />
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
                  {product.stock === variant.stock ? null : stockNotes[variant.stock]}
                </span>
                <SalesLine variantIds={[variant.variantId]} />
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

export function InventoryProducts({ observedAt }: { observedAt: string | null }) {
  const [search, setSearch] = useState("")
  const [q] = useDebouncedValue(search.trim(), 300)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(25)
  const [locationId, setLocationId] = useState("")
  const [includeExcluded, setIncludeExcluded] = useState(false)
  const {
    currentData,
    data: previous,
    isLoading,
    isFetching,
    isError,
    error,
    refetch
  } = productsApi.useInventoryProductsQuery({ page, pageSize, q, locationId, includeExcluded, observedAt })
  // Keep showing the last page while the next one loads, so the list doesn't flash empty.
  const data = currentData ?? previous
  // Shares the result SalesControls loads.
  const [, sales] = salesApi.useInventorySalesMutation({ fixedCacheKey: "inventory-sales" })

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

  const hasExcluded = data.locations.some((location) => location.classification === "excluded")
  const visibleLocations = data.locations.filter(
    (location) => includeExcluded || location.classification !== "excluded"
  )

  return (
    <RefreshContext value={() => void refetch()}>
      <SalesContext value={sales.data ?? null}>
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
            <Field>
              <FieldLabel htmlFor="inventory-location">Location</FieldLabel>
              <NativeSelect
                id="inventory-location"
                className={styles.fullWidth}
                value={locationId}
                onChange={(event) => {
                  setLocationId(event.target.value)
                  setPage(1)
                }}
              >
                <NativeSelectOption value="">All locations</NativeSelectOption>
                {locationGroups.map((group) => {
                  const options = visibleLocations.filter(
                    (location) => location.classification === group.classification
                  )
                  return options.length ? (
                    <NativeSelectOptGroup key={group.classification} label={group.label}>
                      {options.map((location) => (
                        <NativeSelectOption key={location.id} value={location.id}>
                          {location.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelectOptGroup>
                  ) : null
                })}
              </NativeSelect>
            </Field>
            {hasExcluded && (
              <Field orientation="horizontal" className={styles.collective}>
                <Checkbox
                  id="inventory-excluded"
                  checked={includeExcluded}
                  onCheckedChange={(checked) => {
                    setIncludeExcluded(checked)
                    setLocationId("")
                    setPage(1)
                  }}
                />
                <FieldContent>
                  <FieldLabel htmlFor="inventory-excluded">Include excluded locations</FieldLabel>
                  <FieldDescription>
                    Stock that isn’t yours, such as partners’ stock shared through Shopify Collective.
                  </FieldDescription>
                </FieldContent>
              </Field>
            )}
          </div>
          <div className={styles.listHeader}>
            <SalesControls />
          </div>
          <SalesNotes sales={sales.data} error={sales.error} />
          <div className={styles.listHeader}>
            <p className={styles.summary} aria-live="polite">
              {q
                ? `${data.totalProducts} products match`
                : `${data.totalProducts} products, ${data.totalVariants} variations`}
            </p>
            <div className={styles.listActions}>
              <InventoryLocations onChange={() => void refetch()} />
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
              {q ? "No products match your search." : "No inventory was reported for this selection."}
            </p>
          ) : (
            <ul className={styles.list} aria-busy={isFetching}>
              {data.products.map((product) => (
                <ProductRow key={product.productId} product={product} />
              ))}
            </ul>
          )}
          {data.totalPages > 1 && <Pager data={data} onPage={setPage} />}
        </div>
      </SalesContext>
    </RefreshContext>
  )
}
