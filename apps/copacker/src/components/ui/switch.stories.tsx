import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { Label } from "./label"
import { Switch } from "./switch"

const meta = preview.meta({
  title: "Foundations/Switch",
  component: Switch,
  args: { onCheckedChange: fn() },
  render: (args) => (
    <div className="flex items-center gap-2">
      <Switch id="auto-send" {...args} />
      <Label htmlFor="auto-send">Send purchase orders automatically</Label>
    </div>
  )
})

export const Default = meta.story({
  play: async ({ canvas, args }) => {
    const toggle = canvas.getByRole("switch", { name: "Send purchase orders automatically" })
    await expect(toggle).toHaveAttribute("aria-checked", "false")
    await expect(toggle).toHaveAttribute("data-size", "default")

    await userEvent.click(toggle)
    await expect(toggle).toHaveAttribute("aria-checked", "true")
    await expect(toggle).toHaveAttribute("data-checked")
    await expect(args.onCheckedChange).toHaveBeenLastCalledWith(true, expect.anything())

    // Space toggles it from the keyboard.
    toggle.focus()
    await userEvent.keyboard(" ")
    await expect(toggle).toHaveAttribute("aria-checked", "false")
    await expect(args.onCheckedChange).toHaveBeenLastCalledWith(false, expect.anything())
  }
})

export const Checked = meta.story({
  args: { defaultChecked: true },
  play: async ({ canvas, args }) => {
    const toggle = canvas.getByRole("switch")
    await expect(toggle).toHaveAttribute("aria-checked", "true")
    await userEvent.click(canvas.getByText("Send purchase orders automatically"))
    await expect(toggle).toHaveAttribute("aria-checked", "false")
    await expect(args.onCheckedChange).toHaveBeenCalledOnce()
  }
})

export const Small = meta.story({
  args: { size: "sm" },
  render: (args) => (
    <div className="flex items-center gap-4">
      <Switch aria-label="Small" {...args} />
      <Switch aria-label="Default" />
    </div>
  ),
  play: async ({ canvas }) => {
    const small = canvas.getByRole("switch", { name: "Small" })
    await expect(small).toHaveAttribute("data-size", "sm")
    await expect(small.getBoundingClientRect().width).toBeLessThan(
      canvas.getByRole("switch", { name: "Default" }).getBoundingClientRect().width
    )
  }
})

export const Disabled = meta.story({
  args: { disabled: true },
  play: async ({ canvas, args }) => {
    const toggle = canvas.getByRole("switch")
    await expect(toggle).toHaveAttribute("data-disabled")
    await userEvent.click(canvas.getByText("Send purchase orders automatically"))
    await expect(toggle).toHaveAttribute("aria-checked", "false")
    await expect(args.onCheckedChange).not.toHaveBeenCalled()
  }
})
