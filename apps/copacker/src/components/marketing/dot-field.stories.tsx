import { expect, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { withoutWebGL } from "@/stories/fixtures/marketing"
import { DotField } from "./dot-field"

// The field fills the dark stage it's set in, as the hero's backdrop.
const meta = preview.meta({
  title: "Components/Marketing/Dot field",
  component: DotField,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="dark relative h-[32rem] overflow-hidden bg-[oklch(0.145_0_0)]">
        <Story />
      </div>
    )
  ]
})

function field(root: HTMLElement) {
  const canvas = root.querySelector("canvas")
  if (!canvas) {
    throw new Error("The field has its canvas")
  }
  return canvas
}

// The canvas is laid out to its box at the screen's density once WebGL starts, when the page is idle.
async function drawn(canvas: HTMLCanvasElement) {
  const dpr = Math.min(devicePixelRatio || 1, 2)
  await waitFor(() => expect(canvas.width).toBe(Math.round(canvas.clientWidth * dpr)), { timeout: 4000 })
  await expect(canvas.height).toBe(Math.round(canvas.clientHeight * dpr))
}

export const Scattered = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = field(canvasElement)
    await expect(canvas).toHaveAttribute("aria-hidden", "true")
    await expect(canvas.clientHeight).toBe(512)
    await drawn(canvas)
    await expect(canvas.getContext("webgl")?.isContextLost()).toBe(false)
  }
})

// Already in order, as the contact page opens.
export const Settled = meta.story({
  args: { settled: true },
  play: async ({ canvasElement }) => {
    await drawn(field(canvasElement))
  }
})

// Without WebGL the stage stays plain, and nothing breaks.
export const WithoutWebGL = meta.story({
  beforeEach: withoutWebGL,
  play: async ({ canvasElement }) => {
    const canvas = field(canvasElement)
    await new Promise((resolve) => setTimeout(resolve, 500))
    await expect(canvas).toBeInTheDocument()
    // Never laid out for drawing: a canvas's own size.
    await expect(canvas.width).toBe(300)
  }
})
