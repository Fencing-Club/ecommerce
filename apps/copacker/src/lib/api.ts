import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"
import type { CatalogVariant } from "@repo/aisle/shopify"
import type { SalesOrderSummary } from "@/server/sales-orders"
import type { SearchIndex } from "@/server/search"
import type { LineDefaults } from "./order-lines"

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

// Server-rendered pages refresh with router.refresh(). Data cached here is tagged, so a change made anywhere re-renders
// every view that shows it: "Supplier" for supplier names and lead times, "Restock" for restock results, and
// "ProductSupplier" for which products have a supplier, and "InventoryLocation" for which Shopify locations count.
// Follow session redirects as document navigation, never inside a background request. In particular, fetching
// through recovery could change the workspace cookie while leaving the old company's screen and caches visible.
const fetchQuery = fetchBaseQuery({ baseUrl: "/api", redirect: "manual" })

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
  tagTypes: ["Supplier", "Restock", "ProductSupplier", "InventoryLocation"],
  endpoints: (build) => ({
    action: build.mutation<ActionResult, { action: string; data: Record<string, unknown> }>({
      query: (body) => ({ url: "action", method: "POST", body }),
      invalidatesTags: (_result, _error, { action }) =>
        action.startsWith("supplier.") ? ["Supplier", "ProductSupplier"] : []
    }),
    // The buyer's current suppliers, for pickers and restock.
    suppliers: build.query<SupplierOption[], void>({
      query: () => "restock/suppliers",
      providesTags: ["Supplier"]
    }),
    catalog: build.query<CatalogProduct[], string>({
      query: (q) => ({ url: "catalog", params: { q } }),
      keepUnusedDataFor: 0
    }),
    uploadDocument: build.mutation<ActionResult, FormData>({
      query: (body) => ({ url: "documents", method: "POST", body })
    }),
    // What the header's search looks through, and the sales orders it finds as the Orders page's search does.
    search: build.query<SearchIndex, void>({ query: () => "search" }),
    salesSearch: build.query<{ orders: SalesOrderSummary[] }, string>({
      query: (q) => ({ url: "sales/orders", params: { q } })
    }),
    // Whether Copacker is down for maintenance, which the maintenance page asks until it can reload.
    maintenance: build.query<{ active: boolean }, void>({ query: () => "maintenance" })
  })
})

export const {
  useActionMutation,
  useLazyCatalogQuery,
  useMaintenanceQuery,
  useSalesSearchQuery,
  useSearchQuery,
  useSuppliersQuery,
  useUploadDocumentMutation
} = api
