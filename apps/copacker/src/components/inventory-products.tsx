"use client"

import { useDebouncedValue } from "@mantine/hooks"
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Ellipsis,
  Info,
  PackagePlus,
  Pencil,
  Search,
  TriangleAlert,
  X
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { BulkBarcodeUpload } from "@/components/bulk-barcode-upload"
import { WarningNote } from "@/components/common"
import { ProductDetails, ProductImage } from "@/components/product-details"
import { ProductLabelBulk } from "@/components/product-label-bulk"
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, errorMessage } from "@/lib/api"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  type AmazonOnlyStock,
  type InventoryProduct,
  type InventoryVariant,
  pageSizes,
  type PurchaseOrderLink
} from "@/server/inventory-products"
import type { ProductBarcode } from "@/server/product-barcodes"
import type { ProductDefaults } from "@/server/product-defaults"

type ProductsPage = {
  observedAt: string | null
  needsResync: boolean
  page: number
  pageSize: number
  totalPages: number
  totalProducts: number
  totalVariants: number
  missingBarcodes: number
  missingCountries: number
  duplicateSkus: DuplicateSku[]
  products: ListedProduct[]
  amazonOnly: AmazonOnlyStock[]
}
// A product on the page with the details and labels Copacker keeps for it.
type ListedVariant = InventoryVariant & {
  barcode: ProductBarcode | null
  fnsku: string | null
  supplierSku: string | null
  asin: string | null
  storeStockTarget: number | null
  // ISO code from Shopify; null when none is recorded, left out before a sync collects it.
  countryOfOrigin?: string | null
}
// A SKU more than one Shopify variation uses.
type DuplicateSku = { sku: string; variants: { variantId: string; product: string; variant: string | null }[] }
type ListedProduct = Omit<InventoryProduct, "variants"> & { defaults: ProductDefaults; variants: ListedVariant[] }

type ProductsQuery = {
  page: number
  pageSize: number
  q: string
  missingBarcode: boolean
  missingCountry: boolean
  // Part of the cache key so a finished sync of any source loads fresh results.
  syncKey: string
}

const productsApi = api.injectEndpoints({
  overrideExisting: true,
  endpoints: (build) => ({
    inventoryProducts: build.query<ProductsPage, ProductsQuery>({
      query: ({ page, pageSize, q, missingBarcode, missingCountry }) => ({
        url: "inventory/products",
        params: {
          page,
          pageSize,
          ...(q && { q }),
          ...(missingBarcode && { barcode: "missing" }),
          ...(missingCountry && { country: "missing" })
        }
      }),
      keepUnusedDataFor: 60
    })
  })
})

// Cells at the edges of a table that runs edge to edge in its card line up with the card's padding.
const firstCell = "pl-4"
const lastCell = "pr-4"

// A problem with some products, as a card that opens to list them.
export function IssuePanel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <Collapsible>
        <CollapsibleTrigger className="group flex w-full items-center gap-3 px-4 py-3 text-left text-sm outline-none hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset">
          <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden="true" />
          <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
            <span className="font-medium">{title}</span>
            {hint && <span className="text-muted-foreground">{hint}</span>}
          </span>
          <ChevronDown
            className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180"
            aria-hidden="true"
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t">{children}</CollapsibleContent>
      </Collapsible>
    </Card>
  )
}

// SKUs several Shopify variations share. Uploads by file name and Amazon matching can't tell them apart.
function DuplicateSkus({ duplicates }: { duplicates: DuplicateSku[] }) {
  if (!duplicates.length) {
    return null
  }
  return (
    <IssuePanel
      title={
        duplicates.length === 1
          ? "1 SKU is used by more than one variation"
          : `${duplicates.length} SKUs are used by more than one variation`
      }
      hint="Give each variation its own SKU in Shopify"
    >
      <Table framed={false}>
        <TableHeader>
          <TableRow>
            <TableHead className={firstCell}>SKU</TableHead>
            <TableHead className={lastCell}>Variations</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {duplicates.map((duplicate) => (
            <TableRow key={duplicate.sku}>
              <TableCell className={cn(firstCell, "align-top whitespace-normal")}>{duplicate.sku}</TableCell>
              <TableCell className={cn(lastCell, "whitespace-normal")}>
                <ul className="flex flex-col gap-0.5">
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
    </IssuePanel>
  )
}

// A quantity that's missing or doesn't apply: a dash on screen, the reason for screen readers.
function Dash({ reason }: { reason: string }) {
  return (
    <span className="text-muted-foreground">
      <span aria-hidden="true">—</span>
      <span className="sr-only">{reason}</span>
    </span>
  )
}

// Amazon seller SKUs that don't match a single Shopify variant, such as listings with a different SKU.
function AmazonOnly({ stock }: { stock: AmazonOnlyStock[] }) {
  if (!stock.length) {
    return null
  }
  const amount = (value: number | null | undefined) =>
    value === null || value === undefined ? <Dash reason="None" /> : formatNumber(value)
  return (
    <IssuePanel
      title={`${stock.length} Amazon ${stock.length === 1 ? "SKU doesn't" : "SKUs don't"} match a Shopify product`}
      hint="Not in the totals"
    >
      <Table framed={false}>
        <TableHeader>
          <TableRow>
            <TableHead className={firstCell}>Amazon SKU</TableHead>
            <TableHead className="text-right">FBA available</TableHead>
            <TableHead className="text-right">AWD available</TableHead>
            <TableHead className={cn(lastCell, "text-right")}>Incoming</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stock.map((row) => (
            <TableRow key={row.sku}>
              <TableCell className={cn(firstCell, "whitespace-normal")}>{row.sku}</TableCell>
              <TableCell className="text-right tabular-nums">{amount(row.fba?.available)}</TableCell>
              <TableCell className="text-right tabular-nums">{amount(row.awd?.available)}</TableCell>
              <TableCell className={cn(lastCell, "text-right tabular-nums")}>
                {formatNumber((row.fba?.incoming ?? 0) + (row.awd?.incoming ?? 0))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </IssuePanel>
  )
}

// Why a count isn't shown.
const notCounted = { bundle: "Not stocked separately", untracked: "Not tracked" } as const

// A stock figure in its column: negative in red, a dash when it's unknown or isn't counted for this item.
function Count({ value, reason, className }: { value: number | null; reason?: string; className?: string }) {
  let shown = <Dash reason={reason ?? "Unknown"} />
  if (!reason && value !== null) {
    shown = <span className={cn(value < 0 && "text-destructive")}>{formatNumber(value)}</span>
  }
  return <TableCell className={cn("text-right tabular-nums", className)}>{shown}</TableCell>
}

// Whether a variation still needs its label uploaded: the standard FNSKU label doesn't suit its product.
const needsLabel = (product: ListedProduct, variant: ListedVariant) =>
  product.defaults.productLabel === "uploaded" && !variant.barcode

// Whether a variation's standard label leaves out "Made in" because Shopify has no country of origin for it.
const needsCountry = (product: ListedProduct, variant: ListedVariant) =>
  product.defaults.productLabel === "standard" && !variant.barcode && variant.countryOfOrigin === null

// Stock at each location, once a variation is stocked at more than one.
function Locations({ variant }: { variant: InventoryVariant }) {
  if (variant.levels.length <= 1 || variant.stock !== "tracked") {
    return null
  }
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {variant.levels.map((level) => (
        <Badge key={level.locationId} variant="outline" className="font-normal text-muted-foreground">
          {level.locationName}
          <span className="text-foreground tabular-nums">
            {level.available === null ? "—" : formatNumber(level.available)}
          </span>
        </Badge>
      ))}
    </span>
  )
}

// On hand, Incoming and On order show once the list is wide enough; Available always shows.
const wideOnly = "hidden @2xl:table-cell"

function Quantities({
  item,
  orders = []
}: {
  item: InventoryProduct | InventoryVariant
  orders?: PurchaseOrderLink[]
}) {
  const reason = item.stock === "tracked" ? undefined : notCounted[item.stock]
  return (
    <>
      <Count value={item.available} reason={item.stock === "untracked" ? reason : undefined} />
      <Count value={item.onHand} reason={reason} className={wideOnly} />
      <Count value={item.incoming} reason={reason} className={wideOnly} />
      <TableCell className={cn(wideOnly, "text-right tabular-nums")}>
        {formatNumber(item.onOrder.units)}
        {orders.length > 0 && (
          <span className="block text-xs whitespace-normal">
            {orders.map((order, index) => (
              <span key={order.id}>
                {index > 0 && ", "}
                <Link
                  href={`/orders/${order.id}`}
                  className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  {order.reference}
                </Link>
              </span>
            ))}
          </span>
        )}
      </TableCell>
    </>
  )
}

// The kind of stock and the Amazon minimum follow a comma in the line under a name, so they start lowercase.
const stockKinds = { tracked: null, bundle: "bundle", untracked: "not tracked" } as const

function amazonMinimum(target: number | null) {
  if (target === null) {
    return null
  }
  return target === 0 ? "not stocked at Amazon" : `Amazon min ${formatNumber(target)}`
}

// The line under a variation's name: its SKU, its Amazon minimum, and its kind of stock when that's unusual.
function variantDetail(variant: InventoryVariant, withKind: boolean) {
  return [variant.sku ?? "No SKU", amazonMinimum(variant.amazonStockTarget), withKind && stockKinds[variant.stock]]
    .filter(Boolean)
    .join(", ")
}

// Opens a new PO with these variations already added.
function reorderHref(variants: InventoryVariant[]) {
  const params = new URLSearchParams(variants.map((variant) => ["variant", variant.variantId]))
  return `/orders/new?${params}`
}

// A click on the row itself, not on a control inside it, a menu it opened, or text being selected.
function isRowClick(event: React.MouseEvent<HTMLTableRowElement>) {
  const { target, currentTarget } = event
  return (
    target instanceof Element &&
    currentTarget.contains(target) &&
    !target.closest("a, button, input, label, [role=menuitem]") &&
    !window.getSelection()?.toString()
  )
}

function RowMenu({ product, onEdit }: { product: ListedProduct; onEdit: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground"
            aria-label={`More for ${product.title}`}
          />
        }
      >
        <Ellipsis />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem render={<Link href={reorderHref(product.variants)} />}>
          <PackagePlus />
          Reorder
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onEdit}>
          <Pencil />
          Edit
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// A product's row, and its variations' rows beneath it once opened. A product with a single, untitled variation is
// that variation. Clicking a row opens the product's details.
function ProductRow({ product, onEdit }: { product: ListedProduct; onEdit: (product: ListedProduct) => void }) {
  const [open, setOpen] = useState(false)
  const edit = () => onEdit(product)
  const only = product.variants.length === 1 && product.variants[0]?.title === null ? product.variants[0] : null
  const count = product.variants.length
  const unlabelled = product.variants.filter((variant) => needsLabel(product, variant)).length
  const noCountry = product.variants.filter((variant) => needsCountry(product, variant)).length
  const variationsId = `variations-${product.productId.split("/").at(-1)}`
  const detail = only
    ? variantDetail(only, true)
    : [`${count} variations`, stockKinds[product.stock]].filter(Boolean).join(", ")
  return (
    <>
      <TableRow
        className="cursor-pointer"
        onClick={(event) => {
          if (isRowClick(event)) {
            edit()
          }
        }}
      >
        <TableCell className="w-10 pr-0 pl-3">
          {!only && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-foreground"
              aria-expanded={open}
              aria-controls={variationsId}
              aria-label={`${open ? "Hide" : "Show"} the ${count} variations of ${product.title}`}
              onClick={() => setOpen(!open)}
            >
              <ChevronRight className={cn("transition-transform", open && "rotate-90")} />
            </Button>
          )}
        </TableCell>
        <TableCell className="py-2.5 whitespace-normal">
          <div className="flex items-start gap-3">
            <ProductImage url={product.imageUrl} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <button
                type="button"
                onClick={edit}
                className="w-fit rounded-sm text-left font-medium [overflow-wrap:anywhere] underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {product.title}
              </button>
              <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{detail}</span>
              {unlabelled > 0 && (
                <WarningNote>
                  {only ? "Label missing" : `${unlabelled} ${unlabelled === 1 ? "label" : "labels"} missing`}
                </WarningNote>
              )}
              {noCountry > 0 && (
                <WarningNote>
                  {only || noCountry === count ? "No country of origin" : `${noCountry} without country of origin`}
                </WarningNote>
              )}
              {only && <Locations variant={only} />}
            </div>
          </div>
        </TableCell>
        <Quantities item={product} orders={product.onOrder.orders} />
        <TableCell className="w-12 pr-3 pl-0 text-right">
          <RowMenu product={product} onEdit={edit} />
        </TableCell>
      </TableRow>
      {open &&
        product.variants.map((variant, index) => (
          <TableRow
            key={variant.variantId}
            id={index === 0 ? variationsId : undefined}
            className="cursor-pointer bg-muted/30"
            onClick={(event) => {
              if (isRowClick(event)) {
                edit()
              }
            }}
          >
            <TableCell className="w-10 pr-0 pl-3" />
            <TableCell className="py-2 whitespace-normal">
              <div className="flex items-start gap-3 pl-6">
                <ProductImage url={variant.imageUrl} small />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="[overflow-wrap:anywhere]">{variant.title ?? product.title}</span>
                  <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    {variantDetail(variant, product.stock !== variant.stock)}
                  </span>
                  {needsLabel(product, variant) && <WarningNote>Label missing</WarningNote>}
                  {needsCountry(product, variant) && <WarningNote>No country of origin</WarningNote>}
                  <Locations variant={variant} />
                </div>
              </div>
            </TableCell>
            <Quantities item={variant} />
            <TableCell className="w-12 pr-3 pl-0" />
          </TableRow>
        ))}
    </>
  )
}

// A filter for variations missing something, showing how many do. Pressed, the list shows only those.
function FilterToggle({
  pressed,
  onPressedChange,
  label,
  description
}: {
  pressed: boolean
  onPressedChange: (pressed: boolean) => void
  label: string
  description: string
}) {
  return (
    <Button
      variant={pressed ? "secondary" : "outline"}
      size="sm"
      aria-pressed={pressed}
      title={description}
      onClick={() => onPressedChange(!pressed)}
    >
      <TriangleAlert data-icon="inline-start" className="text-warning" />
      {label}
      {pressed && <X data-icon="inline-end" aria-hidden />}
    </Button>
  )
}

const sizeItems = pageSizes.map((size) => ({ value: String(size), label: String(size) }))

// How many products there are, how many to show at once, and the pages.
function ListFooter({
  data,
  filtered,
  pageSize,
  onPageSize,
  onPage
}: {
  data: ProductsPage
  filtered: boolean
  pageSize: number
  onPageSize: (size: number) => void
  onPage: (page: number) => void
}) {
  const products = `${formatNumber(data.totalProducts)} ${data.totalProducts === 1 ? "product" : "products"}`
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t px-4 py-2.5 text-sm text-muted-foreground">
      <p aria-live="polite" className="tabular-nums">
        {filtered ? products : `${products}, ${formatNumber(data.totalVariants)} variations`}
      </p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {data.totalProducts > pageSizes[0] && (
          <div className="flex items-center gap-2">
            <span id="inventory-page-size">Rows per page</span>
            <Select
              items={sizeItems}
              value={String(pageSize)}
              onValueChange={(value) => {
                if (value) {
                  onPageSize(Number(value))
                }
              }}
            >
              <SelectTrigger size="sm" aria-labelledby="inventory-page-size" className="tabular-nums">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sizeItems.map((size) => (
                  <SelectItem key={size.value} value={size.value}>
                    {size.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {data.totalPages > 1 && (
          <nav aria-label="Product pages" className="flex items-center gap-2">
            <span className="tabular-nums">
              Page {data.page} of {data.totalPages}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Previous page"
              disabled={data.page <= 1}
              onClick={() => onPage(data.page - 1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Next page"
              disabled={data.page >= data.totalPages}
              onClick={() => onPage(data.page + 1)}
            >
              <ChevronRight />
            </Button>
          </nav>
        )}
      </div>
    </div>
  )
}

// The product list's shape while it loads.
export function ProductsSkeleton() {
  return (
    <Card className="gap-0 overflow-hidden py-0" aria-busy="true">
      <span className="sr-only">Loading products</span>
      <div className="border-b p-4">
        <Skeleton className="h-8 w-full max-w-sm" />
      </div>
      <div className="flex flex-col divide-y">
        {["a", "b", "c", "d", "e"].map((row) => (
          <div key={row} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-10" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-48 max-w-full" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-10" />
          </div>
        ))}
      </div>
    </Card>
  )
}

// The products API takes searches up to this long.
const searchLength = 100

// `search` starts the search box, such as a product chosen in the header's search.
export function InventoryProducts({ syncKey, search: initialSearch = "" }: { syncKey: string; search?: string }) {
  const [search, setSearch] = useState(initialSearch.slice(0, searchLength))
  const [q] = useDebouncedValue(search.trim(), 300)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(25)
  const [missingBarcode, setMissingBarcode] = useState(false)
  const [missingCountry, setMissingCountry] = useState(false)
  // The product whose details are open, kept after the panel closes so it can animate out.
  const [editing, setEditing] = useState<ListedProduct | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const {
    currentData,
    data: previous,
    isLoading,
    isFetching,
    isError,
    error,
    refetch
  } = productsApi.useInventoryProductsQuery({ page, pageSize, q, missingBarcode, missingCountry, syncKey })
  // Keep showing the last page while the next one loads, so the list doesn't flash empty.
  const data = currentData ?? previous
  const refresh = () => void refetch()
  const edit = (product: ListedProduct) => {
    setEditing(product)
    setDetailsOpen(true)
  }

  if (isLoading && !data) {
    return <ProductsSkeleton />
  }
  if (isError || !data) {
    return (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertDescription>{errorMessage(error, "Products couldn’t be loaded.")}</AlertDescription>
        <AlertAction>
          <Button variant="outline" size="xs" onClick={refresh}>
            Try again
          </Button>
        </AlertAction>
      </Alert>
    )
  }

  const filtered = Boolean(q) || missingBarcode || missingCountry
  // The open product as last loaded, so its panel shows labels uploaded from it. It stays open if a filter drops it.
  const shown = editing ? (data.products.find((product) => product.productId === editing.productId) ?? editing) : null
  return (
    <>
      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex flex-wrap items-center gap-2 border-b p-4">
          <InputGroup className="min-w-48 flex-1 sm:max-w-sm">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label="Search products"
              placeholder="Search products or SKUs"
              maxLength={searchLength}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
            />
          </InputGroup>
          {(data.missingBarcodes > 0 || missingBarcode) && (
            <FilterToggle
              pressed={missingBarcode}
              onPressedChange={(pressed) => {
                setMissingBarcode(pressed)
                setPage(1)
              }}
              label={`${formatNumber(data.missingBarcodes)} need a label`}
              description="Variations whose label has to be uploaded"
            />
          )}
          {(data.missingCountries > 0 || missingCountry) && (
            <FilterToggle
              pressed={missingCountry}
              onPressedChange={(pressed) => {
                setMissingCountry(pressed)
                setPage(1)
              }}
              label={`${formatNumber(data.missingCountries)} without a country`}
              description="Variations with no country of origin in Shopify, so their labels leave out “Made in”"
            />
          )}
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <BulkBarcodeUpload onChanged={refresh} />
            <ProductLabelBulk onChanged={refresh} />
          </div>
        </div>
        {data.needsResync && (
          <p className="flex items-center gap-2 border-b px-4 py-2 text-xs text-muted-foreground">
            <Info className="size-3.5 shrink-0" aria-hidden="true" />
            Sync Shopify to load the latest product details
          </p>
        )}
        {data.products.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {filtered ? "No products match" : "No products"}
          </p>
        ) : (
          <div className="@container" aria-busy={isFetching}>
            <Table framed={false}>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 pr-0 pl-3">
                    <span className="sr-only">Variations</span>
                  </TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className={cn("text-right", wideOnly)}>On hand</TableHead>
                  <TableHead className={cn("text-right", wideOnly)}>Incoming</TableHead>
                  <TableHead className={cn("text-right", wideOnly)}>On order</TableHead>
                  <TableHead className="w-12 pr-3 pl-0">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.products.map((product) => (
                  <ProductRow key={product.productId} product={product} onEdit={edit} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {data.products.length > 0 && (
          <ListFooter
            data={data}
            filtered={filtered}
            pageSize={pageSize}
            onPageSize={(size) => {
              setPageSize(size)
              setPage(1)
            }}
            onPage={setPage}
          />
        )}
      </Card>
      <DuplicateSkus duplicates={data.duplicateSkus} />
      <AmazonOnly stock={data.amazonOnly} />
      <ProductDetails product={shown} open={detailsOpen} onOpenChange={setDetailsOpen} onSaved={refresh} />
    </>
  )
}
