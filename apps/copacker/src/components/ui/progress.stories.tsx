import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { Progress, ProgressLabel, ProgressValue } from "./progress"

const meta = preview.meta({
  component: Progress,
  args: { value: 40, className: "w-72" }
})

// The bar fills to its value, named for what it measures.
export const Default = meta.story({
  args: { "aria-label": "Upload" },
  play: async ({ canvas }) => {
    const bar = canvas.getByRole("progressbar", { name: "Upload" })
    await expect(bar).toHaveAttribute("aria-valuenow", "40")
    const indicator = bar.querySelector("[data-slot=progress-indicator]")
    if (!(indicator instanceof HTMLElement)) {
      throw new Error("The bar has no indicator")
    }
    await expect(indicator.style.width).toBe("40%")
  }
})

// A label names the bar, and the value reads beside it.
export const WithLabel = meta.story({
  render: (args) => (
    <Progress {...args}>
      <ProgressLabel>Uploading</ProgressLabel>
      <ProgressValue />
    </Progress>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("progressbar", { name: "Uploading" })).toBeVisible()
    await expect(canvas.getByText("40%")).toBeVisible()
  }
})

// Steps of a flow, as the booking dialogs count them: the bar reads as the step, not a percentage.
export const Steps = meta.story({
  args: { value: 2, max: 3, "aria-label": "Booking", getAriaValueText: () => "Step 2 of 3" },
  play: async ({ canvas }) => {
    const bar = canvas.getByRole("progressbar", { name: "Booking" })
    await expect(bar).toHaveAttribute("aria-valuemax", "3")
    await expect(bar).toHaveAttribute("aria-valuetext", "Step 2 of 3")
  }
})
