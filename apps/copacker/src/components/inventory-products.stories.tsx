import { delay, http, HttpResponse, type JsonBodyType } from "msw"
import { expect, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { amazonOnlyStock, listedProducts, productsPage } from "@/stories/fixtures/catalog"
import { member } from "@/stories/workspace"
import { InventoryProducts, IssuePanel, ProductsSkeleton } from "./inventory-products"

// The products API's queries, in order, as each story's list asked for them.
let queries: Record<string, string>[] = []

function productsApi(page: (query: Record<string, string>) => JsonBodyType) {
  return http.get("/api/inventory/products", ({ request }) => {
    const query = Object.fromEntries(new URL(request.url).searchParams)
    queries.push(query)
    return HttpResponse.json(page(query))
  })
}

const [tote, apron] = listedProducts

const meta = preview.meta({
  component: InventoryProducts,
  args: { syncKey: "synced", search: "" },
  beforeEach: ({ msw }) => {
    queries = []
    msw.use(productsApi(() => productsPage()))
  }
})

export const Products = meta.story({
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("button", { name: "Canvas tote bag" })).toBeVisible()
    await expect(queries).toEqual([{ page: "1", pageSize: "25" }])
    await expect(canvas.getByText("2 variations")).toBeVisible()
    await expect(canvas.getByText("1 without country of origin")).toBeVisible()
    // An uploaded label is missing for the apron, which isn't stocked at Amazon.
    await expect(canvas.getByText("APRON-CHR, not stocked at Amazon")).toBeVisible()
    await expect(canvas.getByText("Label missing")).toBeVisible()
    await expect(canvas.getByText("GIFT, not tracked")).toBeVisible()
    await expect(canvas.getByText("BASKET-2, bundle")).toBeVisible()
    await expect(canvas.getAllByText("Not tracked")).toHaveLength(3)
    await expect(canvas.getByRole("link", { name: "PO-1045" })).toHaveAttribute("href", "/orders/order-PO-1045")
    await expect(canvas.getByText("4 products, 5 variations")).toBeVisible()
    await expect(canvas.getByRole("button", { name: /1 need a label/ })).toHaveAttribute("aria-pressed", "false")
    // The toolbar's filters and actions are as tall as its search box.
    const searchBox = canvas.getByRole("searchbox", { name: "Search products" }).closest("[data-slot=input-group]")
    await expect(canvas.getByRole("button", { name: /1 need a label/ }).offsetHeight).toBe(
      searchBox instanceof HTMLElement ? searchBox.offsetHeight : 0
    )

    // A product's variations open beneath it.
    await userEvent.click(canvas.getByRole("button", { name: "Show the 2 variations of Canvas tote bag" }))
    await expect(canvas.getByText("TOTE-NAT, Amazon min 50")).toBeVisible()
    await expect(canvas.getByText("Harbor Warehouse")).toBeVisible()
    await expect(canvas.getByText("No country of origin")).toBeVisible()
    await expect(canvas.getByText("-4")).toHaveClass("text-destructive")
    await userEvent.click(canvas.getByRole("button", { name: "Hide the 2 variations of Canvas tote bag" }))
    await expect(canvas.queryByText("TOTE-NAT, Amazon min 50")).toBeNull()
  }
})

export const RowActions = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "More for Canvas tote bag" }))
    const variants = new URLSearchParams(tote!.variants.map((variant) => ["variant", variant.variantId]))
    await expect(await screen.findByRole("menuitem", { name: "Reorder" })).toHaveAttribute(
      "href",
      `/orders/new?${variants}`
    )
    await userEvent.click(screen.getByRole("menuitem", { name: "Edit" }))
    const details = await screen.findByRole("dialog", { name: "Canvas tote bag" })
    await waitFor(() => expect(within(details).getByText("2 variations")).toBeVisible())
  }
})

// Clicking a product opens its details.
export const OpenDetails = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Linen apron" }))
    const details = await screen.findByRole("dialog", { name: "Linen apron" })
    await waitFor(() => expect(within(details).getByText("APRON-CHR")).toBeVisible())
    await userEvent.click(within(details).getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  }
})

export const Search = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      productsApi((query) =>
        query.q ? productsPage({ products: [apron], totalProducts: 1, totalVariants: 1 }) : productsPage()
      )
    )
  },
  play: async ({ canvas }) => {
    await canvas.findByRole("button", { name: "Canvas tote bag" })
    await userEvent.type(canvas.getByRole("searchbox", { name: "Search products" }), "apron")
    await waitFor(() => expect(canvas.queryByRole("button", { name: "Canvas tote bag" })).toBeNull())
    await expect(queries.at(-1)).toEqual({ page: "1", pageSize: "25", q: "apron" })
    // A filtered list counts products only.
    await expect(canvas.getByText("1 product")).toBeVisible()
  }
})

// A header search opens the list already searched.
export const StartedFromSearch = meta.story({
  args: { search: "tote" },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("searchbox", { name: "Search products" })).toHaveValue("tote")
    await expect(queries[0]).toEqual({ page: "1", pageSize: "25", q: "tote" })
  }
})

export const NeedLabelFilter = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      productsApi((query) =>
        query.barcode === "missing"
          ? productsPage({ products: [apron], totalProducts: 1, missingCountries: 0 })
          : productsPage()
      )
    )
  },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole("button", { name: /1 need a label/ }))
    await waitFor(() => expect(canvas.queryByRole("button", { name: "Canvas tote bag" })).toBeNull())
    await expect(queries.at(-1)).toEqual({ page: "1", pageSize: "25", barcode: "missing" })
    await expect(canvas.getByRole("button", { name: /1 need a label/ })).toHaveAttribute("aria-pressed", "true")
    // No product left in the list lacks a country.
    await expect(canvas.queryByRole("button", { name: /without a country/ })).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: /1 need a label/ }))
    await expect(await canvas.findByRole("button", { name: "Canvas tote bag" })).toBeVisible()
  }
})

export const CountryFilter = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole("button", { name: /1 without a country/ }))
    await waitFor(() => expect(queries.at(-1)).toEqual({ page: "1", pageSize: "25", country: "missing" }))
  }
})

export const Pages = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      productsApi((query) =>
        productsPage({ page: Number(query.page), totalPages: 3, totalProducts: 60, totalVariants: 75 })
      )
    )
  },
  play: async ({ canvas }) => {
    const pages = await canvas.findByRole("navigation", { name: "Product pages" })
    await expect(within(pages).getByText("Page 1 of 3")).toBeVisible()
    await expect(within(pages).getByRole("button", { name: "Previous page" })).toBeDisabled()
    await userEvent.click(within(pages).getByRole("button", { name: "Next page" }))
    await expect(await within(pages).findByText("Page 2 of 3")).toBeVisible()
    await expect(queries.at(-1)).toEqual({ page: "2", pageSize: "25" })

    // A new page size starts again at the first page.
    await userEvent.click(canvas.getByRole("combobox", { name: "Rows per page" }))
    await userEvent.click(await screen.findByRole("option", { name: "50" }))
    await waitFor(() => expect(queries.at(-1)).toEqual({ page: "1", pageSize: "50" }))
  }
})

export const Problems = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      productsApi(() =>
        productsPage({
          needsResync: true,
          duplicateSkus: [
            {
              sku: "TOTE-NAT",
              variants: [
                { variantId: "gid://shopify/ProductVariant/1001", product: "Canvas tote bag", variant: "Natural" },
                { variantId: "gid://shopify/ProductVariant/1099", product: "Tote bag sample", variant: null }
              ]
            }
          ],
          amazonOnly: amazonOnlyStock
        })
      )
    )
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Sync Shopify to load the latest product details")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: /1 SKU is used by more than one variation/ }))
    await expect(await canvas.findByText("Canvas tote bag, Natural")).toBeVisible()
    await expect(canvas.getByText("Tote bag sample")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: /1 Amazon SKU doesn't match a Shopify product/ }))
    await expect(await canvas.findByText("amzn.gr.TOTE-NAT-used")).toBeVisible()
    await expect(canvas.getByRole("columnheader", { name: "AWD available" })).toBeVisible()
  }
})

export const Empty = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      productsApi(() => productsPage({ products: [], totalProducts: 0, missingBarcodes: 0, missingCountries: 0 }))
    )
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No products")).toBeVisible()
    await expect(canvas.queryByRole("table")).toBeNull()
  }
})

export const NoMatch = meta.story({
  args: { search: "wool" },
  beforeEach: ({ msw }) => {
    msw.use(productsApi(() => productsPage({ products: [], totalProducts: 0 })))
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No products match")).toBeVisible()
  }
})

export const Loading = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      http.get("/api/inventory/products", async () => {
        await delay("infinite")
        return HttpResponse.json(productsPage())
      })
    )
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Loading products")).toBeInTheDocument()
  }
})

// A failed load offers to try again.
export const LoadFailed = meta.story({
  beforeEach: ({ msw }) => {
    let attempts = 0
    msw.use(
      http.get("/api/inventory/products", () => {
        attempts += 1
        return attempts === 1 ? new HttpResponse(null, { status: 500 }) : HttpResponse.json(productsPage())
      })
    )
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Products couldn’t be loaded.")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }))
    await expect(await canvas.findByRole("button", { name: "Canvas tote bag" })).toBeVisible()
  }
})

// A member who only views products sees no uploads or row actions; labels still download.
export const ForMember = meta.story({
  parameters: { permissions: member },
  play: async ({ canvas }) => {
    await canvas.findByRole("button", { name: "Canvas tote bag" })
    await expect(canvas.queryByRole("button", { name: "Upload barcodes" })).toBeNull()
    await expect(canvas.queryByRole("button", { name: "More for Canvas tote bag" })).toBeNull()
    await expect(canvas.getByRole("button", { name: "Manage labels" })).toBeVisible()
  }
})

export const Skeleton = meta.story({
  render: () => <ProductsSkeleton />,
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText("Loading products")).toBeInTheDocument()
    await expect(canvasElement.querySelector("[aria-busy=true]")).not.toBeNull()
  }
})

export const Issue = meta.story({
  render: () => (
    <IssuePanel title="2 products have no supplier" hint="Restock skips them">
      <p className="p-4">Linen apron</p>
    </IssuePanel>
  ),
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("button", { name: /2 products have no supplier/ })
    await expect(canvas.queryByText("Linen apron")).toBeNull()
    await userEvent.click(trigger)
    await expect(canvas.getByText("Linen apron")).toBeVisible()
    await expect(trigger).toHaveAttribute("aria-expanded", "true")
  }
})
