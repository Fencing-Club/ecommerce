import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { Checkbox } from "./checkbox"
import { Field, FieldContent, FieldDescription, FieldLabel } from "./field"
import { Label } from "./label"

const meta = preview.meta({
  title: "Foundations/Checkbox",
  component: Checkbox,
  args: { onCheckedChange: fn() },
  render: (args) => (
    <div className="flex items-center gap-2">
      <Checkbox id="notify" {...args} />
      <Label htmlFor="notify">Email me when a purchase order ships</Label>
    </div>
  )
})

export const Default = meta.story({
  play: async ({ canvas, args }) => {
    const checkbox = canvas.getByRole("checkbox", { name: "Email me when a purchase order ships" })
    await expect(checkbox).toHaveAttribute("aria-checked", "false")

    await userEvent.click(checkbox)
    await expect(checkbox).toHaveAttribute("aria-checked", "true")
    await expect(checkbox).toHaveAttribute("data-checked")
    await expect(args.onCheckedChange).toHaveBeenLastCalledWith(true, expect.anything())

    // The label toggles it too.
    await userEvent.click(canvas.getByText("Email me when a purchase order ships"))
    await expect(checkbox).toHaveAttribute("aria-checked", "false")
    await expect(args.onCheckedChange).toHaveBeenLastCalledWith(false, expect.anything())
  }
})

export const Checked = meta.story({
  args: { defaultChecked: true },
  play: async ({ canvas }) => {
    const checkbox = canvas.getByRole("checkbox")
    await expect(checkbox).toHaveAttribute("aria-checked", "true")
    await expect(checkbox.querySelector("svg")).toBeInTheDocument()
    checkbox.focus()
    await userEvent.keyboard(" ")
    await expect(checkbox).toHaveAttribute("aria-checked", "false")
  }
})

export const Indeterminate = meta.story({
  args: { indeterminate: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("checkbox")).toHaveAttribute("aria-checked", "mixed")
    // A filled box with a minus, not a tick.
    await expect(canvas.getByRole("checkbox").querySelector(".lucide-minus")).toBeVisible()
    await expect(canvas.getByRole("checkbox").querySelector(".lucide-check")).not.toBeVisible()
  }
})

export const Disabled = meta.story({
  args: { disabled: true },
  play: async ({ canvas, args }) => {
    const checkbox = canvas.getByRole("checkbox")
    await expect(checkbox).toHaveAttribute("aria-disabled", "true")
    await userEvent.click(canvas.getByText("Email me when a purchase order ships"))
    await expect(checkbox).toHaveAttribute("aria-checked", "false")
    await expect(args.onCheckedChange).not.toHaveBeenCalled()
  }
})

export const Invalid = meta.story({
  args: { "aria-invalid": true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("checkbox")).toHaveAttribute("aria-invalid", "true")
  }
})

// In a horizontal field with a description, as the settings forms lay them out.
export const InField = meta.story({
  render: (args) => (
    <Field orientation="horizontal" className="max-w-sm">
      <Checkbox id="split" {...args} />
      <FieldContent>
        <FieldLabel htmlFor="split">Split packs into units</FieldLabel>
        <FieldDescription>A pack of 6 counts as 6 units in stock.</FieldDescription>
      </FieldContent>
    </Field>
  ),
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByText("Split packs into units"))
    await expect(canvas.getByRole("checkbox", { name: "Split packs into units" })).toBeChecked()
    await expect(args.onCheckedChange).toHaveBeenCalledOnce()
  }
})
