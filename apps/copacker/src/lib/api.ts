import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"
import type { CatalogVariant } from "@repo/copacker-marketplaces/shopify"
import type { LineDefaults, OrderCurrency } from "@repo/copacker-orders"
import type { ShippingDocumentData } from "@repo/copacker-shipments/shipping-model"
import { arrayIncludes } from "ts-extras"
import type { ActionName } from "@/server/actions"
import type { AmazonOnlyStock, InventoryProduct, InventoryVariant } from "@/server/inventory-products"
import type { ProductBarcode } from "@/server/product-barcodes"
import type { ProductDefaults } from "@/server/product-defaults"
import type { SalesOrderSummary } from "@/server/sales-orders"
import type { SearchIndex } from "@/server/search"
import type { matchSupplierCatalog } from "@/server/supplier-catalog-match"
import { apiTags, invalidatesHeader } from "./api-tags"

export type ActionResult = { ok?: boolean; error?: string; redirect?: string; id?: string } & Record<string, unknown>
export type CatalogProduct = CatalogVariant & {
  amazonAsin: string
  fnsku: string
  amazonError: string | null
  // Pieces per unit from Shopify, and the product's saved description and preparation.
  lineDefaults: Pick<
    LineDefaults,
    "piecesPerSet" | "description" | "prepCategory" | "suffocationWarning" | "amazonNetwork" | "skuLabel"
  >
}

export type SupplierOption = {
  id: string
  name: string
  leadTimeDays: number | null
}

// A supplier SKU's quote from the supplier's catalog, as /api/supplier-catalog/match answers for each SKU it's asked:
// the match, and the pieces the supplier can still sell (null when there's no limit).
export type SupplierCatalogMatch = ReturnType<typeof matchSupplierCatalog> & { sku: string; available: number | null }

// A product on the Products page, or in a purchase order's product picker, with the details and labels Copacker keeps
// for it.
export type ListedVariant = InventoryVariant & {
  barcode: ProductBarcode | null
  fnsku: string | null
  supplierSku: string | null
  asin: string | null
  storeStockTarget: number | null
  // ISO code from Shopify; null when none is recorded, left out before a sync collects it.
  countryOfOrigin?: string | null
}
// A SKU more than one Shopify variation uses.
export type DuplicateSku = { sku: string; variants: { variantId: string; product: string; variant: string | null }[] }
export type ListedProduct = Omit<InventoryProduct, "variants"> & {
  defaults: ProductDefaults
  variants: ListedVariant[]
}
export type InventoryProductsPage = {
  observedAt: string | null
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

// Data cached here is tagged (see apiTags), so a change made anywhere re-renders every view that shows it. Pages refresh
// their own data with router.invalidate().
// Follow session redirects as document navigation, never inside a background request. In particular, fetching
// through recovery could change the workspace cookie while leaving the old company's screen and caches visible.
const fetchQuery = fetchBaseQuery({ baseUrl: "/api", redirect: "manual" })

// The caches an action's response says it changed (see defineAction's `invalidates`).
function invalidatedTags(response: Response | undefined) {
  const named = response?.headers.get(invalidatesHeader)?.split(",") ?? []
  return named.map((tag) => tag.trim()).filter((tag) => arrayIncludes(apiTags, tag))
}

export const api = createApi({
  reducerPath: "api",
  baseQuery: async (args, api, extraOptions) => {
    const result = await fetchQuery(args, api, extraOptions)
    // Browser fetch intentionally hides the target of a manual redirect. The independent recovery route can
    // resolve sign-in, onboarding and workspace selection without retrying the original request.
    if (result.meta?.response?.type === "opaqueredirect") {
      window.location.assign("/workspaces?unavailable=1")
    }
    return result
  },
  tagTypes: apiTags,
  endpoints: (build) => ({
    action: build.mutation<ActionResult, { action: ActionName; data: Record<string, unknown> }>({
      query: (body) => ({ url: "action", method: "POST", body }),
      invalidatesTags: (_result, _error, _body, meta) => invalidatedTags(meta?.response)
    }),
    // The buyer's current suppliers, for pickers and restock.
    suppliers: build.query<SupplierOption[], void>({
      query: () => "restock/suppliers",
      providesTags: ["Supplier"]
    }),
    // Shopify variations by ID with their purchase order line defaults, for the lines a purchase order adds.
    catalog: build.query<CatalogProduct[], string[]>({
      query: (ids) => ({ url: "catalog", params: { ids: ids.join(",") } }),
      keepUnusedDataFor: 0
    }),
    // Each supplier SKU's quote from the supplier's catalog, in the order asked, for a purchase order's lines. Asked
    // afresh each time, since the supplier can change its prices and stock.
    supplierCatalogMatch: build.query<
      SupplierCatalogMatch[],
      { supplierId: string; currency: OrderCurrency; supplierSkus: string[] }
    >({
      query: (body) => ({ url: "supplier-catalog/match", method: "POST", body }),
      keepUnusedDataFor: 0
    }),
    // A page of the store's products with their stock, for the Products page and the purchase order product picker.
    // `syncKey` only keys the cache, so a finished sync of any source loads fresh results.
    inventoryProducts: build.query<
      InventoryProductsPage,
      {
        q?: string
        page?: number
        pageSize?: number
        missingBarcode?: boolean
        missingCountry?: boolean
        syncKey?: string
      }
    >({
      query: ({ page, pageSize, q, missingBarcode, missingCountry }) => ({
        url: "inventory/products",
        params: {
          ...(page !== undefined && { page }),
          ...(pageSize !== undefined && { pageSize }),
          ...(q && { q }),
          ...(missingBarcode && { barcode: "missing" }),
          ...(missingCountry && { country: "missing" })
        }
      }),
      keepUnusedDataFor: 60
    }),
    uploadDocument: build.mutation<ActionResult, FormData>({
      query: (body) => ({ url: "documents", method: "POST", body })
    }),
    // A shipment's carrier labels, from the Upload carrier labels dialog. `sent` says whether they went to the supplier.
    saveCarrierLabels: build.mutation<{ sent: boolean }, { id: string; body: FormData }>({
      query: ({ id, body }) => ({ url: `shipments/${id}/carrier-labels`, method: "POST", body })
    }),
    // What the header's search looks through, and the sales orders it finds as the Orders page's search does.
    search: build.query<SearchIndex, void>({ query: () => "search" }),
    salesSearch: build.query<{ orders: SalesOrderSummary[] }, string>({
      query: (q) => ({ url: "sales/orders", params: { q } })
    }),
    // Whether Copacker is down for maintenance, which the maintenance page asks until it can reload.
    maintenance: build.query<{ active: boolean }, void>({ query: () => "maintenance" }),
    // A packed shipment's packing list, which the browser renders into its PDF. Each download asks again.
    packingList: build.query<{ data: ShippingDocumentData }, string>({
      query: (id) => `shipments/${id}/packing-list`,
      keepUnusedDataFor: 0
    })
  })
})

export const {
  useActionMutation,
  useInventoryProductsQuery,
  useLazyCatalogQuery,
  useLazyPackingListQuery,
  useMaintenanceQuery,
  useSalesSearchQuery,
  useSaveCarrierLabelsMutation,
  useSearchQuery,
  useSupplierCatalogMatchQuery,
  useSuppliersQuery,
  useUploadDocumentMutation
} = api
