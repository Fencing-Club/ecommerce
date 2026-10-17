import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { person, workspaces } from "@/stories/workspace"
import { Portal } from "./portal"

const meta = preview.meta({
  component: Portal,
  args: {
    name: workspaces.buyer.name,
    kind: "buyer",
    active: workspaces.buyer.id,
    userName: person.name,
    email: person.email,
    workspaces: Object.values(workspaces),
    defaultOpen: true,
    children: <h1>Overview</h1>
  },
  parameters: { router: { navigation: { pathname: "/overview" } } }
})

export const Overview = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Overview" })).toHaveAttribute("data-active")
    await expect(canvas.getByRole("heading", { name: "Overview" })).toBeVisible()
  }
})
