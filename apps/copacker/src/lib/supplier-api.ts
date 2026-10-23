import { z } from "zod"
import { api } from "@/lib/api"
import { type ProductImage, productImageSchema } from "@/lib/supplier-product"
import type { catalogInputSchema, saveCatalog } from "@/server/catalogs"
import type { proposalSchema, proposeChanges } from "@/server/order-proposals"
import type { previewImport } from "@/server/product-import"
import type { productInputSchema, saveProduct } from "@/server/supplier-products"

// What importing a product file would change. It's checked as it arrives, so a malformed preview fails the import
// rather than the dialog showing it.
const count = z.number().int().nonnegative()
const importPreviewSchema = z.object({
  products: count,
  createdProducts: count,
  variants: z.object({ created: count, updated: count, unchanged: count }),
  sample: z.array(z.object({ handle: z.string(), title: z.string(), variants: count, isNew: z.boolean() })),
  revisionHash: z.string(),
  fileHash: z.string()
})

export type ImportPreview = Awaited<ReturnType<typeof previewImport>> & { fileHash: string }

// The buyer approving or declining a supplier's changes to a purchase order, or the supplier withdrawing them.
export type ProposalReply = { action: "approve" } | { action: "decline"; reason: string } | { action: "withdraw" }

// An uploaded file's form: the file, with the fields that go beside it.
function fileForm(file: File, fields: Record<string, string> = {}) {
  const body = new FormData()
  body.set("file", file)
  for (const [name, value] of Object.entries(fields)) {
    body.set(name, value)
  }
  return body
}

// The supplier workspace's changes: catalogs and which customers have them, products and their photos, stock, sent
// purchase orders' changes and the buyer's answer to them, and product imports. Each page refreshes with
// router.invalidate() after a change, so nothing here is cached.
const supplierApi = api.injectEndpoints({
  overrideExisting: true,
  endpoints: (build) => ({
    saveCatalog: build.mutation<Awaited<ReturnType<typeof saveCatalog>>, z.input<typeof catalogInputSchema>>({
      query: (body) => ({ url: "catalogs", method: "POST", body })
    }),
    deleteCatalog: build.mutation<{ ok: true }, string>({
      query: (id) => ({ url: `catalogs/${id}`, method: "DELETE" })
    }),
    // Null takes a customer's catalog away, so it sees every active product at its own price.
    assignCatalog: build.mutation<{ ok: true }, { customerId: string; catalogId: string | null }>({
      query: ({ customerId, catalogId }) => ({
        url: `customers/${customerId}/catalog`,
        method: "POST",
        body: { catalogId }
      })
    }),
    // Its photos are the ones uploadProductImage returned, whose types the server checks again.
    saveProduct: build.mutation<
      Awaited<ReturnType<typeof saveProduct>>,
      Omit<z.input<typeof productInputSchema>, "images"> & { images: ProductImage[] }
    >({
      query: (body) => ({ url: "supplier-catalog/products", method: "POST", body })
    }),
    // One photo, stored until the product that shows it is saved.
    uploadProductImage: build.mutation<ProductImage, File>({
      query: (file) => ({ url: "product-images", method: "POST", body: fileForm(file) }),
      responseSchema: productImageSchema
    }),
    // Archives products, or restores them.
    setProductsActive: build.mutation<{ updated: number }, { ids: string[]; active: boolean }>({
      query: (body) => ({ url: "supplier-catalog/status", method: "POST", body })
    }),
    // The Inventory page's changed on hand counts, all saved or none.
    saveStock: build.mutation<
      { saved: number },
      { counts: Array<{ id: string; onHand: number; expectedRevision: number }> }
    >({
      query: (body) => ({ url: "supplier-catalog/stock", method: "POST", body })
    }),
    setTracking: build.mutation<
      { revision: number },
      { id: string; trackInventory?: boolean; continueSelling?: boolean }
    >({
      query: (body) => ({ url: "supplier-catalog/tracking", method: "POST", body })
    }),
    // The supplier's changes to a sent purchase order, for the buyer to approve. A ready date alone applies at once.
    proposeChanges: build.mutation<
      Awaited<ReturnType<typeof proposeChanges>>,
      { orderId: string; revision: number; proposal: z.input<typeof proposalSchema> }
    >({
      query: ({ orderId, ...body }) => ({ url: `orders/${orderId}/proposal`, method: "POST", body })
    }),
    answerProposal: build.mutation<{ ok: true }, { id: string } & ProposalReply>({
      query: ({ id, ...body }) => ({ url: `proposals/${id}`, method: "POST", body })
    }),
    // A product file's preview, whose hashes guard the import against changes made in between.
    previewProductImport: build.mutation<ImportPreview, File>({
      query: (file) => ({ url: "supplier-catalog/import", method: "POST", body: fileForm(file, { mode: "preview" }) }),
      responseSchema: importPreviewSchema
    }),
    // False when the same file was imported before.
    importProducts: build.mutation<{ imported: boolean }, { file: File; revisionHash: string; fileHash: string }>({
      query: ({ file, ...hashes }) => ({
        url: "supplier-catalog/import",
        method: "POST",
        body: fileForm(file, { mode: "commit", ...hashes })
      }),
      responseSchema: z.object({ imported: z.boolean() })
    })
  })
})

export const {
  useAnswerProposalMutation,
  useAssignCatalogMutation,
  useDeleteCatalogMutation,
  useImportProductsMutation,
  usePreviewProductImportMutation,
  useProposeChangesMutation,
  useSaveCatalogMutation,
  useSaveProductMutation,
  useSaveStockMutation,
  useSetProductsActiveMutation,
  useSetTrackingMutation,
  useUploadProductImageMutation
} = supplierApi
