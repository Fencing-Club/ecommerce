import { expect, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { Input } from "./input"
import { Label } from "./label"

const meta = preview.meta({
  title: "Foundations/Label",
  component: Label,
  args: { htmlFor: "supplier-sku", children: "Supplier SKU" },
  render: (args) => (
    <div className="flex max-w-sm flex-col gap-2">
      <Label {...args} />
      <Input id="supplier-sku" />
    </div>
  )
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    const input = canvas.getByRole("textbox", { name: "Supplier SKU" })
    await expect(canvas.getByText("Supplier SKU")).toHaveAttribute("data-slot", "label")
    // Clicking the label focuses its input.
    await userEvent.click(canvas.getByText("Supplier SKU"))
    await expect(input).toHaveFocus()
  }
})

export const Disabled = meta.story({
  render: (args) => (
    <div className="group flex max-w-sm flex-col gap-2" data-disabled="true">
      <Label {...args} />
      <Input id="supplier-sku" disabled />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("textbox", { name: "Supplier SKU" })).toBeDisabled()
    await expect(getComputedStyle(canvas.getByText("Supplier SKU")).opacity).toBe("0.5")
  }
})
