import { DropdownMenuItem } from "@buildkitgg/shadcn-baseui-kit"
import { expect, fn, screen, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { RowActionsMenu } from "./row-actions-menu"

const edited = fn()
const removed = fn()

const meta = preview.meta({
  title: "Components/Display/Row actions menu",
  component: RowActionsMenu,
  args: {
    label: "More actions for Yiwu warehouse",
    pendingLabel: "Removing Yiwu warehouse",
    children: [
      <DropdownMenuItem key="edit" onClick={edited}>
        Edit
      </DropdownMenuItem>,
      <DropdownMenuItem key="remove" variant="destructive" onClick={removed}>
        Remove
      </DropdownMenuItem>
    ]
  },
  beforeEach: () => {
    edited.mockClear()
    removed.mockClear()
  }
})

export const Menu = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More actions for Yiwu warehouse" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Remove" }))
    await expect(removed).toHaveBeenCalledOnce()
    await expect(edited).not.toHaveBeenCalled()
  }
})

// While an action runs, a spinner takes the button's place.
export const Pending = meta.story({
  args: { pending: true },
  play: async ({ canvas }) => {
    const spinner = canvas.getByRole("button", { name: "Removing Yiwu warehouse" })
    await expect(spinner).toBeDisabled()
    await expect(spinner).toHaveAttribute("aria-busy", "true")
    await expect(canvas.queryByRole("button", { name: "More actions for Yiwu warehouse" })).toBeNull()
  }
})
