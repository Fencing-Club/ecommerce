import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { Slider } from "./slider"

const meta = preview.meta({
  title: "Foundations/Slider",
  component: Slider,
  args: { onValueChange: fn(), defaultValue: [40] },
  // Labelled by the text above it, as the planner's sliders are.
  render: (args) => (
    <div className="flex max-w-sm flex-col gap-3">
      <span id="orders-label" className="text-sm font-medium">
        Monthly orders
      </span>
      <Slider aria-labelledby="orders-label" {...args} />
    </div>
  )
})

export const Default = meta.story({
  play: async ({ canvas, args }) => {
    const slider = canvas.getByRole("slider", { name: "Monthly orders" })
    await expect(slider).toHaveAttribute("aria-valuenow", "40")
    slider.focus()
    await userEvent.keyboard("{ArrowRight}")
    await expect(slider).toHaveAttribute("aria-valuenow", "41")
    await expect(args.onValueChange).toHaveBeenLastCalledWith([41], expect.anything())
    // Page keys move by a larger step, and Home and End go to the ends.
    await userEvent.keyboard("{PageUp}")
    await expect(slider).toHaveAttribute("aria-valuenow", "51")
    await userEvent.keyboard("{End}")
    await expect(slider).toHaveAttribute("aria-valuenow", "100")
    await userEvent.keyboard("{Home}")
    await expect(slider).toHaveAttribute("aria-valuenow", "0")
  }
})

// A planner's slider with its own range and step.
export const Stepped = meta.story({
  args: { min: 100, max: 5000, step: 100, defaultValue: [1000] },
  play: async ({ canvas, args }) => {
    const slider = canvas.getByRole("slider")
    await expect(slider).toHaveAttribute("min", "100")
    await expect(slider).toHaveAttribute("max", "5000")
    slider.focus()
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}")
    await expect(slider).toHaveAttribute("aria-valuenow", "800")
    await expect(args.onValueChange).toHaveBeenLastCalledWith([800], expect.anything())
  }
})

// Two thumbs pick a range.
export const Range = meta.story({
  args: { defaultValue: [20, 80] },
  play: async ({ canvas, args }) => {
    const [low, high] = canvas.getAllByRole("slider", { name: "Monthly orders" })
    await expect(low).toHaveAttribute("aria-valuenow", "20")
    await expect(high).toHaveAttribute("aria-valuenow", "80")
    high?.focus()
    await userEvent.keyboard("{ArrowLeft}")
    await expect(high).toHaveAttribute("aria-valuenow", "79")
    await expect(args.onValueChange).toHaveBeenLastCalledWith([20, 79], expect.anything())
  }
})

// A single number, rather than a list of one, has one thumb.
export const SingleNumber = meta.story({
  args: { defaultValue: 40 },
  play: async ({ canvas, canvasElement, args }) => {
    await expect(canvasElement.querySelectorAll("[data-slot=slider-thumb]")).toHaveLength(1)
    const slider = canvas.getByRole("slider", { name: "Monthly orders" })
    await expect(slider).toHaveAttribute("aria-valuenow", "40")
    slider.focus()
    await userEvent.keyboard("{ArrowRight}")
    await expect(args.onValueChange).toHaveBeenLastCalledWith(41, expect.anything())
  }
})

export const WithoutValue = meta.story({
  args: { defaultValue: undefined },
  play: async ({ canvasElement }) => {
    // With no value yet, a thumb sits at each end of the range.
    await expect(canvasElement.querySelectorAll("[data-slot=slider-thumb]")).toHaveLength(2)
  }
})

export const Vertical = meta.story({
  args: { orientation: "vertical", className: "h-40" },
  play: async ({ canvas }) => {
    const slider = canvas.getByRole("slider")
    await expect(slider).toHaveAttribute("aria-orientation", "vertical")
    slider.focus()
    await userEvent.keyboard("{ArrowUp}")
    await expect(slider).toHaveAttribute("aria-valuenow", "41")
  }
})

export const Disabled = meta.story({
  args: { disabled: true },
  play: async ({ canvas, args }) => {
    const slider = canvas.getByRole("slider")
    await expect(slider).toBeDisabled()
    slider.focus()
    await userEvent.keyboard("{ArrowRight}")
    await expect(slider).toHaveAttribute("aria-valuenow", "40")
    await expect(args.onValueChange).not.toHaveBeenCalled()
  }
})
