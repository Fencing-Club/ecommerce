import { http, HttpResponse } from "msw"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import {
  type ActionRequest,
  amazonAccount,
  ebayAccount,
  recordActions,
  salesSync,
  shopifyAccount,
  stockSync,
  storeSyncHandlers
} from "@/stories/fixtures/logistics"
import { IntegrationSyncSection } from "./integration-panel"
import { Integrations } from "./integrations"

const sent: ActionRequest[] = []
// The Shopify address a valid Connect form sends to Shopify's approval, kept instead of leaving the story.
const connectShopify = fn()

const shopify = { account: "Harbor Goods", externalId: shopifyAccount }
const amazon = {
  account: "Harbor Goods US",
  externalId: amazonAccount,
  marketplaces: ["United States", "Canada"]
}
const ebay = { account: ebayAccount, externalId: ebayAccount }

const meta = preview.meta({
  component: Integrations,
  args: {
    admin: true,
    amazonAdsAvailable: true,
    shopify: null,
    amazon: null,
    ebay: null,
    shopifySettings: <IntegrationSyncSection store="shopify" />,
    amazonSettings: <IntegrationSyncSection store="amazon" />,
    ebaySettings: <IntegrationSyncSection store="ebay" />
  },
  beforeEach: ({ msw }) => {
    sent.length = 0
    msw.use(recordActions(sent), ...storeSyncHandlers())
    // A form that passed its checks goes to Shopify; the story keeps it here instead.
    const submitted = (event: SubmitEvent) => {
      if (!event.defaultPrevented && event.target instanceof HTMLFormElement) {
        event.preventDefault()
        connectShopify(event.target.action, new FormData(event.target).get("shop"))
      }
    }
    window.addEventListener("submit", submitted)
    return () => window.removeEventListener("submit", submitted)
  }
})

export const AmazonAdsNotConnected = meta.story({
  args: { amazon },
  play: async ({ canvas }) => {
    const card = await canvas.findByRole("link", { name: "Connect Amazon Ads" })
    await expect(canvas.getByRole("article", { name: "Amazon Ads" })).toHaveTextContent("Not connected")
    await expect(card).toHaveAttribute("href", "/api/connections/amazon-ads")
    await expect(canvas.queryByRole("button", { name: "Manage Amazon Ads" })).toBeNull()
  }
})

export const AmazonAdsConnected = meta.story({
  args: { amazon },
  beforeEach: ({ msw }) =>
    msw.use(
      http.get("/api/connections/amazon-ads", () =>
        HttpResponse.json({ connected: true, active: false, failed: false })
      )
    ),
  play: async ({ canvas }) => {
    await canvas.findByRole("button", { name: "Manage Amazon Ads" })
    const card = canvas.getByRole("article", { name: "Amazon Ads" })
    await expect(await within(card).findByRole("heading", { name: "Amazon Ads" })).toBeVisible()
    await waitFor(() => expect(within(card).getAllByText("Connected")).toHaveLength(1))
    await userEvent.click(within(card).getByRole("button", { name: "Manage Amazon Ads" }))
    const sheet = await screen.findByRole("dialog", { name: "Amazon Ads" })
    await waitFor(() => expect(within(sheet).getByRole("heading", { name: "Ad spend" })).toBeVisible())
    await expect(within(sheet).getByRole("button", { name: "Sync ad spend" })).toBeEnabled()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(within(card).getByRole("button", { name: "Manage Amazon Ads" })).toHaveFocus())
  }
})

// All implemented stores offer a connection action.
export const NothingConnected = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Connect Shopify" })).toHaveTextContent("Connect")
    await expect(canvas.getByRole("button", { name: "Connect Amazon" })).toHaveTextContent("Connect")
    await expect(canvas.getByText("eBay")).toBeVisible()
    await expect(canvas.getByText("Orders, inventory, expenses, shipments")).toBeVisible()
    await expect(canvas.getByRole("link", { name: "Connect eBay" })).toHaveAttribute("href", "/api/connections/ebay")
  }
})

// eBay connects through its sign-in and consent page.
export const EbayNotConnected = meta.story({
  args: {},
  play: async ({ canvas }) => {
    const card = canvas.getByRole("link", { name: "Connect eBay" })
    await expect(card).toHaveAttribute("href", "/api/connections/ebay")
    await expect(canvas.getByRole("article", { name: "eBay" })).toHaveTextContent("Orders, expenses")
    await expect(card).toHaveTextContent("Connect")
  }
})

// A member sees eBay isn't connected, without connecting it.
export const EbayNotConnectedMember = meta.story({
  args: { admin: false },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getAllByText("Not connected")).toHaveLength(4))
    await expect(canvas.queryByRole("link")).toBeNull()
  }
})

// A connected eBay account opens its settings: its orders only, since eBay sells the stock Shopify tracks.
export const EbayConnected = meta.story({
  args: { ebay },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(ebayAccount)).toBeVisible()
    await expect(await canvas.findByText(/^Synced/)).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Manage eBay" }))
    const sheet = await screen.findByRole("dialog", { name: "eBay" })
    await expect(within(sheet).getByRole("button", { name: "Sync eBay orders" })).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole("button", { name: "Disconnect" }))
    const confirm = await screen.findByRole("alertdialog", { name: "Disconnect eBay?" })
    await expect(confirm).toHaveTextContent(`Copacker stops reading sales from ${ebayAccount}.`)
    await userEvent.click(within(confirm).getByRole("button", { name: "Disconnect" }))
    await waitFor(() => expect(sent).toEqual([{ action: "connection.delete", data: { provider: "ebay" } }]))
  }
})

export const EbayConnectedMember = meta.story({
  args: { admin: false, ebay },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Connected")).toBeVisible()
    // A connection's state renders as a status badge: connected is done.
    await expect(canvas.getByText("Connected").closest("[data-slot=status]")).toHaveAttribute("data-tone", "success")
    await expect(canvas.getByText(ebayAccount)).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Manage eBay" })).toBeNull()
  }
})

// eBay's card says while its orders sync, and when the last sync failed; it has no inventory sync.
export const EbaySyncing = meta.story({
  args: { ebay },
  beforeEach: ({ msw }) => {
    msw.use(
      ...storeSyncHandlers({
        sales: [salesSync("ebay", { status: "running", progress: null, finishedAt: null })],
        stock: { shopify: stockSync({ refresh: { status: "running", errorCode: null } }) }
      })
    )
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Syncing orders")).toBeVisible()
    await expect(canvas.queryByText("Syncing inventory")).toBeNull()
  }
})

export const EbaySyncFailed = meta.story({
  args: { ebay },
  beforeEach: ({ msw }) => {
    msw.use(...storeSyncHandlers({ sales: [salesSync("ebay", { status: "failed", errorCode: "reconnect" })] }))
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Last sync failed")).toBeVisible()
  }
})

export const ShopifySignInExpired = meta.story({
  args: {
    shopify,
    shopifySettings: <IntegrationSyncSection store="shopify" />
  },
  beforeEach: ({ msw }) => {
    msw.use(
      ...storeSyncHandlers({
        sales: [salesSync("shopify", { status: "failed", errorCode: "reconnect" })],
        stock: { shopify: stockSync({ refresh: { status: "failed", errorCode: "reconnect" } }) }
      })
    )
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Manage Shopify" }))
    const sheet = await screen.findByRole("dialog", { name: "Shopify" })
    await waitFor(() => expect(within(sheet).getAllByRole("link", { name: "Reconnect" })).toHaveLength(2))
    for (const link of within(sheet).getAllByRole("link", { name: "Reconnect" })) {
      await expect(link).toHaveAttribute("href", `/api/connections/shopify?shop=${shopifyAccount}`)
    }
    await expect(within(sheet).queryByRole("button", { name: "Sync Shopify orders" })).toBeNull()
    await expect(within(sheet).queryByRole("button", { name: "Sync Shopify inventory" })).toBeNull()
    await expect(within(sheet).getAllByText("Reconnect to resume syncing.")).toHaveLength(2)
  }
})

// Shopify's card asks for the store's address and checks it before going to Shopify.
export const ConnectShopify = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Connect Shopify" }))
    const dialog = await screen.findByRole("dialog", { name: "Connect Shopify" })
    await expect(dialog).toHaveTextContent("Admin link or myshopify.com domain")
    await userEvent.click(within(dialog).getByRole("button", { name: "Connect" }))
    await expect(
      await within(dialog).findByText("Enter your store’s admin link or myshopify.com domain")
    ).toBeInTheDocument()
    const store = within(dialog).getByRole("textbox", { name: "Store" })
    await userEvent.type(store, "harbor goods")
    await userEvent.click(within(dialog).getByRole("button", { name: "Connect" }))
    await expect(within(dialog).getByRole("textbox", { name: "Store" })).toHaveAttribute("aria-invalid", "true")
    await expect(connectShopify).not.toHaveBeenCalled()
    // Typing clears the error; an admin link is read as its store.
    await userEvent.clear(store)
    await expect(within(dialog).queryByText(/Enter your store/)).toBeNull()
    await userEvent.type(store, "https://admin.shopify.com/store/harbor-goods/products")
    await userEvent.click(within(dialog).getByRole("button", { name: "Connect" }))
    await expect(connectShopify).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/connections\/shopify$/),
      "https://admin.shopify.com/store/harbor-goods/products"
    )
  }
})

// Amazon connects through a marketplace-specific sign-in.
export const ConnectAmazon = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("link", { name: "Connect Amazon" })).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "Connect Amazon" }))
    const dialog = await screen.findByRole("dialog", { name: "Connect Amazon" })
    await expect(dialog).toHaveTextContent("Choose your marketplace")
  }
})

// Members see which stores aren't connected, without connecting them.
export const MemberNothingConnected = meta.story({
  args: { admin: false },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getAllByText("Not connected")).toHaveLength(3))
    await expect(canvas.queryByRole("button")).toBeNull()
    await expect(canvas.queryByRole("link")).toBeNull()
  }
})

export const Connected = meta.story({
  args: { shopify, amazon },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText("Connected")).toHaveLength(2)
    await expect(canvas.getByText("2 marketplaces")).toBeVisible()
    await expect(canvas.getByText("Harbor Goods")).toBeVisible()
    await expect(canvas.getByText(shopifyAccount)).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Manage Shopify" })).toHaveTextContent("Manage")
    await expect(await canvas.findAllByText(/^Synced/)).toHaveLength(2)
    await userEvent.click(canvas.getByRole("button", { name: "Manage Shopify" }))
    const sheet = await screen.findByRole("dialog", { name: "Shopify" })
    await expect(within(sheet).getByRole("button", { name: "Sync Shopify orders" })).toBeInTheDocument()
    await expect(within(sheet).queryByRole("button", { name: "Sync Amazon orders" })).toBeNull()
  }
})

export const AmazonMarketplacesUnavailable = meta.story({
  args: { amazon: { ...amazon, marketplaces: null } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Temporarily unavailable")).toBeVisible()
    await expect(canvas.getByText("Couldn’t load from Amazon")).toBeVisible()
    await expect(canvas.queryByText("United States")).toBeNull()
  }
})

export const AmazonNoMarketplaces = meta.story({
  args: { amazon: { ...amazon, marketplaces: [] } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No supported marketplaces")).toBeVisible()
  }
})

export const AmazonMarketplacesMember = meta.story({
  args: { admin: false, amazon },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("2 marketplaces")).toBeVisible()
    await expect(canvas.getByText("United States, Canada")).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Manage Amazon" })).toBeNull()
  }
})

export const ManyMarketplaces = meta.story({
  args: { amazon: { ...amazon, marketplaces: ["United States", "Canada", "Mexico", "Brazil"] } },
  play: async ({ canvas }) => {
    const card = canvas.getByRole("article", { name: "Amazon" })
    await expect(within(card).getByText("4 marketplaces")).toBeVisible()
    await expect(within(card).queryByText("Brazil")).toBeNull()
    await userEvent.click(within(card).getByRole("button", { name: "Manage Amazon" }))
    const sheet = await screen.findByRole("dialog", { name: "Amazon" })
    for (const marketplace of ["United States", "Canada", "Mexico", "Brazil"]) {
      await waitFor(() => expect(within(sheet).getByText(marketplace)).toBeVisible())
    }
  }
})

export const LongStoreName = meta.story({
  args: { shopify: { ...shopify, account: "Harbor Goods, Home and Outdoor Supplies International" } },
  play: async ({ canvas }) => {
    const card = canvas.getByRole("article", { name: "Shopify" })
    await expect(within(card).getByText("Harbor Goods, Home and Outdoor Supplies International")).toHaveAttribute(
      "title",
      "Harbor Goods, Home and Outdoor Supplies International"
    )
    await expect(within(card).getByText(shopifyAccount)).toBeVisible()
    await expect(within(card).getByRole("button", { name: "Manage Shopify" })).toBeVisible()
  }
})

export const Disconnect = meta.story({
  args: { shopify, amazon },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Manage Amazon" }))
    const sheet = await screen.findByRole("dialog", { name: "Amazon" })
    await userEvent.click(within(sheet).getByRole("button", { name: "Disconnect" }))
    const confirm = await screen.findByRole("alertdialog", { name: "Disconnect Amazon?" })
    await expect(confirm).toHaveTextContent(`Copacker stops reading sales and stock from ${amazon.account}`)
    await userEvent.click(within(confirm).getByRole("button", { name: "Disconnect" }))
    await waitFor(() => expect(sent).toEqual([{ action: "connection.delete", data: { provider: "amazon" } }]))
  }
})

// A member sees a connected store's account and sync, without its settings.
export const MemberConnected = meta.story({
  args: { admin: false, shopify, amazon: null },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Connected")).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Manage Shopify" })).toBeNull()
    await waitFor(() => expect(canvas.getAllByText("Not connected")).toHaveLength(2))
  }
})

// A store's card says while its orders or stock sync, and when the last sync failed.
export const Syncing = meta.story({
  args: { shopify, amazon },
  beforeEach: ({ msw }) => {
    msw.use(
      ...storeSyncHandlers({
        sales: [
          salesSync("shopify", { status: "running", progress: 0.4, finishedAt: null }),
          salesSync("amazon", { status: "failed", errorCode: "provider_unavailable" })
        ]
      })
    )
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Syncing orders 40%")).toBeVisible()
    await expect(await canvas.findByText("Last sync failed")).toBeVisible()
  }
})

export const SyncingStock = meta.story({
  args: { shopify, amazon: null },
  beforeEach: ({ msw }) => {
    msw.use(
      ...storeSyncHandlers({ stock: { shopify: stockSync({ refresh: { status: "running", errorCode: null } }) } })
    )
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Syncing inventory")).toBeVisible()
  }
})

export const AmazonPrivateAuthorization = meta.story({
  args: { amazonSelfAuth: true },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Connect Amazon" }))
    const dialog = await screen.findByRole("dialog", { name: "Connect Amazon" })
    await expect(within(dialog).getByLabelText(/^Refresh token/)).toHaveAttribute("type", "password")
    await expect(within(dialog).getByRole("combobox", { name: "Marketplace" })).toHaveTextContent("United States")
  }
})

export const AdsRequiresStore = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("region", { name: "Advertising" })).toHaveTextContent(
      "Connect your Amazon store first."
    )
    await expect(canvas.queryByRole("button", { name: "Manage Amazon Ads" })).toBeNull()
  }
})
export const AdsConnectedMember = meta.story({
  args: { admin: false, amazon },
  beforeEach: ({ msw }) =>
    msw.use(
      http.get("/api/connections/amazon-ads", () =>
        HttpResponse.json({ connected: true, active: false, failed: false })
      )
    ),
  play: async ({ canvas }) => {
    const ads = canvas.getByRole("region", { name: "Advertising" })
    await expect(await within(ads).findByText("Connected")).toBeVisible()
    await expect(within(ads).queryByRole("button")).toBeNull()
  }
})

export const AdsUnavailable = meta.story({
  args: { amazon, amazonAdsAvailable: false },
  play: async ({ canvas }) => {
    const ads = canvas.getByRole("region", { name: "Advertising" })
    await expect(within(ads).getByText("Ads setup required.")).toBeVisible()
    await expect(within(ads).queryByRole("link")).toBeNull()
    await expect(within(ads).queryByRole("button")).toBeNull()
  }
})

export const AmazonReconnectRequired = meta.story({
  args: { amazon: { ...amazon, marketplaces: null, health: "reconnect" }, amazonSelfAuth: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Reconnect required")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Manage Amazon" }))
    const panel = await screen.findByRole("dialog", { name: "Amazon" })
    await expect(within(panel).queryByText("Connected")).toBeNull()
    await userEvent.click(within(panel).getByRole("button", { name: "Reconnect Amazon" }))
    const reconnect = await screen.findByRole("dialog", { name: "Connect Amazon" })
    await expect(screen.getAllByRole("dialog")).toHaveLength(1)
    await expect(within(reconnect).getByLabelText(/Refresh token/i)).toHaveAttribute("type", "password")
  }
})
export const AmazonConfigurationIssue = meta.story({
  args: { amazon: { ...amazon, marketplaces: null, health: "configuration" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Configuration issue")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Manage Amazon" }))
    const panel = await screen.findByRole("dialog", { name: "Amazon" })
    await expect(within(panel).queryByRole("button", { name: "Reconnect Amazon" })).toBeNull()
    await waitFor(() => expect(within(panel).getByText(/Contact support/)).toBeVisible())
  }
})

export const AmazonReconnectOAuth = meta.story({
  args: { amazon: { ...amazon, marketplaces: null, health: "reconnect" }, amazonSelfAuth: false },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Manage Amazon" }))
    const panel = await screen.findByRole("dialog", { name: "Amazon" })
    await userEvent.click(within(panel).getByRole("button", { name: "Reconnect Amazon" }))
    const dialog = await screen.findByRole("dialog", { name: "Connect Amazon" })
    await expect(screen.getAllByRole("dialog")).toHaveLength(1)
    await expect(within(dialog).queryByLabelText(/Refresh token/)).toBeNull()
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Continue to Amazon" })).toBeVisible())
  }
})

export const AmazonConnectionStatus = meta.story({
  args: {
    amazon: { ...amazon, health: "connected" },
    amazonSettings: <IntegrationSyncSection store="amazon" />
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Manage Amazon" }))
    const dialog = await screen.findByRole("dialog", { name: "Amazon" })
    await waitFor(() => expect(within(dialog).getByText("Connected", { exact: true })).toBeVisible())
    await expect(within(dialog).getByText("Harbor Goods US")).toBeVisible()
    await expect(within(dialog).getByText("United States")).toBeVisible()
  }
})

export const AmazonReconnectStatus = meta.story({
  args: {
    amazon: { ...amazon, marketplaces: null, health: "reconnect" },
    amazonSelfAuth: true,
    amazonSettings: <IntegrationSyncSection store="amazon" />
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Manage Amazon" }))
    const dialog = await screen.findByRole("dialog", { name: "Amazon" })
    await waitFor(() => expect(within(dialog).getByText("Reconnect required", { exact: true })).toBeVisible())
    await expect(within(dialog).getByRole("button", { name: "Reconnect Amazon" })).toBeVisible()
    await expect(screen.getAllByRole("dialog")).toHaveLength(1)
  }
})
