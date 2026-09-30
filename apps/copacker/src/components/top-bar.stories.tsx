import { http, HttpResponse } from "msw"
import { expect, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { SidebarProvider } from "@/components/ui/sidebar"
import { searchIndex } from "@/stories/fixtures/shared"
import { person, workspaces } from "@/stories/workspace"
import { TopBar } from "./top-bar"

const meta = preview.meta({
  component: TopBar,
  args: {
    name: workspaces.buyer.name,
    userName: person.name,
    email: person.email,
    kind: "buyer",
    active: workspaces.buyer.id,
    workspaces: Object.values(workspaces)
  },
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
    // In order across the bar: the workspace, search, then Create, the Inbox and the account. The sidebar collapses from
    // its rail or Ctrl+B, so the bar has no button for it on a computer.
    const order = ["Harbor Goods, switch workspace", "Search", "Create", "Inbox", "Alex Rivera, account"].map(
      (name) => within(header).getByRole("button", { name }).getBoundingClientRect().left
    )
    await expect(order).toEqual(order.toSorted((a, b) => a - b))
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

export const Supplier = meta.story({
  args: {
    name: workspaces.supplier.name,
    kind: "supplier",
    active: workspaces.supplier.id
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Lotus Manufacturing, switch workspace" })).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Search" }))
    const panel = await screen.findByRole("dialog", { name: "Search" })
    await expect(within(panel).getByRole("option", { name: "Catalogs" })).toBeInTheDocument()
    await expect(within(panel).queryByRole("option", { name: "Restock" })).toBeNull()
  }
})

export const Forwarder = meta.story({
  args: {
    name: workspaces.forwarder.name,
    kind: "forwarder",
    active: workspaces.forwarder.id
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "Create" })).toBeNull()
  }
})

// On a phone: the menu button, the workspace, then search and the Inbox as 44px buttons. Create and the account are in
// the sidebar's sheet.
export const Phone = meta.story({
  globals: { viewport: { value: "iphone12", isRotated: false } },
  play: async ({ canvas }) => {
    const header = canvas.getByRole("banner")
    await expect(header.scrollWidth).toBeLessThanOrEqual(header.clientWidth)
    for (const name of ["Toggle sidebar", "Search", "Inbox"]) {
      await expect(within(header).getByRole("button", { name }).getBoundingClientRect().width).toBe(44)
    }
    await expect(within(header).getByRole("button", { name: "Harbor Goods, switch workspace" })).toBeVisible()
    await expect(within(header).queryByRole("button", { name: "Create" })).toBeNull()
    await expect(within(header).queryByRole("button", { name: "Alex Rivera, account" })).toBeNull()
  }
})
