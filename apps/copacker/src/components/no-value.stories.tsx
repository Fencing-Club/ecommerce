import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { NoValue } from "./no-value"

// The dash for a value that's missing or doesn't apply, such as a product without a category.
const meta = preview.meta({
  title: "Components/Display/No value",
  component: NoValue
})

// A dash on screen, and "None" for screen readers.
export const None = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("—")).toHaveAttribute("aria-hidden", "true")
    await expect(canvas.getByText("None")).toHaveClass("sr-only")
  }
})

// A reason, such as why a quantity is missing, is read out in place of "None" and shows on hover.
export const WithReason = meta.story({
  args: { reason: "Not tracked" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Not tracked")).toHaveClass("sr-only")
    await expect(canvas.getByTitle("Not tracked")).toHaveTextContent("—")
    await expect(canvas.queryByText("None")).toBeNull()
  }
})
