import { http, HttpResponse } from "msw"
import { expect, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { SidebarProvider } from "@/components/ui/sidebar"
import { searchIndex } from "@/stories/fixtures/shared"
import { TopBar } from "./top-bar"

const meta = preview.meta({
  component: TopBar,
  args: { kind: "buyer" },
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
    // The bar is 56px, with 34px controls and a 36px search.
    await expect(header.getBoundingClientRect().height).toBe(56)
    await expect(within(header).getByRole("button", { name: "Create" }).getBoundingClientRect().height).toBe(34)
    await expect(within(header).getByRole("button", { name: "Search" }).getBoundingClientRect().height).toBe(36)
    // Search opens its panel with the buyer's pages, Sales among them.
    await userEvent.click(within(header).getByRole("button", { name: "Search" }))
    const panel = await screen.findByRole("dialog", { name: "Search" })
    await expect(within(panel).getByRole("option", { name: "Sales" })).toBeInTheDocument()
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

// In a window too narrow to center it, the search narrows instead of covering Copacker or the actions.
export const Narrow = meta.story({
  globals: { viewport: { value: "ipad", isRotated: false } },
  play: async ({ canvas }) => {
    const header = canvas.getByRole("banner")
    const brand = within(header).getByRole("link", { name: "Copacker" }).getBoundingClientRect()
    const search = within(header).getByRole("button", { name: "Search" }).getBoundingClientRect()
    const create = within(header).getByRole("button", { name: "Create" }).getBoundingClientRect()
    await expect(search.left).toBeGreaterThan(brand.right)
    await expect(search.right).toBeLessThan(create.left)
    await expect(header.scrollWidth).toBeLessThanOrEqual(header.clientWidth)
  }
})

export const Supplier = meta.story({
  args: { kind: "supplier" },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Search" }))
    const panel = await screen.findByRole("dialog", { name: "Search" })
    await expect(within(panel).getByRole("option", { name: "Catalogs" })).toBeInTheDocument()
    await expect(within(panel).queryByRole("option", { name: "Restock" })).toBeNull()
  }
})

export const Forwarder = meta.story({
  args: { kind: "forwarder" },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "Create" })).toBeNull()
  }
})

// On a phone: the menu button, Copacker, then search and the Inbox as 44px buttons. Create isn't on a phone.
export const Phone = meta.story({
  globals: { viewport: { value: "iphone12", isRotated: false } },
  play: async ({ canvas }) => {
    const header = canvas.getByRole("banner")
    await expect(header.scrollWidth).toBeLessThanOrEqual(header.clientWidth)
    for (const name of ["Toggle sidebar", "Search", "Inbox"]) {
      await expect(within(header).getByRole("button", { name }).getBoundingClientRect().width).toBe(44)
    }
    await expect(within(header).getByRole("link", { name: "Copacker" })).toBeVisible()
    await expect(within(header).queryByRole("button", { name: "Create" })).toBeNull()
  }
})
