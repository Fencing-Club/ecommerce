import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { Button } from "./button"
import { Spinner } from "./spinner"

const meta = preview.meta({
  title: "Foundations/Spinner",
  component: Spinner
})

export const Default = meta.story({
  play: async ({ canvasElement }) => {
    const spinner = canvasElement.querySelector("[data-slot=spinner]")
    // It's decoration: whatever it sits in says what's loading.
    await expect(spinner).toHaveAttribute("aria-hidden", "true")
    await expect(spinner).toHaveClass("animate-spin")
  }
})

export const Large = meta.story({
  args: { className: "size-8" },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("[data-slot=spinner]")?.getBoundingClientRect().width).toBe(32)
  }
})

// A button busy saving, as the forms' submit buttons show it.
export const InButton = meta.story({
  render: () => (
    <Button disabled>
      <Spinner data-icon="inline-start" />
      Saving
    </Button>
  ),
  play: async ({ canvas }) => {
    const button = canvas.getByRole("button", { name: "Saving" })
    await expect(button).toBeDisabled()
    await expect(button.querySelector("[data-slot=spinner]")).toBeInTheDocument()
  }
})
