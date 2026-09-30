import { expect, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { held, recordActions } from "@/stories/fixtures/shared"
import { workspaces } from "@/stories/workspace"
import { WorkspaceMenu } from "./workspace-menu"

const meta = preview.meta({
  component: WorkspaceMenu,
  args: { active: workspaces.buyer.id, fallbackName: workspaces.buyer.name, workspaces: Object.values(workspaces) }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("button", { name: "Harbor Goods, switch workspace" })
    // The bar names the workspace, not its kind.
    await expect(trigger).toHaveTextContent(/^Harbor Goods$/)
    // Copacker's mark is Lucide's box, as on the favicon and sign-in.
    await expect(trigger.querySelector("svg.lucide-box")).not.toBeNull()
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
    const posted = recordActions(msw, held)
    await userEvent.click(canvas.getByRole("button", { name: /switch workspace/ }))
    const menu = await screen.findByRole("menu")
    await userEvent.click(within(menu).getByRole("menuitem", { name: /Lotus Manufacturing/ }))
    await waitFor(() => expect(posted).toEqual([{ action: "workspace.switch", data: { id: "org_supplier" } }]))
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
