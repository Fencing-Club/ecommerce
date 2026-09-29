import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { HttpResponse } from "msw"
import { expect, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { recordActions } from "@/stories/fixtures/shared"
import { DisconnectButton } from "./disconnect-button"

const meta = preview.meta({
  component: DisconnectButton,
  args: { provider: "shopify", account: "harbor-goods.myshopify.com" } satisfies React.ComponentProps<
    typeof DisconnectButton
  >
})

export const Shopify = meta.story({
  play: async ({ canvas, msw }) => {
    const posted = recordActions(msw)
    await userEvent.click(canvas.getByRole("button", { name: "Disconnect" }))
    const dialog = await screen.findByRole("alertdialog", { name: "Disconnect Shopify?" })
    await expect(
      within(dialog).getByText(
        "Copacker stops syncing products, stock, sales, and costs with harbor-goods.myshopify.com. Purchase orders stay as they are."
      )
    ).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole("button", { name: "Disconnect" }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    await expect(posted).toEqual([{ action: "connection.delete", data: { provider: "shopify" } }])
    await expect(getRouter().refresh).toHaveBeenCalled()
  }
})

export const Amazon = meta.story({
  args: { provider: "amazon", account: "Harbor Goods (North America)" },
  play: async ({ canvas, msw }) => {
    const posted = recordActions(msw)
    await userEvent.click(canvas.getByRole("button", { name: "Disconnect" }))
    const dialog = await screen.findByRole("alertdialog", { name: "Disconnect Amazon?" })
    await expect(
      within(dialog).getByText(/stops reading sales and stock from Harbor Goods \(North America\)/)
    ).toBeInTheDocument()
    // Cancel leaves the connection.
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    await expect(posted).toEqual([])
  }
})

// eBay's orders stop being read; its stock was always Shopify's.
export const Ebay = meta.story({
  args: { provider: "ebay", account: "harbor_goods" },
  play: async ({ canvas, msw }) => {
    const posted = recordActions(msw)
    await userEvent.click(canvas.getByRole("button", { name: "Disconnect" }))
    const dialog = await screen.findByRole("alertdialog", { name: "Disconnect eBay?" })
    await expect(
      within(dialog).getByText("Copacker stops reading sales from harbor_goods. Purchase orders stay as they are.")
    ).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole("button", { name: "Disconnect" }))
    await waitFor(() => expect(posted).toEqual([{ action: "connection.delete", data: { provider: "ebay" } }]))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  }
})

// A failure without a message from the server names the store.
export const Fails = meta.story({
  args: { provider: "amazon", account: "Harbor Goods (North America)" },
  play: async ({ canvas, msw }) => {
    recordActions(msw, () => new HttpResponse(null, { status: 500 }))
    await userEvent.click(canvas.getByRole("button", { name: "Disconnect" }))
    const dialog = await screen.findByRole("alertdialog")
    await userEvent.click(within(dialog).getByRole("button", { name: "Disconnect" }))
    await expect(await within(dialog).findByRole("alert")).toHaveTextContent("Couldn’t disconnect Amazon")
    // The dialog stays open to try again.
    await expect(within(dialog).getByRole("button", { name: "Disconnect" })).toBeEnabled()
    await expect(getRouter().refresh).not.toHaveBeenCalled()
  }
})
