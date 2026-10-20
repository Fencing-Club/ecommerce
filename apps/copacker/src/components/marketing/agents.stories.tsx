import { expect, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { reduceMotion } from "@/stories/fixtures/marketing"
import { Agents } from "./agents"

// The diagram on the dark stage the home page sets it on.
const meta = preview.meta({
  title: "Components/Marketing/Agents",
  component: Agents,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="dark bg-[oklch(0.145_0_0)] px-6 py-16 text-foreground">
        <Story />
      </div>
    )
  ]
})

const firstStep = "Checked restock: 2 products run out before they arrive"
const secondStep = "Created purchase order 1043 for Shenzhen Metalworks"

// The step on show is the one at full opacity.
function shown(element: HTMLElement) {
  return element.closest(".col-start-1")?.classList.contains("opacity-100")
}

export const Default = meta.story({
  play: async ({ canvas }) => {
    // Screen readers get one line for the picture.
    const caption = canvas.getByText(
      "Your agent restocking through Copacker’s MCP server, while your supplier’s and forwarder’s agents post their updates"
    )
    await expect(caption.tagName).toBe("FIGCAPTION")
    const figure = canvas.getByRole("figure")
    // Wide enough to show whole, so it isn't a stop for the keyboard.
    await expect(figure).not.toHaveAttribute("tabindex")
    await expect(canvas.getByText("MCP")).toBeVisible()
    await expect(canvas.getByText("Your agent")).toBeVisible()
    await expect(canvas.getByText("Shenzhen Metalworks’s agent")).toBeVisible()
    await expect(canvas.getByText("Packing list submitted for purchase order 1043")).toBeVisible()
    await expect(canvas.getByText("Pickup booked for Oct 6")).toBeVisible()
    // Your agent's steps take turns.
    await expect(shown(canvas.getByText(firstStep))).toBe(true)
    await waitFor(() => expect(shown(canvas.getByText(secondStep))).toBe(true), { timeout: 4000 })
  }
})

// A phone scrolls the diagram sideways, so it takes focus for the keyboard to scroll it.
export const Phone = meta.story({
  globals: { viewport: { value: "iphone12", isRotated: false } },
  play: async ({ canvas }) => {
    const figure = canvas.getByRole("figure")
    await waitFor(() => expect(figure).toHaveAttribute("tabindex", "0"))
    await expect(figure.scrollWidth).toBeGreaterThan(figure.clientWidth)
  }
})

export const ReducedMotion = meta.story({
  beforeEach: reduceMotion,
  play: async ({ canvas }) => {
    // The steps hold on the first.
    await new Promise((resolve) => setTimeout(resolve, 3300))
    await expect(shown(canvas.getByText(firstStep))).toBe(true)
    await expect(shown(canvas.getByText(secondStep))).toBe(false)
  }
})
