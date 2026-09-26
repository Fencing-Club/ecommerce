import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"
import type { CatalogVariant } from "@repo/aisle/shopify"
import type { LineDefaults } from "./order-lines"

export type ActionResult = { ok?: boolean; error?: string; redirect?: string; id?: string } & Record<string, unknown>
export type CatalogProduct = CatalogVariant & {
  amazonAsin: string
  fnsku: string
  amazonError: string | null
  // Pieces per unit from Shopify, and the product's saved description and preparation.
  lineDefaults: Pick<LineDefaults, "piecesPerSet" | "description" | "prepCategory">
}

export type SupplierOption = {
  id: string
  name: string
  leadTimeDays: number | null
  amazonLeadTimeDays: number | null
}

// Server-rendered pages refresh with router.refresh(). Data cached here is tagged, so a change made anywhere re-renders
// every view that shows it: "Supplier" for supplier names and lead times, "Restock" for restock results, and
// "ProductSupplier" for which products have a supplier.
export const api = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({ baseUrl: "/api" }),
  tagTypes: ["Supplier", "Restock", "ProductSupplier"],
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
    })
  })
})

export const { useActionMutation, useLazyCatalogQuery, useSuppliersQuery, useUploadDocumentMutation } = api

export function errorMessage(error: unknown, fallback = "Something went wrong. Try again.") {
  if (typeof error === "object" && error !== null) {
    if ("data" in error && typeof error.data === "object" && error.data !== null && "error" in error.data) {
      return String(error.data.error)
    }
    if ("status" in error && error.status === "FETCH_ERROR") {
      return "Couldn't reach Copacker. Check your connection and try again."
    }
    if (error instanceof Error) {
      return error.message
    }
  }
  return fallback
}
