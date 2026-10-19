import { expect, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { reduceMotion } from "@/stories/fixtures/marketing"
import { Ticker } from "./ticker"

const lines = ["Checked restock", "Created purchase order 1043", "Sent purchase order 1043"].map((text) => ({
  key: text,
  content: <span>{text}</span>
}))

// The line on show is the one at full opacity.
function shown(element: HTMLElement) {
  return element.closest(".col-start-1")?.classList.contains("opacity-100")
}

const meta = preview.meta({ title: "Components/Marketing/Ticker", component: Ticker, args: { lines, every: 300 } })

export const Default = meta.story({
  play: async ({ canvas }) => {
    const [first, second, third] = lines.map((line) => canvas.getByText(line.key))
    if (!first || !second || !third) {
      throw new Error("Every line renders")
    }
    await expect(shown(first)).toBe(true)
    await expect(shown(second)).toBe(false)
    // One line at a time, in turn, and back to the first.
    await waitFor(() => expect(shown(second)).toBe(true))
    await expect(shown(first)).toBe(false)
    await waitFor(() => expect(shown(third)).toBe(true))
    await waitFor(() => expect(shown(first)).toBe(true))
  }
})

export const ReducedMotion = meta.story({
  beforeEach: reduceMotion,
  play: async ({ canvas }) => {
    const first = canvas.getByText("Checked restock")
    await new Promise((resolve) => setTimeout(resolve, 700))
    // The first line stays.
    await expect(shown(first)).toBe(true)
    await expect(shown(canvas.getByText("Created purchase order 1043"))).toBe(false)
  }
})
