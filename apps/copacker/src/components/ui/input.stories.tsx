import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { Input, NumberInput } from "./input"

const meta = preview.meta({
  title: "Foundations/Input",
  component: Input,
  args: { "aria-label": "SKU", placeholder: "HT-01", onChange: fn() }
})

export const Default = meta.story({
  play: async ({ canvas, args }) => {
    const input = canvas.getByRole("textbox", { name: "SKU" })
    await expect(input).toHaveAttribute("data-slot", "input")
    await userEvent.type(input, "HT-02")
    await expect(input).toHaveValue("HT-02")
    await expect(args.onChange).toHaveBeenCalledTimes(5)
  }
})

// A number without the browser's up and down buttons, its digits lined up.
export const Numbers = meta.story({
  args: { "aria-label": "Units", min: 0, defaultValue: 24, placeholder: undefined },
  render: (args) => <NumberInput {...args} />,
  play: async ({ canvas }) => {
    const input = canvas.getByRole("spinbutton", { name: "Units" })
    await expect(input).toHaveValue(24)
    await expect(getComputedStyle(input).appearance).toBe("textfield")
    await userEvent.clear(input)
    await userEvent.type(input, "36")
    await expect(input).toHaveValue(36)
  }
})

export const FileInput = meta.story({
  args: { "aria-label": "Barcodes", type: "file", accept: ".pdf", placeholder: undefined },
  play: async ({ canvas, args }) => {
    const input = canvas.getByLabelText("Barcodes")
    const file = new File(["%PDF"], "barcodes.pdf", { type: "application/pdf" })
    await userEvent.upload(input, file)
    await expect(input).toHaveProperty("files.0.name", "barcodes.pdf")
    await expect(args.onChange).toHaveBeenCalledOnce()
  }
})

export const Disabled = meta.story({
  args: { disabled: true, defaultValue: "HT-01" },
  play: async ({ canvas, args }) => {
    const input = canvas.getByRole("textbox", { name: "SKU" })
    await expect(input).toBeDisabled()
    await userEvent.type(input, "X")
    await expect(input).toHaveValue("HT-01")
    await expect(args.onChange).not.toHaveBeenCalled()
  }
})

export const Invalid = meta.story({
  args: { "aria-invalid": true, defaultValue: "HT 01" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("textbox", { name: "SKU" })).toBeInvalid()
  }
})
