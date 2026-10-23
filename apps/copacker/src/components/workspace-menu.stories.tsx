import { expect, screen, userEvent, waitFor, within } from "storybook/test"
import { finishSignIn } from "#.storybook/mocks/auth-navigation"
import preview from "#.storybook/preview"
import { held, type ActionRequest, recordActions, failWith } from "@/stories/actions"
import { workspaces } from "@/stories/workspace"
import { WorkspaceMenu } from "./workspace-menu"

const sent: ActionRequest[] = []

const meta = preview.meta({
  title: "Components/App shell/Workspace menu",
  component: WorkspaceMenu,
  args: { active: workspaces.buyer.id, fallbackName: workspaces.buyer.name, workspaces: Object.values(workspaces) }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("button", { name: "Harbor Goods, switch workspace" })
    // The workspace's initials on its kind's tile, then its name; the trigger doesn't name the kind.
    await expect(trigger).toHaveTextContent(/^HGHarbor Goods$/)
  }
})

// A supplier's workspace takes the supplier's teal tile.
export const SupplierWorkspace = meta.story({
  args: { active: workspaces.supplier.id, fallbackName: workspaces.supplier.name },
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("button", { name: "Lotus Manufacturing, switch workspace" })
    await expect(trigger).toHaveTextContent(/^LMLotus Manufacturing$/)
  }
})

// Every workspace with its kind, then New workspace and Workspace settings.
export const Open = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /switch workspace/ }))
    const menu = await screen.findByRole("menu")
    const items = within(menu).getAllByRole("menuitem")
    await expect(items.map((item) => item.textContent)).toEqual([
      "HGHarbor GoodsBuyer workspace",
      "LMLotus ManufacturingSupplier workspace",
      "BFBayline FreightForwarder workspace",
      "New workspace",
      "Workspace settings"
    ])
    // The open workspace is marked.
    await expect(within(items[0]!).getByLabelText("Open now")).toBeInTheDocument()
    await expect(within(items[1]!).queryByLabelText("Open now")).toBeNull()
    await expect(within(menu).getByRole("menuitem", { name: "New workspace" })).toHaveAttribute(
      "href",
      "/workspaces/new"
    )
    await expect(within(menu).getByRole("menuitem", { name: "Workspace settings" })).toHaveAttribute(
      "href",
      "/settings"
    )
  }
})

export const Switch = meta.story({
  play: async ({ canvas, msw }) => {
    // Switching loads the new workspace's home, so the server holds its answer and the story stays here.
    msw.use(recordActions(sent, held))
    await userEvent.click(canvas.getByRole("button", { name: /switch workspace/ }))
    const menu = await screen.findByRole("menu")
    await userEvent.click(within(menu).getByRole("menuitem", { name: /Lotus Manufacturing/ }))
    await waitFor(() => expect(sent).toEqual([{ action: "workspace.switch", data: { id: "org_supplier" } }]))
  }
})

// The menu has closed by then, so a failed switch shows as a toast and the page stays as it was.
export const SwitchFails = meta.story({
  play: async ({ canvas, msw }) => {
    msw.use(recordActions(sent, failWith("You no longer have access to this workspace.", 403)))
    await userEvent.click(canvas.getByRole("button", { name: /switch workspace/ }))
    const menu = await screen.findByRole("menu")
    await userEvent.click(within(menu).getByRole("menuitem", { name: /Lotus Manufacturing/ }))
    await expect(await screen.findByText("You no longer have access to this workspace.")).toBeVisible()
    await expect(finishSignIn).not.toHaveBeenCalled()
    await expect(canvas.getByRole("button", { name: "Harbor Goods, switch workspace" })).toBeVisible()
  }
})

// Choosing the displayed default must persist it too, so later requests do not fall back to another workspace.
export const SelectCurrentWorkspace = meta.story({
  play: async ({ canvas, msw }) => {
    msw.use(recordActions(sent, held))
    await userEvent.click(canvas.getByRole("button", { name: /switch workspace/ }))
    const menu = await screen.findByRole("menu")
    await userEvent.click(within(menu).getByRole("menuitem", { name: /Harbor Goods/ }))
    await waitFor(() => expect(sent).toEqual([{ action: "workspace.switch", data: { id: "org_buyer" } }]))
  }
})

// Until the workspace list has the open workspace, it shows by the name the session gave.
export const NotListedYet = meta.story({
  args: { fallbackName: "Harbor Goods EU", active: "org_new", workspaces: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Harbor Goods EU, switch workspace" })).toBeVisible()
  }
})

// A long name truncates in the bar rather than pushing search aside.
export const LongName = meta.story({
  args: {
    active: "org_long",
    fallbackName: "Harbor Goods International Trading and Distribution",
    workspaces: [{ id: "org_long", name: "Harbor Goods International Trading and Distribution", kind: "buyer" }]
  },
  decorators: [
    (Story) => (
      <div className="flex w-56">
        <Story />
      </div>
    )
  ],
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("button", { name: /switch workspace/ })
    await expect(trigger.getBoundingClientRect().width).toBeLessThanOrEqual(224)
  }
})
