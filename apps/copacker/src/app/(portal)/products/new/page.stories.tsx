import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { http, HttpResponse } from "msw"
import { expect, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { blankProduct, ProductEditor } from "@/components/supplier/product-editor"
import { pageStory } from "@/stories/server"

// A supplier's Add product page (page.tsx), which starts from a blank product. A buyer's is redirected to Products.
async function NewProductPage() {
  return <ProductEditor initial={blankProduct()} />
}

// The products each story saved.
let saved: unknown[] = []

const meta = preview.meta({
  title: "Pages/Products/New",
  ...pageStory("/products/new", NewProductPage, "supplier"),
  beforeEach: ({ msw }) => {
    saved = []
    msw.use(
      http.post("/api/supplier-catalog/products", async ({ request }) => {
        saved.push(await request.json())
        return HttpResponse.json({ id: "7a3e1c52-1d0b-4b8f-9d3e-0000000000a9" })
      })
    )
  }
})

export const AddProduct = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: /Add product/ })).toBeVisible()
    const page = within(canvas.getByRole("main"))
    await expect(page.getByRole("link", { name: "Products" })).toHaveAttribute("href", "/products")
    const bar = canvas.getByRole("region", { name: "Unsaved changes" })

    // A product needs a title and every variant a SKU before it saves.
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await expect(bar).toHaveTextContent("Add a title")
    await userEvent.type(canvas.getByRole("textbox", { name: "Title" }), "Market basket")
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await expect(bar).toHaveTextContent("Give every variant a SKU")
    await expect(saved).toEqual([])

    await userEvent.type(canvas.getByRole("textbox", { name: "SKU for new variant" }), "LM-BASKET-L")
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(getRouter().replace).toHaveBeenCalledWith("/products/7a3e1c52-1d0b-4b8f-9d3e-0000000000a9")
    )
    await expect(saved).toEqual([
      expect.objectContaining({
        title: "Market basket",
        status: "active",
        variants: [expect.objectContaining({ supplierSku: "LM-BASKET-L", options: {}, notes: null })]
      })
    ])
  }
})

// Discarding a new product goes back to the list.
export const Discard = meta.story({
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole("textbox", { name: "Title" }), "Market basket")
    await userEvent.click(canvas.getByRole("button", { name: "Discard" }))
    await expect(getRouter().push).toHaveBeenCalledWith("/products")
  }
})

export const SaveFailed = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      http.post("/api/supplier-catalog/products", () =>
        HttpResponse.json({ error: "Another product uses the SKU LM-BASKET-L" }, { status: 409 })
      )
    )
  },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole("textbox", { name: "Title" }), "Market basket")
    await userEvent.type(canvas.getByRole("textbox", { name: "SKU for new variant" }), "LM-BASKET-L")
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await expect(await canvas.findByText("Another product uses the SKU LM-BASKET-L")).toBeVisible()
    await expect(getRouter().replace).not.toHaveBeenCalled()
  }
})
