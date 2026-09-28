import { http, HttpResponse } from "msw"
import { expect, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { searchIndex } from "@/stories/fixtures/shared"
import { SiteHeader } from "./site-header"

const meta = preview.meta({
  component: SiteHeader,
  args: { kind: "buyer" },
  parameters: { layout: "fullscreen" },
  decorators: [(Story) => <div className="[--header-height:calc(--spacing(14))]">{Story()}</div>],
  beforeEach: ({ msw }) => {
    msw.use(http.get("/api/search", () => HttpResponse.json(searchIndex)))
  }
})

export const Buyer = meta.story({
  play: async ({ canvas }) => {
    const header = canvas.getByRole("banner")
    await expect(within(header).getByRole("link", { name: "Copacker" })).toHaveAttribute("href", "/")
    // Search opens its panel with the buyer's pages.
    await userEvent.click(within(header).getByRole("button", { name: "Search" }))
    const panel = await screen.findByRole("dialog", { name: "Search" })
    await expect(within(panel).getByRole("option", { name: "Restock" })).toBeInTheDocument()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    // So does the bell, with its notifications.
    await userEvent.click(within(header).getByRole("button", { name: "Notifications" }))
    await expect(await screen.findByText("No notifications")).toBeInTheDocument()
  }
})

// The search in the header knows the workspace's kind.
export const Supplier = meta.story({
  args: { kind: "supplier" },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Search" }))
    const panel = await screen.findByRole("dialog", { name: "Search" })
    await expect(within(panel).getByRole("option", { name: "Catalogs" })).toBeInTheDocument()
    await expect(within(panel).queryByRole("option", { name: "Restock" })).toBeNull()
  }
})

// On a phone, the search is a button beside the bell.
export const Phone = meta.story({
  globals: { viewport: { value: "iphone12", isRotated: false } },
  play: async ({ canvas }) => {
    const header = canvas.getByRole("banner")
    const search = within(header).getByRole("button", { name: "Search" })
    const bell = within(header).getByRole("button", { name: "Notifications" })
    // The search sits at the end, beside the bell, rather than in the middle.
    await expect(search.getBoundingClientRect().width).toBeLessThan(40)
    await expect(bell.getBoundingClientRect().left - search.getBoundingClientRect().right).toBeLessThan(24)
  }
})
