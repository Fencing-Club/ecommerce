import { cookies } from "next/headers"
import { expect, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { EmptyState, PageHeader } from "@/components/common"
import { Button } from "@/components/ui/button"
import { serverStory } from "@/stories/server"
import { member, person, type WorkspaceKind, workspaces } from "@/stories/workspace"
import { Shell } from "./shell"

// The portal's shell for a workspace of `kind`, around a page, with the sidebar as the person last left it (the
// sidebar_state cookie). `actions` gives the page's header buttons.
async function ShellStory({
  kind,
  collapsed,
  actions
}: {
  kind: WorkspaceKind
  collapsed: boolean
  actions?: boolean
}) {
  const store = await cookies()
  if (collapsed) {
    store.set("sidebar_state", "false")
  }
  const workspace = workspaces[kind]
  const shell = await Shell({
    name: workspace.name,
    userName: person.name,
    email: person.email,
    kind: workspace.kind,
    active: workspace.id,
    workspaces: Object.values(workspaces),
    children: (
      <>
        <PageHeader title="Shipments">
          {actions && (
            <>
              <Button variant="outline">Import</Button>
              <Button>Create purchase order</Button>
            </>
          )}
        </PageHeader>
        <EmptyState title="No shipments yet" description="Shipments show here once a supplier packs a purchase order" />
      </>
    )
  })
  // Later stories start with the sidebar open.
  store.delete("sidebar_state")
  return shell
}

const meta = preview.meta({
  ...serverStory(ShellStory),
  args: { kind: "buyer", collapsed: false } satisfies Parameters<typeof ShellStory>[0],
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true, navigation: { pathname: "/shipments" } } }
})

function byId(id: string) {
  const element = document.getElementById(id)
  if (!element) {
    throw new Error(`Nothing has the id ${id}`)
  }
  return element
}

const sidebar = () => document.querySelector("[data-slot=sidebar][data-state]")

export const Buyer = meta.story({
  play: async ({ canvas }) => {
    const header = canvas.getByRole("banner")
    // Copacker in the top bar, the workspace at the top of the sidebar.
    await expect(within(header).getByRole("link", { name: "Copacker" })).toBeVisible()
    const switcher = canvas.getByRole("button", { name: "Harbor Goods, switch workspace" })
    await expect(switcher.closest("[data-slot=sidebar]")).not.toBeNull()
    await expect(within(header).getByRole("button", { name: "Search" })).toBeVisible()
    await expect(within(header).getByRole("button", { name: "Create" })).toBeVisible()
    await expect(within(header).getByRole("button", { name: "Inbox" })).toBeVisible()
    // The account at the bottom of the sidebar.
    const account = canvas.getByRole("button", { name: "Alex Rivera, account" })
    await expect(account.closest("[data-slot=sidebar-footer]")).not.toBeNull()
    await expect(canvas.getByRole("link", { name: "Shipments" })).toHaveAttribute("data-active")
    await expect(canvas.getByRole("link", { name: "Sales" })).toBeVisible()
    const main = byId("main-content")
    await expect(within(main).getByRole("heading", { level: 1, name: "Shipments" })).toBeVisible()
    await expect(within(main).getByText("No shipments yet")).toBeVisible()
    // The page sits 32px in from the sidebar, under the 48px row with the sidebar's toggle; the sidebar is 240px.
    const style = getComputedStyle(main)
    await expect([style.paddingInlineStart, style.paddingTop]).toEqual(["32px", "8px"])
    await expect(document.querySelector("[data-slot=sidebar-container]")?.getBoundingClientRect().width).toBe(240)
    // The toggle in the page's corner collapses it to its rail, and Ctrl+B expands it again.
    await expect(sidebar()).toHaveAttribute("data-state", "expanded")
    const toggle = canvas
      .getAllByRole("button", { name: "Toggle sidebar" })
      .find((button) => button.closest("[data-slot=sidebar-inset]"))
    if (!toggle) {
      throw new Error("The page has no sidebar toggle")
    }
    await userEvent.click(toggle)
    await waitFor(() => expect(sidebar()).toHaveAttribute("data-state", "collapsed"))
    await userEvent.keyboard("{Control>}b{/Control}")
    await waitFor(() => expect(sidebar()).toHaveAttribute("data-state", "expanded"))
  }
})

export const Supplier = meta.story({
  args: { kind: "supplier" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Lotus Manufacturing, switch workspace" })).toBeVisible()
    await expect(canvas.getByRole("link", { name: "Catalogs" })).toBeVisible()
    await expect(canvas.queryByRole("link", { name: "Restock" })).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "Create" }))
    const menu = await screen.findByRole("menu")
    await expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent)
    ).toEqual(["Product", "Catalog", "Import products"])
  }
})

// A member who can only view doesn't see Create at all.
export const SupplierMember = meta.story({
  args: { kind: "supplier" },
  parameters: { permissions: member },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Inventory" })).toBeVisible()
    await expect(canvas.queryByRole("link", { name: "Catalogs" })).toBeNull()
    await expect(canvas.queryByRole("link", { name: "Customers" })).toBeNull()
    await expect(canvas.queryByRole("button", { name: "Create" })).toBeNull()
  }
})

// A forwarder's freight, and nothing to create.
export const Forwarder = meta.story({
  args: { kind: "forwarder" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Bayline Freight, switch workspace" })).toBeVisible()
    await expect(canvas.getByText("Freight")).toBeVisible()
    await expect(canvas.getByRole("link", { name: "Purchase orders" })).toBeVisible()
    await expect(canvas.queryByRole("link", { name: "Shipments" })).toBeNull()
    await expect(canvas.queryByRole("button", { name: "Create" })).toBeNull()
  }
})

// The sidebar stays collapsed when the person left it that way.
export const Collapsed = meta.story({
  args: { collapsed: true },
  play: async () => {
    await expect(sidebar()).toHaveAttribute("data-state", "collapsed")
  }
})

// On a phone the header's buttons wrap under the title and start at the page's edge, and the sidebar opens as a sheet
// from the top bar.
export const Phone = meta.story({
  args: { actions: true },
  globals: { viewport: { value: "iphone12", isRotated: false } },
  play: async ({ canvas }) => {
    const main = byId("main-content")
    const title = within(main).getByRole("heading", { level: 1, name: "Shipments" }).getBoundingClientRect()
    const create = within(main).getByRole("button", { name: "Create purchase order" }).getBoundingClientRect()
    const edge = main.getBoundingClientRect().left + Number.parseFloat(getComputedStyle(main).paddingInlineStart)
    await expect(create.top).toBeGreaterThanOrEqual(title.bottom)
    await expect(Math.abs(title.left - edge)).toBeLessThanOrEqual(1)
    await expect(
      Math.abs(within(main).getByRole("button", { name: "Import" }).getBoundingClientRect().left - edge)
    ).toBeLessThanOrEqual(1)
    await userEvent.click(within(canvas.getByRole("banner")).getByRole("button", { name: "Toggle sidebar" }))
    const sheet = await screen.findByRole("dialog")
    await waitFor(() => expect(within(sheet).getByRole("link", { name: "Shipments" })).toBeVisible())
  }
})
