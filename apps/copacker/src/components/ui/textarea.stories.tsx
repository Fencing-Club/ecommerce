import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { Textarea } from "./textarea"

const meta = preview.meta({
  component: Textarea,
  args: { "aria-label": "Note to supplier", placeholder: "Write a note", onChange: fn(), className: "max-w-md" }
})

export const Default = meta.story({
  play: async ({ canvas, args }) => {
    const textarea = canvas.getByRole("textbox", { name: "Note to supplier" })
    await expect(textarea).toHaveAttribute("data-slot", "textarea")
    await userEvent.type(textarea, "Pack 24 units{Enter}to a carton.")
    await expect(textarea).toHaveValue("Pack 24 units\nto a carton.")
    await expect(args.onChange).toHaveBeenCalled()
  }
})

// It grows with its text.
export const Grows = meta.story({
  play: async ({ canvas }) => {
    const textarea = canvas.getByRole("textbox", { name: "Note to supplier" })
    const before = textarea.getBoundingClientRect().height
    await userEvent.type(textarea, "One{Enter}Two{Enter}Three{Enter}Four{Enter}Five{Enter}Six")
    await expect(textarea.getBoundingClientRect().height).toBeGreaterThan(before)
  }
})

export const Disabled = meta.story({
  args: { disabled: true, defaultValue: "Sent to Lotus Manufacturing" },
  play: async ({ canvas, args }) => {
    const textarea = canvas.getByRole("textbox", { name: "Note to supplier" })
    await expect(textarea).toBeDisabled()
    await userEvent.type(textarea, "more")
    await expect(textarea).toHaveValue("Sent to Lotus Manufacturing")
    await expect(args.onChange).not.toHaveBeenCalled()
  }
})

export const Invalid = meta.story({
  args: { "aria-invalid": true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("textbox", { name: "Note to supplier" })).toBeInvalid()
  }
})
