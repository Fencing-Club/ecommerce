import { SidebarProvider } from "@buildkitgg/shadcn-baseui-kit"
import { http, HttpResponse } from "msw/http"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { searchIndex } from "@/stories/fixtures/shared"
import { shownDialog } from "@/stories/play"
import { TopBar } from "./top-bar"

const meta = preview.meta({
  title: "Components/App shell/Top bar",
  component: TopBar,
  args: { kind: "buyer", navigate: fn() },
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <SidebarProvider className="min-h-0 flex-col [--header-height:calc(--spacing(14))]">
        <Story />
      </SidebarProvider>
    )
  ],
  beforeEach: ({ msw }) => {
    msw.use(http.get("/api/search", () => HttpResponse.json(searchIndex)))
  }
})

export const Buyer = meta.story({
  play: async ({ canvas }) => {
    const header = canvas.getByRole("banner")
    // In order across the bar: Copacker, search, then Create and the Inbox. The account is at the bottom of the sidebar,
    // and the sidebar's toggle is in the page's corner.
    const brand = within(header).getByRole("link", { name: "Copacker" })
    await expect(brand).toHaveAttribute("href", "/")
    // Copacker's mark is Lucide's box, as on the favicon and sign-in.
    await expect(brand.querySelector("svg.lucide-box")).not.toBeNull()
    const order = [
      brand.getBoundingClientRect().left,
      ...["Search", "Create", "Inbox"].map(
        (name) => within(header).getByRole("button", { name }).getBoundingClientRect().left
      )
    ]
    // The workspace switcher is in the sidebar, not the bar.
    await expect(within(header).queryByRole("button", { name: /switch workspace/ })).toBeNull()
    await expect(order).toEqual(order.toSorted((a, b) => a - b))
    await expect(within(header).queryByRole("button", { name: "Alex Rivera, account" })).toBeNull()
    await expect(within(header).queryByRole("button", { name: "Toggle sidebar" })).toBeNull()
    // The bar is 56px, with the kit's 36px controls and search.
    await expect(header.getBoundingClientRect().height).toBe(56)
    await expect(within(header).getByRole("button", { name: "Create" }).getBoundingClientRect().height).toBe(36)
    await expect(within(header).getByRole("button", { name: "Search" }).getBoundingClientRect().height).toBe(36)
    // Search opens its panel with the buyer's pages, Sales among them.
    await userEvent.click(within(header).getByRole("button", { name: "Search" }))
    const panel = await shownDialog("Search")
    await expect(panel.getByRole("option", { name: "Sales" })).toBeInTheDocument()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  }
})

// The search is centered in the window when there's room, 480px wide.
export const Centered = meta.story({
  play: async ({ canvas }) => {
    const search = canvas.getByRole("button", { name: "Search" }).getBoundingClientRect()
    const middle = search.left + search.width / 2
    await expect(Math.abs(middle - window.innerWidth / 2)).toBeLessThanOrEqual(2)
    await expect(search.width).toBeLessThanOrEqual(480)
  }
})

export const Supplier = meta.story({
  args: { kind: "supplier" },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Search" }))
    const panel = await shownDialog("Search")
    await expect(panel.getByRole("option", { name: "Catalogs" })).toBeInTheDocument()
    await expect(panel.queryByRole("option", { name: "Restock" })).toBeNull()
  }
})

export const Forwarder = meta.story({
  args: { kind: "forwarder" },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "Create" })).toBeNull()
  }
})
