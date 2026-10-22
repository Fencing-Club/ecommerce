import { expect, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { shownDialog } from "@/stories/play"
import { member, person, type WorkspaceKind, workspaces } from "@/stories/workspace"
import { AppSidebar } from "./app-sidebar"

// The sidebar in a workspace of each kind, as the portal's shell passes it.
function inWorkspace(kind: WorkspaceKind) {
  const workspace = workspaces[kind]
  return {
    pathname: "/orders/order-1045",
    kind: workspace.kind,
    active: workspace.id,
    name: workspace.name,
    workspaces: Object.values(workspaces),
    userName: person.name,
    email: person.email
  }
}

const meta = preview.meta({
  title: "Components/App shell/App sidebar",
  component: AppSidebar,
  args: inWorkspace("buyer"),
  parameters: {
    layout: "fullscreen",
    router: { navigation: { pathname: "/orders/order-1045" } }
  },
  // The sidebar lives in the shell's provider, beside the page, whose top bar has its button.
  decorators: [
    (Story, { parameters }) => (
      <SidebarProvider defaultOpen={parameters.sidebarOpen !== false} className="[--header-height:0px]">
        {Story()}
        <SidebarInset className="p-4">
          <SidebarTrigger />
        </SidebarInset>
      </SidebarProvider>
    )
  ]
})

function navigation(canvasElement: HTMLElement) {
  return within(canvasElement)
    .getAllByRole("link")
    .filter((link) => link.closest("[data-sidebar=content]"))
    .map((link) => link.textContent)
}

export const Buyer = meta.story({
  play: async ({ canvas, canvasElement }) => {
    await expect(navigation(canvasElement)).toEqual([
      "Overview",
      "Sales",
      "Products",
      "Restock",
      "Purchase orders",
      "Shipments",
      "Partners",
      "Settings"
    ])
    await expect(canvas.getByText("Store")).toBeVisible()
    await expect(canvas.getByText("Purchasing")).toBeVisible()
    // The page's own entry is marked, including on a record under it.
    const current = canvas.getByRole("link", { name: "Purchase orders" })
    await expect(current).toHaveAttribute("data-active")
    await expect(current).toHaveAttribute("href", "/orders")
    // Its marker is the primary color on its leading edge.
    await expect(getComputedStyle(current, "::before").backgroundColor).not.toBe("rgba(0, 0, 0, 0)")
    await expect(canvas.getByRole("link", { name: "Sales" })).not.toHaveAttribute("data-active")
  }
})

// The workspace switcher tops the sidebar.
export const WorkspaceSwitcher = meta.story({
  play: async ({ canvas }) => {
    // The switcher tops the sidebar, above every page.
    const switcher = canvas.getByRole("button", { name: "Harbor Goods, switch workspace" })
    const first = canvas.getAllByRole("link")[0]!
    await expect(switcher.getBoundingClientRect().bottom).toBeLessThanOrEqual(first.getBoundingClientRect().top)
    await expect(switcher).toHaveTextContent("HGHarbor Goods")
    await userEvent.click(switcher)
    const menu = await screen.findByRole("menu")
    await waitFor(() => expect(within(menu).getByRole("menuitem", { name: /Lotus Manufacturing/ })).toBeVisible())
  }
})

// Collapsed to the rail, the switcher is just the workspace's tile.
export const WorkspaceSwitcherCollapsed = meta.story({
  parameters: { sidebarOpen: false },
  play: async ({ canvas }) => {
    const switcher = canvas.getByRole("button", { name: "Harbor Goods, switch workspace" })
    await expect(switcher.getBoundingClientRect().width).toBe(32)
    await expect(within(switcher).getByText("Harbor Goods")).not.toBeVisible()
  }
})

// A member sees only the pages they were given, and Settings.
export const BuyerMember = meta.story({
  parameters: { permissions: member },
  play: async ({ canvas, canvasElement }) => {
    await expect(navigation(canvasElement)).toEqual(["Products", "Purchase orders", "Shipments", "Settings"])
    await expect(canvas.queryByText("Overview")).toBeNull()
    await expect(canvas.queryByRole("link", { name: "Partners" })).toBeNull()
  }
})

export const Supplier = meta.story({
  args: { ...inWorkspace("supplier"), pathname: "/inventory" },
  parameters: { router: { navigation: { pathname: "/inventory" } } },
  play: async ({ canvas, canvasElement }) => {
    await expect(navigation(canvasElement)).toEqual([
      "Overview",
      "Orders",
      "Shipments",
      "Customers",
      "Products",
      "Inventory",
      "Catalogs",
      "Settings"
    ])
    await expect(canvas.getByText("Sales")).toBeVisible()
    await expect(canvas.getByRole("link", { name: "Inventory" })).toHaveAttribute("data-active")
  }
})

export const SupplierMember = meta.story({
  args: inWorkspace("supplier"),
  parameters: { permissions: member, router: { navigation: { pathname: "/orders" } } },
  play: async ({ canvasElement }) => {
    await expect(navigation(canvasElement)).toEqual(["Orders", "Shipments", "Products", "Inventory", "Settings"])
  }
})

// A forwarder's freight: the purchase orders coming through it, and Settings.
export const Forwarder = meta.story({
  args: { ...inWorkspace("forwarder"), pathname: "/settings" },
  parameters: { router: { navigation: { pathname: "/settings" } } },
  play: async ({ canvas, canvasElement }) => {
    await expect(navigation(canvasElement)).toEqual(["Purchase orders", "Settings"])
    await expect(canvas.getByText("Freight")).toBeVisible()
    await expect(canvas.getByRole("link", { name: "Settings" })).toHaveAttribute("data-active")
  }
})

// Collapsed to its icons, each page names itself on hover.
export const Collapsed = meta.story({
  parameters: { sidebarOpen: false },
  play: async ({ canvas }) => {
    const sidebar = () => document.querySelector("[data-slot=sidebar][data-state]")
    await expect(sidebar()).toHaveAttribute("data-state", "collapsed")
    await userEvent.hover(canvas.getByRole("link", { name: "Shipments" }))
    await waitFor(() => expect(document.querySelector("[data-slot=tooltip-content]")).toHaveTextContent("Shipments"))
    // The rail along its edge expands it, as the page's toggle does.
    const rail = canvas
      .getAllByRole("button", { name: "Toggle sidebar" })
      .find((button) => button.dataset.sidebar === "rail")
    if (!rail) {
      throw new Error("The sidebar has no rail")
    }
    await userEvent.click(rail)
    await waitFor(() => expect(sidebar()).toHaveAttribute("data-state", "expanded"))
  }
})

// On a phone the sidebar is a sheet, the sidebar's width (Create stays on desktop; each list page has its own primary
// action). It closes once a page is chosen.
export const Phone = meta.story({
  globals: { viewport: { value: "iphone12", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("link", { name: "Shipments" })).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "Toggle sidebar" }))
    const sheet = await shownDialog()
    await waitFor(() => expect(sheet.getByRole("button", { name: "Alex Rivera, account" })).toBeVisible())
    await expect(sheet.element.getBoundingClientRect().width).toBe(240)
    await expect(sheet.getByRole("button", { name: "Harbor Goods, switch workspace" })).toBeVisible()
    await expect(sheet.queryByRole("button", { name: "Create" })).toBeNull()
    await expect(sheet.getByText("alex@example.com")).toBeVisible()
    const shipments = sheet.getByRole("link", { name: "Shipments" })
    await expect(shipments).toHaveAttribute("href", "/shipments")
    await userEvent.click(shipments)
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  }
})

// Each entry is 34px; the open one has the muted fill and a semibold label.
export const Measurements = meta.story({
  play: async ({ canvas }) => {
    const current = canvas.getByRole("link", { name: "Purchase orders" })
    await expect(current.getBoundingClientRect().height).toBe(34)
    await expect(getComputedStyle(current).fontWeight).toBe("600")
    await expect(getComputedStyle(canvas.getByRole("link", { name: "Sales" })).fontWeight).toBe("400")
  }
})
