import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { ImportReview, type ReviewProduct } from "@/components/import-review"
import type { poImports } from "@/db/schema"
import { importProposalSchema } from "@/server/import-proposal"
import { daysAgo } from "@/stories/fixtures/orders"
import { builderSuppliers, importedProducts, importId, importProposal } from "@/stories/fixtures/purchase-orders"
import { pageStory } from "@/stories/server"
import { workspaces } from "@/stories/workspace"

type Args = {
  // The import in review, the buyer's suppliers, and the chosen products Shopify found (none while it's down).
  record: typeof poImports.$inferSelect
  suppliers: Array<{ id: string; name: string }>
  selectedProducts: Record<string, ReviewProduct>
}

// The import review page (page.tsx) for an import in review. One already saved opens its draft, and one not in review
// goes back to the imports.
async function ReviewImport({ record, suppliers, selectedProducts }: Args) {
  return (
    <ImportReview
      id={record.id}
      filename={record.filename}
      initialRevision={record.revision}
      initialProposal={importProposalSchema.parse(record.proposal)}
      initialSelectedProducts={selectedProducts}
      suppliers={suppliers}
    />
  )
}

const record: typeof poImports.$inferSelect = {
  id: importId,
  orgId: workspaces.buyer.id,
  createdBy: "user_story",
  objectKey: "imports/lotus-po-118.pdf",
  filename: "lotus-po-118.pdf",
  shopifyDomain: "harbor-goods.myshopify.com",
  amazonSellerId: null,
  status: "review",
  revision: 2,
  proposal: importProposal,
  promptVersion: 4,
  model: "reader",
  tokens: 5_200,
  error: null,
  orderId: null,
  createdAt: daysAgo(1),
  updatedAt: daysAgo(1)
}

const meta = preview.meta({
  title: "Pages/Purchase orders/Import review",
  ...pageStory(`/orders/import/${importId}`, ReviewImport),
  args: { record, suppliers: builderSuppliers, selectedProducts: importedProducts }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "lotus-po-118.pdf" })).toBeVisible()
    await expect(canvas.getByText("Canvas tote bag")).toBeVisible()
    await expect(canvas.getByText("No matching product")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Save draft" })).toBeEnabled()
  }
})

// Shopify couldn't be reached for the chosen product's details; it stays chosen.
export const CatalogOutage = meta.story({
  args: { selectedProducts: {} },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Product details unavailable")).toBeVisible()
    await expect(canvas.queryByText("Canvas tote bag")).toBeNull()
  }
})
