import { expect, fn, userEvent, within } from "storybook/test"
import preview from "#.storybook/preview"
import { SaveBar } from "./save-bar"

// The bar a form shows while it has unsaved changes, with Discard and Save.
const meta = preview.meta({
  title: "Components/Forms/Save bar",
  component: SaveBar,
  args: { dirty: true, pending: false, onDiscard: fn(), onSave: fn() }
})

export const Dirty = meta.story({
  play: async ({ args, canvas }) => {
    const bar = canvas.getByRole("region", { name: "Unsaved changes" })
    await expect(within(bar).getByText("Unsaved changes")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await expect(args.onSave).toHaveBeenCalledOnce()
    await userEvent.click(canvas.getByRole("button", { name: "Discard" }))
    await expect(args.onDiscard).toHaveBeenCalledOnce()
  }
})

export const WithMessage = meta.story({
  args: { message: "3 unsaved changes" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("3 unsaved changes")).toBeVisible()
  }
})

export const Saving = meta.story({
  args: { pending: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Saving…" })).toBeDisabled()
    await expect(canvas.getByRole("button", { name: "Discard" })).toBeDisabled()
  }
})

export const CantSave = meta.story({
  args: { canSave: false },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled()
    await expect(canvas.getByRole("button", { name: "Discard" })).toBeEnabled()
  }
})

export const Error = meta.story({
  args: { dirty: false, error: "Couldn’t save. Try again." },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Couldn’t save. Try again.")).toBeVisible()
    // Nothing is unsaved, so there's nothing to discard or save again.
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled()
  }
})

export const Clean = meta.story({
  args: { dirty: false },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("region", { name: "Unsaved changes" })).toBeNull()
  }
})
