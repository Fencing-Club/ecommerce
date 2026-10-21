import { http, HttpResponse } from "msw/http"
import { useState } from "react"
import { expect, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { type EditorProduct } from "@/components/supplier/product-editor"
import { can, type Permissions } from "@/lib/access"
import { editorProduct } from "@/stories/fixtures/catalog"
import { pageStory } from "@/stories/server"
import { owner } from "@/stories/workspace"
import PageView from "./page"

type Catalog = { id: string; title: string; status: "active" | "draft" | "archived" }

// A supplier's product page (page.tsx) for the product the database holds. A buyer's is redirected to Products, and a
// product that isn't the supplier's is not found.
function ProductPage({
  product,
  catalogs,
  permissions
}: {
  product: EditorProduct
  catalogs: Catalog[]
  permissions: Permissions
}) {
  // Someone who doesn't see prices gets the product without them, only to view: saving it would clear them.
  const prices = can(permissions, "prices")
  const initial: EditorProduct = {
    ...product,
    variants: product.variants.map((variant) => ({
      ...variant,
      priceMinor: prices ? variant.priceMinor : null,
      priceBreaks: prices ? variant.priceBreaks : []
    }))
  }
  return (
    <PageView
      key={product.revision}
      page={{ initial: initial, catalogs: catalogs, readOnly: !prices || !can(permissions, "products", "edit") }}
    />
  )
}

const catalogs: Catalog[] = [
  { id: "c7d1a4e0-2b3f-4c5d-8e9f-000000000001", title: "Wholesale 2026", status: "active" },
  { id: "c7d1a4e0-2b3f-4c5d-8e9f-000000000002", title: "Holiday preview", status: "draft" }
]
const viewer: Permissions = { role: "member", access: { products: "view" } }

// The products each story saved.
let saved: unknown[] = []

const meta = preview.meta({
  title: "Pages/Products/Detail",
  ...pageStory(`/products/${editorProduct.id}`, ProductPage, "supplier"),
  args: { product: editorProduct, catalogs, permissions: owner },
  beforeEach: ({ msw }) => {
    saved = []
    msw.use(
      http.post("/api/supplier-catalog/products", async ({ request }) => {
        saved.push(await request.json())
        return HttpResponse.json({ id: editorProduct.id })
      })
    )
  }
})

function ProductRevision() {
  const [initial, setInitial] = useState(editorProduct)
  return (
    <>
      <button
        onClick={() =>
          setInitial({
            ...editorProduct,
            revision: (editorProduct.revision ?? 0) + 1,
            title: "Updated by another editor"
          })
        }
      >
        Load saved revision
      </button>
      <PageView page={{ initial, catalogs, readOnly: false }} />
    </>
  )
}

export const SavedRevision = meta.story({
  ...pageStory(`/products/${editorProduct.id}`, () => <ProductRevision />, "supplier"),
  play: async ({ canvas }) => {
    const title = canvas.getByRole("textbox", { name: "Title" })
    await userEvent.clear(title)
    await userEvent.type(title, "Unsaved title")
    await userEvent.click(canvas.getByRole("button", { name: "Load saved revision" }))
    await expect(canvas.getByRole("textbox", { name: "Title" })).toHaveValue("Updated by another editor")
    await expect(canvas.queryByRole("region", { name: "Unsaved changes" })).toBeNull()
  }
})

export const Edit = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: /Canvas tote bag/ })).toBeVisible()
    await expect(canvas.getByRole("link", { name: "Wholesale 2026" })).toHaveAttribute(
      "href",
      "/catalogs/c7d1a4e0-2b3f-4c5d-8e9f-000000000001"
    )
    await expect(canvas.getByText("Holiday preview")).toBeVisible()
    await expect(canvas.queryByRole("region", { name: "Unsaved changes" })).toBeNull()

    const title = canvas.getByRole("textbox", { name: "Title" })
    await userEvent.clear(title)
    await userEvent.type(title, "Canvas market tote")
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalled())
    await expect(saved).toEqual([
      expect.objectContaining({ id: editorProduct.id, revision: 4, title: "Canvas market tote" })
    ])
    await expect(canvas.queryByRole("region", { name: "Unsaved changes" })).toBeNull()
  }
})

export const DiscardChanges = meta.story({
  play: async ({ canvas }) => {
    const title = canvas.getByRole("textbox", { name: "Title" })
    await userEvent.type(title, " XL")
    await userEvent.click(canvas.getByRole("button", { name: "Discard" }))
    await expect(title).toHaveValue("Canvas tote bag")
    await expect(saved).toEqual([])
  }
})

// A member who can view products but not prices sees the product without them, turned off.
export const ViewOnly = meta.story({
  args: { permissions: viewer },
  parameters: { permissions: viewer },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("textbox", { name: "Title" })).toBeDisabled()
    await expect(canvas.queryByRole("textbox", { name: /^Price for/ })).toBeNull()
    await expect(canvas.queryByText("$4.25")).toBeNull()
  }
})
