import { delay, http, HttpResponse } from "msw"
import { expect, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { amazonAccount, shopifyAccount, stockSync, storeSyncHandlers } from "@/stories/fixtures/logistics"
import { member } from "@/stories/workspace"
import { InventorySync, InventorySyncRow } from "./inventory-sync"

// The syncs Sync now started, in order.
const started: unknown[] = []

// A page of the product list with nothing on it, which is all these stories need of it.
const noProducts = {
  observedAt: null,
  needsResync: false,
  page: 1,
  pageSize: 25,
  totalPages: 0,
  totalProducts: 0,
  totalVariants: 0,
  missingBarcodes: 0,
  missingCountries: 0,
  duplicateSkus: [],
  products: [],
  amazonOnly: []
}

const meta = preview.meta({
  component: InventorySync,
  args: { providers: ["shopify", "amazon"] },
  beforeEach: ({ msw }) => {
    started.length = 0
    msw.use(
      ...storeSyncHandlers(),
      http.post("/api/inventory/refresh", async ({ request }) => {
        started.push(await request.json())
        return HttpResponse.json({ status: "queued" })
      }),
      http.get("/api/inventory/products", () => HttpResponse.json(noProducts)),
      http.get("/api/products/without-supplier", () => HttpResponse.json([]))
    )
  }
})

// Once a store has synced, its products are listed.
export const Synced = meta.story({
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("searchbox", { name: "Search products" })).toBeVisible()
    await expect(canvas.queryByRole("alert")).toBeNull()
  }
})

export const NoStore = meta.story({
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

// Only the owner and admins connect stores, so a member is told who can.
export const NoStoreMember = meta.story({
  args: { providers: [] },
  parameters: { permissions: member },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Ask an admin to connect one")).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Open settings" })).toBeNull()
  }
})

// A store whose last sync failed says so above the list, with a way to Settings for the owner and admins.
export const SyncFailed = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      ...storeSyncHandlers({
        stock: {
          awd: stockSync({ externalAccountId: amazonAccount, refresh: { status: "failed", errorCode: "reconnect" } })
        }
      })
    )
  },
  play: async ({ canvas }) => {
    const alert = await canvas.findByRole("alert")
    await expect(alert).toHaveTextContent("Amazon inventory didn’t sync")
    await expect(alert).toHaveTextContent("Sign-in expired")
    await expect(canvas.getByRole("button", { name: "Open settings" })).toHaveAttribute(
      "href",
      "/settings#integrations"
    )
  }
})

export const SyncFailedMember = meta.story({
  parameters: { permissions: member },
  beforeEach: ({ msw }) => {
    msw.use(
      ...storeSyncHandlers({
        stock: { shopify: stockSync({ refresh: { status: "failed", errorCode: "shopify_permissions" } }) }
      })
    )
  },
  play: async ({ canvas }) => {
    const alert = await canvas.findByRole("alert")
    await expect(alert).toHaveTextContent("Needs access to location names")
    await expect(canvas.queryByRole("button", { name: "Open settings" })).toBeNull()
  }
})

// The first sync is still running, so there's nothing to list yet.
export const FirstSync = meta.story({
  args: { providers: ["shopify"] },
  beforeEach: ({ msw }) => {
    msw.use(
      ...storeSyncHandlers({
        stock: { shopify: stockSync({ observedAt: null, refresh: { status: "running", errorCode: null } }) }
      })
    )
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Syncing your products")).toBeVisible()
    await expect(canvas.getByText("They appear when the sync finishes")).toBeVisible()
  }
})

export const NeverSynced = meta.story({
  args: { providers: ["shopify"] },
  beforeEach: ({ msw }) => {
    msw.use(...storeSyncHandlers({ stock: { shopify: stockSync({ observedAt: null }) } }))
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No products yet")).toBeVisible()
    await expect(canvas.getByText("They appear after the first sync")).toBeVisible()
  }
})

export const Loading = meta.story({
  args: { providers: ["shopify"] },
  beforeEach: ({ msw }) => {
    msw.use(http.get("/api/inventory", () => delay("infinite")))
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Loading products")).toBeInTheDocument()
  }
})

export const ShopifyRow = meta.story({
  render: () => <InventorySyncRow provider="shopify" />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Inventory" })).toBeVisible()
    await expect(await canvas.findByText(/^Synced/)).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Shopify inventory actions" }))
    await expect(screen.queryByRole("menuitem", { name: "Reconnect" })).toBeNull()
    await userEvent.click(await screen.findByRole("menuitem", { name: "Sync now" }))
    await waitFor(() => expect(started).toEqual([{ source: "shopify" }]))
  }
})

// Amazon is one source: its sync refreshes FBA and AWD together.
export const AmazonRow = meta.story({
  render: () => <InventorySyncRow provider="amazon" />,
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(/^Synced/)).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Amazon inventory actions" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Sync now" }))
    await waitFor(() => expect(started).toHaveLength(2))
    await expect(started).toEqual([{ source: "fba", marketplaceId: "ATVPDKIKX0DER" }, { source: "awd" }])
  }
})

// A sync that failed for lack of access offers to sign in again.
export const RowReconnect = meta.story({
  render: () => <InventorySyncRow provider="shopify" />,
  beforeEach: ({ msw }) => {
    msw.use(
      ...storeSyncHandlers({
        stock: { shopify: stockSync({ refresh: { status: "failed", errorCode: "shopify_permissions" } }) }
      })
    )
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Needs access to location names")).toHaveClass("text-destructive")
    await userEvent.click(canvas.getByRole("button", { name: "Shopify inventory actions" }))
    await expect(await screen.findByRole("menuitem", { name: "Reconnect" })).toHaveAttribute(
      "href",
      `/api/connections/shopify?shop=${shopifyAccount}`
    )
  }
})

export const RowSyncing = meta.story({
  render: () => <InventorySyncRow provider="shopify" />,
  beforeEach: ({ msw }) => {
    msw.use(...storeSyncHandlers({ stock: { shopify: stockSync({ refresh: { status: "queued", errorCode: null } }) } }))
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Syncing…")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Shopify inventory actions" }))
    await expect(await screen.findByRole("menuitem", { name: "Syncing…" })).toHaveAttribute("aria-disabled", "true")
  }
})

export const RowStartFails = meta.story({
  render: () => <InventorySyncRow provider="shopify" />,
  beforeEach: ({ msw }) => {
    msw.use(
      http.post("/api/inventory/refresh", () =>
        HttpResponse.json({ error: "A sync already started a minute ago." }, { status: 429 })
      )
    )
  },
  play: async ({ canvas }) => {
    await canvas.findByText(/^Synced/)
    await userEvent.click(canvas.getByRole("button", { name: "Shopify inventory actions" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Sync now" }))
    await expect(await canvas.findByText("A sync already started a minute ago.")).toHaveClass("text-destructive")
  }
})

export const RowNeverSynced = meta.story({
  render: () => <InventorySyncRow provider="shopify" />,
  beforeEach: ({ msw }) => {
    msw.use(...storeSyncHandlers({ stock: { shopify: stockSync({ observedAt: null }) } }))
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Not synced yet")).toBeVisible()
  }
})

export const RowStatusUnavailable = meta.story({
  render: () => <InventorySyncRow provider="shopify" />,
  beforeEach: ({ msw }) => {
    msw.use(http.get("/api/inventory", () => new HttpResponse(null, { status: 500 })))
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Status unavailable")).toBeVisible()
  }
})
