import { expect, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { held, type ActionRequest, recordActions, failWith } from "@/stories/actions"
import { workspaces } from "@/stories/workspace"
import { WorkspacePicker } from "./workspace-picker"

const sent: ActionRequest[] = []

const meta = preview.meta({
  title: "Components/App shell/Workspace picker",
  component: WorkspacePicker,
  args: { workspaces: Object.values(workspaces), unavailable: true },
  parameters: { layout: "fullscreen" }
})

export const Unavailable = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Choose a workspace" })).toBeVisible()
    await expect(canvas.getByText(/Your previous workspace is no longer available/)).toBeVisible()
    await expect(canvas.getAllByRole("button")).toHaveLength(3)
    await expect(canvas.getByRole("button", { name: "Harbor Goods Buyer workspace" })).toBeVisible()
  }
})

export const ChooseWithKeyboard = meta.story({
  play: async ({ canvas, msw }) => {
    msw.use(recordActions(sent, held))
    canvas.getByRole("button", { name: "Harbor Goods Buyer workspace" }).focus()
    await userEvent.tab()
    await expect(canvas.getByRole("button", { name: "Lotus Manufacturing Supplier workspace" })).toHaveFocus()
    await userEvent.keyboard("{Enter}")
    await waitFor(() => expect(sent).toEqual([{ action: "workspace.switch", data: { id: "org_supplier" } }]))
    await expect(canvas.getByRole("button", { name: /Lotus Manufacturing/ })).toHaveAttribute("aria-busy", "true")
    for (const button of canvas.getAllByRole("button")) {
      await expect(button).toBeDisabled()
    }
  }
})

export const AccessChanged = meta.story({
  play: async ({ canvas, msw }) => {
    msw.use(recordActions(sent, failWith("You no longer have access to this workspace.", 403)))
    await userEvent.click(canvas.getByRole("button", { name: /Harbor Goods/ }))
    await expect(await canvas.findByRole("alert")).toHaveTextContent("You no longer have access to this workspace.")
    await expect(canvas.getByRole("button", { name: /Lotus Manufacturing/ })).toBeEnabled()
  }
})

export const Mobile = meta.story({
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    const main = canvas.getByRole("main")
    await expect(main.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
    for (const button of canvas.getAllByRole("button")) {
      await expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    }
  }
})

export const Urdu = meta.story({
  globals: { locale: "ur" },
  play: async ({ canvas }) => {
    await expect(document.documentElement).toHaveAttribute("dir", "rtl")
    await expect(canvas.getByRole("heading", { name: "ورک اسپیس منتخب کریں" })).toBeVisible()
  }
})
