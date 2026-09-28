import { expect, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { held, recordActions } from "@/stories/fixtures/shared"
import { member, person, type WorkspaceKind, workspaces } from "@/stories/workspace"
import { AppSidebar } from "./app-sidebar"

const allWorkspaces = Object.values(workspaces).map(({ id, name }) => ({ id, name }))

// The sidebar in a workspace of each kind, as the portal's shell passes it.
function inWorkspace(kind: WorkspaceKind) {
  const workspace = workspaces[kind]
  return {
    name: workspace.name,
    userName: person.name,
    email: person.email,
    kind: workspace.kind,
    active: workspace.id,
    workspaces: allWorkspaces
  }
}

const meta = preview.meta({
  component: AppSidebar,
  args: inWorkspace("buyer"),
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/orders/order-1045" } }
  },
  // The sidebar lives in the shell's provider, beside the page with its collapse button.
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
      "Orders",
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
    await expect(canvas.getByRole("link", { name: "Purchase orders" })).toHaveAttribute("data-active")
    await expect(canvas.getByRole("link", { name: "Purchase orders" })).toHaveAttribute("href", "/orders")
    await expect(canvas.getByRole("link", { name: "Orders" })).not.toHaveAttribute("data-active")
    const switcher = canvas.getByRole("button", { name: /Harbor Goods/ })
    await expect(switcher).toHaveTextContent("HGHarbor GoodsBuyer workspace")
    await expect(canvas.getByRole("button", { name: /Alex Rivera/ })).toHaveTextContent("ARAlex Riveraalex@example.com")
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
  args: inWorkspace("supplier"),
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: "/inventory" } } },
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
    await expect(canvas.getByRole("button", { name: /Lotus Manufacturing/ })).toHaveTextContent(
      "LMLotus ManufacturingSupplier workspace"
    )
  }
})

export const SupplierMember = meta.story({
  args: inWorkspace("supplier"),
  parameters: { permissions: member, nextjs: { appDirectory: true, navigation: { pathname: "/orders" } } },
  play: async ({ canvasElement }) => {
    await expect(navigation(canvasElement)).toEqual(["Orders", "Shipments", "Products", "Inventory", "Settings"])
  }
})

// A forwarder sees the purchase orders coming through it, and Settings.
export const Forwarder = meta.story({
  args: inWorkspace("forwarder"),
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: "/settings" } } },
  play: async ({ canvas, canvasElement }) => {
    await expect(navigation(canvasElement)).toEqual(["Purchase orders", "Settings"])
    await expect(canvas.getByRole("link", { name: "Settings" })).toHaveAttribute("data-active")
    await expect(canvas.getByRole("button", { name: /Bayline Freight/ })).toHaveTextContent("Forwarder workspace")
  }
})

export const SwitchWorkspace = meta.story({
  play: async ({ canvas, msw }) => {
    // Switching loads the new workspace's home, so the server holds its answer and the story stays here.
    const posted = recordActions(msw, held)
    await userEvent.click(canvas.getByRole("button", { name: /Harbor Goods/ }))
    const menu = await screen.findByRole("menu")
    await expect(within(menu).getByText("Workspaces")).toBeInTheDocument()
    const items = within(menu).getAllByRole("menuitem")
    await expect(items.map((item) => item.textContent)).toEqual([
      "HGHarbor Goods",
      "LMLotus Manufacturing",
      "BFBayline Freight",
      "New workspace"
    ])
    // The open workspace is checked.
    await expect(items[0]?.querySelector("svg")).not.toBeNull()
    await expect(items[1]?.querySelector("svg")).toBeNull()
    await expect(within(menu).getByRole("menuitem", { name: "New workspace" })).toHaveAttribute(
      "href",
      "/workspaces/new"
    )
    await userEvent.click(within(menu).getByRole("menuitem", { name: /Lotus Manufacturing/ }))
    await waitFor(() => expect(posted).toEqual([{ action: "workspace.switch", data: { id: "org_supplier" } }]))
  }
})

// Until the workspace list has the open workspace, it shows by the name the session gave.
export const WorkspaceNotListed = meta.story({
  args: { name: "Harbor Goods EU", active: "org_new", workspaces: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: /Harbor Goods EU/ })).toHaveTextContent("HGHarbor Goods EU")
  }
})

// Someone who hasn't given their name shows by their email.
export const WithoutName = meta.story({
  args: { userName: null },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: /alex@example.com/ })).toHaveTextContent(
      "Aalex@example.comalex@example.com"
    )
  }
})

// The account menu: who's signed in, the theme, and signing out.
export const AccountMenu = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Alex Rivera/ }))
    const menu = await screen.findByRole("menu")
    await expect(within(menu).getByText("alex@example.com")).toBeInTheDocument()
    const signOut = within(menu).getByRole("menuitem", { name: "Sign out" })
    await expect(signOut).toHaveAttribute("type", "submit")
    await expect(signOut).toHaveAttribute("form", "sign-out")
    const form = document.getElementById("sign-out")
    await expect(form).toHaveAttribute("action", "/logout")
    await expect(form).toHaveAttribute("method", "post")

    await userEvent.click(within(menu).getByRole("menuitem", { name: "Theme" }))
    const light = await screen.findByRole("menuitemradio", { name: "Light" })
    await expect(light).toHaveAttribute("aria-checked", "true")
    await expect(screen.getByRole("menuitemradio", { name: "System" })).toHaveAttribute("aria-checked", "false")
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Dark" }))
    await waitFor(() => expect(document.documentElement).toHaveClass("dark"))
    await expect(localStorage.getItem("theme")).toBe("dark")
    await expect(screen.getByRole("menuitemradio", { name: "Dark" })).toHaveAttribute("aria-checked", "true")
    // System follows the computer and forgets the choice.
    await userEvent.click(screen.getByRole("menuitemradio", { name: "System" }))
    await waitFor(() => expect(localStorage.getItem("theme")).toBeNull())
    await expect(screen.getByRole("menuitemradio", { name: "System" })).toHaveAttribute("aria-checked", "true")
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Light" }))
    await waitFor(() => expect(document.documentElement).not.toHaveClass("dark"))
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
    // The rail along its edge expands it, as the page's button does.
    const rail = canvas
      .getAllByRole("button", { name: "Toggle Sidebar" })
      .find((button) => button.dataset.sidebar === "rail")
    if (!rail) {
      throw new Error("The sidebar has no rail")
    }
    await userEvent.click(rail)
    await waitFor(() => expect(sidebar()).toHaveAttribute("data-state", "expanded"))
  }
})

// On a phone the sidebar is a sheet, which closes once a page is chosen.
export const Phone = meta.story({
  globals: { viewport: { value: "iphone12", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("link", { name: "Shipments" })).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "Toggle Sidebar" }))
    const sheet = await screen.findByRole("dialog")
    const shipments = within(sheet).getByRole("link", { name: "Shipments" })
    await expect(shipments).toHaveAttribute("href", "/shipments")
    await userEvent.click(shipments)
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  }
})
