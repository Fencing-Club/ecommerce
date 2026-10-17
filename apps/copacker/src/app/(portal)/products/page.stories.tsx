import { http, HttpResponse } from "msw"
import { expect, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import type { ProductRow } from "@/components/supplier/product-index"
import { can, type Permissions } from "@/lib/access"
import { productsPage, supplierProducts, withoutSupplier } from "@/stories/fixtures/catalog"
import { daysAgo } from "@/stories/fixtures/orders"
import { pageStory } from "@/stories/server"
import { member, owner, type WorkspaceKind } from "@/stories/workspace"
import PageView from "./page"

type Args = {
  kind: WorkspaceKind
  permissions: Permissions
  products: ProductRow[]
  providers: Array<"amazon" | "ebay" | "shopify">
  q?: string | string[]
}
function ProductsPage({ kind, permissions, products, providers, q }: Args) {
  const page =
    kind === "supplier"
      ? {
          kind,
          editable: can(permissions, "products", "edit") && can(permissions, "prices"),
          products: products.map((product) => ({
            ...product,
            variants: product.variants.map((variant) => ({
              ...variant,
              priceMinor: can(permissions, "prices") ? variant.priceMinor : null
            }))
          }))
        }
      : { kind: "buyer" as const, providers, search: typeof q === "string" ? q.trim().slice(0, 200) : "" }
  return <PageView page={page} />
}

const buyer = pageStory("/products", ProductsPage, "buyer")
const supplier = pageStory("/products", ProductsPage, "supplier")

// A store's inventory sync status, as the page polls it.
function syncStatus(refresh: { status: string; errorCode: string | null }, observedAt: string | null) {
  return http.get("/api/inventory", () =>
    HttpResponse.json({ externalAccountId: "harbor-goods.myshopify.com", observedAt, refresh })
  )
}

const synced = syncStatus({ status: "idle", errorCode: null }, daysAgo(0).toISOString())

const meta = preview.meta({
  title: "Pages/Shared/Products",
  // Each story renders its workspace's page, whose loaders and portal come with it.
  render: buyer.render,
  args: {
    kind: "buyer",
    permissions: owner,
    products: supplierProducts,
    providers: ["shopify", "amazon"]
  } satisfies Args,
  beforeEach: ({ msw }) => {
    msw.use(
      synced,
      http.get("/api/inventory/products", () => HttpResponse.json(productsPage())),
      http.get("/api/products/without-supplier", () => HttpResponse.json(withoutSupplier))
    )
  }
})

export const Buyer = meta.story({
  ...buyer,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Products" })).toBeVisible()
    await expect(await canvas.findByRole("button", { name: "Canvas tote bag" })).toBeVisible()
    await expect(canvas.getByRole("button", { name: /3 products have no supplier/ })).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Upload barcodes" })).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Manage labels" })).toBeVisible()
  }
})

// A product chosen in the header's search opens the list searched for it.
export const BuyerSearch = meta.story({
  ...buyer,
  args: { q: "  tote  " },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("searchbox", { name: "Search products" })).toHaveValue("tote")
  }
})

export const BuyerSyncing = meta.story({
  ...buyer,
  args: { providers: ["shopify"] },
  beforeEach: ({ msw }) => {
    msw.use(syncStatus({ status: "running", errorCode: null }, null))
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Syncing your products")).toBeVisible()
    await expect(canvas.getByText("They appear when the sync finishes")).toBeVisible()
  }
})

export const BuyerNotSynced = meta.story({
  ...buyer,
  args: { providers: ["shopify"] },
  beforeEach: ({ msw }) => {
    msw.use(syncStatus({ status: "idle", errorCode: null }, null))
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No products yet")).toBeVisible()
  }
})

// A failed sync says so above the list, with a way to Settings for an admin.
export const BuyerSyncFailed = meta.story({
  ...buyer,
  args: { providers: ["shopify"] },
  beforeEach: ({ msw }) => {
    msw.use(syncStatus({ status: "failed", errorCode: "reconnect" }, daysAgo(3).toISOString()))
  },
  play: async ({ canvas }) => {
    const alert = await canvas.findByRole("alert")
    await expect(alert).toHaveTextContent("Shopify inventory didn’t sync")
    await expect(alert).toHaveTextContent("Sign-in expired")
    await expect(within(alert).getByRole("button", { name: "Open settings" })).toHaveAttribute(
      "href",
      "/settings#integrations"
    )
    // What synced before still shows.
    await expect(await canvas.findByRole("button", { name: "Canvas tote bag" })).toBeVisible()
  }
})

export const BuyerWithoutStore = meta.story({
  ...buyer,
  args: { providers: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No store connected")).toBeVisible()
    await expect(canvas.getByText("Connect Shopify or Amazon to see your products")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Open settings" })).toHaveAttribute(
      "href",
      "/settings#integrations"
    )
  }
})

export const BuyerWithoutStoreForMember = meta.story({
  ...buyer,
  args: { providers: [], permissions: member },
  parameters: { ...buyer.parameters, permissions: member },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Ask an admin to connect one")).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Open settings" })).toBeNull()
  }
})

export const Supplier = meta.story({
  ...supplier,
  args: { kind: "supplier" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Products" })).toBeVisible()
    await expect(canvas.getByRole("button", { name: /Add product/ })).toHaveAttribute("href", "/products/new")
    await expect(canvas.getByText("Canvas tote bag")).toBeVisible()
    await expect(canvas.getByText("$4.25 – $4.50")).toBeInTheDocument()
    await userEvent.click(canvas.getByRole("tab", { name: /Archived/ }))
    await waitFor(() => expect(canvas.queryByText("Canvas tote bag")).toBeNull())
    await expect(canvas.getByText("Linen apron")).toBeVisible()

    await userEvent.click(canvas.getByRole("button", { name: "More actions" }))
    await expect(await screen.findByRole("menuitem", { name: "Import products" })).toBeInTheDocument()
    await expect(screen.getByRole("menuitem", { name: "Export to Excel" })).toHaveAttribute(
      "href",
      "/api/supplier-catalog/export?format=xlsx"
    )
  }
})

// A member who views products without prices: no prices, no Add product, and only the template to download.
export const SupplierForMember = meta.story({
  ...supplier,
  args: { kind: "supplier", permissions: { role: "member", access: { products: "view" } } },
  parameters: { ...supplier.parameters, permissions: { role: "member", access: { products: "view" } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Canvas tote bag")).toBeVisible()
    await expect(canvas.queryByRole("button", { name: /Add product/ })).toBeNull()
    await expect(canvas.queryByText("$4.25 – $4.50")).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "More actions" }))
    await expect(await screen.findByRole("menuitem", { name: "Download template" })).toBeInTheDocument()
    await expect(screen.queryByRole("menuitem", { name: "Import products" })).toBeNull()
    await expect(screen.queryByRole("menuitem", { name: "Export to Excel" })).toBeNull()
  }
})

export const SupplierWithoutProducts = meta.story({
  ...supplier,
  args: { kind: "supplier", products: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Add your first product")).toBeVisible()
    // The empty list offers the first product, so the header doesn't offer it again.
    await expect(canvas.getAllByText("Add product")).toHaveLength(1)
  }
})
