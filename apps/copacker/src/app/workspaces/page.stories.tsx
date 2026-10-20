import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { WorkspacePicker } from "@/components/workspace-picker"
import { workspaces } from "@/stories/workspace"

const meta = preview.meta({
  title: "Pages/Workspaces/Choose",
  component: WorkspacePicker,
  args: { workspaces: Object.values(workspaces), unavailable: false },
  parameters: { layout: "fullscreen", router: { navigation: { pathname: "/workspaces" } } }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Choose a workspace" })).toBeVisible()
    await expect(canvas.queryByText(/no longer available/)).toBeNull()
  }
})

export const WorkspaceUnavailable = meta.story({
  args: { unavailable: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Your previous workspace is no longer available/)).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Harbor Goods Buyer workspace" })).toBeEnabled()
  }
})
