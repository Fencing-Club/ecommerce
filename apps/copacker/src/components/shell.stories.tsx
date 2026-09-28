import { cookies } from "next/headers"
import { expect, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { EmptyState, PageHeader } from "@/components/common"
import { serverStory } from "@/stories/server"
import { member, person, type WorkspaceKind, workspaces } from "@/stories/workspace"
import { Shell } from "./shell"

// The portal's shell for a workspace of `kind`, around a page, with the sidebar as the person last left it (the
// sidebar_state cookie).
async function ShellStory({ kind, collapsed }: { kind: WorkspaceKind; collapsed: boolean }) {
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
    workspaces: Object.values(workspaces).map(({ id, name }) => ({ id, name })),
    children: (
      <>
        <PageHeader title="Shipments" />
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

export const Buyer = meta.story({
  play: async ({ canvas }) => {
    const header = canvas.getByRole("banner")
    await expect(within(header).getByRole("link", { name: "Copacker" })).toBeVisible()
    await expect(within(header).getByRole("button", { name: "Search" })).toBeVisible()
    await expect(within(header).getByRole("button", { name: "Notifications" })).toBeVisible()
    await expect(canvas.getByRole("link", { name: "Shipments" })).toHaveAttribute("data-active")
    await expect(canvas.getByRole("link", { name: "Restock" })).toBeVisible()
    // The page sits beside the sidebar's collapse button.
    const main = byId("main-content")
    await expect(within(main).getByRole("heading", { name: "Shipments" })).toBeVisible()
    await expect(within(main).getByText("No shipments yet")).toBeVisible()
    const sidebar = () => document.querySelector("[data-slot=sidebar][data-state]")
    await expect(sidebar()).toHaveAttribute("data-state", "expanded")
    await userEvent.click(within(main).getByRole("button", { name: "Toggle Sidebar" }))
    await waitFor(() => expect(sidebar()).toHaveAttribute("data-state", "collapsed"))
  }
})

function byId(id: string) {
  const element = document.getElementById(id)
  if (!element) {
    throw new Error(`Nothing has the id ${id}`)
  }
  return element
}

export const Supplier = meta.story({
  args: { kind: "supplier" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: /Lotus Manufacturing/ })).toHaveTextContent("Supplier workspace")
    await expect(canvas.getByRole("link", { name: "Catalogs" })).toBeVisible()
    await expect(canvas.queryByRole("link", { name: "Restock" })).toBeNull()
  }
})

export const SupplierMember = meta.story({
  args: { kind: "supplier" },
  parameters: { permissions: member },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Inventory" })).toBeVisible()
    await expect(canvas.queryByRole("link", { name: "Catalogs" })).toBeNull()
    await expect(canvas.queryByRole("link", { name: "Customers" })).toBeNull()
  }
})

export const Forwarder = meta.story({
  args: { kind: "forwarder" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: /Bayline Freight/ })).toHaveTextContent("Forwarder workspace")
    await expect(canvas.getByRole("link", { name: "Purchase orders" })).toBeVisible()
    await expect(canvas.queryByRole("link", { name: "Shipments" })).toBeNull()
  }
})

// The sidebar stays collapsed when the person left it that way.
export const Collapsed = meta.story({
  args: { collapsed: true },
  play: async () => {
    await expect(document.querySelector("[data-slot=sidebar][data-state]")).toHaveAttribute("data-state", "collapsed")
  }
})
