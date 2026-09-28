import { expect, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { reduceMotion, withoutWebGL } from "@/stories/fixtures/marketing"
import { Journey } from "./journey"

// The trip on the home page's paper, from the top of the section. Scrolling plays it, and the steps jump to a chapter.
const meta = preview.meta({
  component: Journey,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="light bg-(--paper) text-foreground [--paper:oklch(0.972_0.008_78)]">
        <Story />
      </div>
    )
  ],
  beforeEach: () => {
    scrollTo({ top: 0 })
  }
})

const steps = ["Order", "Pack", "Pick up", "Ship", "Customs", "Deliver"]

function current(canvas: ReturnType<typeof within>) {
  return within(canvas.getByRole("navigation", { name: "Steps" })).getByRole("button", { current: "step" })
}

export const Default = meta.story({
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas.getByRole("heading", {
        level: 2,
        name: "One purchase order, from the factory to Amazon and your warehouse"
      })
    ).toBeInTheDocument()
    // Screen readers get every chapter at once.
    await expect(canvas.getAllByRole("heading", { level: 3 })).toHaveLength(steps.length)
    const nav = within(canvas.getByRole("navigation", { name: "Steps" }))
    await expect(nav.getAllByRole("button").map((button) => button.textContent)).toEqual(steps)
    await expect(current(canvas)).toHaveTextContent("Order")
    await expect(canvas.getByText("0 documents")).toBeVisible()

    // The world draws once it's near, and fades in over the stills.
    const world = canvasElement.querySelector("canvas")
    await waitFor(() => expect(world).toHaveClass("opacity-100"), { timeout: 10000 })
    await expect(canvasElement.querySelector("picture")).toBeNull()

    // A step scrolls to its chapter, and the order's documents fill in on the way.
    await userEvent.click(nav.getByRole("button", { name: "Customs" }))
    await waitFor(() => expect(current(canvas)).toHaveTextContent("Customs"), { timeout: 10000 })
    await expect(scrollY).toBeGreaterThan(innerHeight)
    await waitFor(() => expect(canvas.getByText("8 documents")).toBeVisible())
    await waitFor(() => expect(canvas.getByText("PO-1043-bill-of-lading.pdf")).toBeVisible())
  }
})

// Without WebGL the chapters still play, over stills of the world.
export const WithoutWebGL = meta.story({
  beforeEach: withoutWebGL,
  play: async ({ canvas, canvasElement }) => {
    const still = await waitFor(
      () => {
        const image = canvasElement.querySelector("picture img")
        if (!image) {
          throw new Error("The still shows")
        }
        return image
      },
      { timeout: 10000 }
    )
    await expect(still).toHaveAttribute("src", "/marketing/journey/phone-0.jpg")
    await expect(canvasElement.querySelector("picture source")).toHaveAttribute(
      "srcset",
      "/marketing/journey/wide-0.jpg"
    )
    await expect(canvasElement.querySelector("canvas")).toHaveClass("opacity-0")

    await userEvent.click(canvas.getByRole("button", { name: "Ship" }))
    await waitFor(() => expect(current(canvas)).toHaveTextContent("Ship"), { timeout: 10000 })
    await waitFor(() =>
      expect(canvasElement.querySelector("picture source")).toHaveAttribute("srcset", "/marketing/journey/wide-3.jpg")
    )
  }
})

// With reduced motion the trip steps from chapter to chapter, and a step jumps straight there.
export const ReducedMotion = meta.story({
  beforeEach: reduceMotion,
  play: async ({ canvas }) => {
    await expect(current(canvas)).toHaveTextContent("Order")
    await userEvent.click(canvas.getByRole("button", { name: "Deliver" }))
    await waitFor(() => expect(current(canvas)).toHaveTextContent("Deliver"))
    await waitFor(() => expect(canvas.getByText("8 documents")).toBeVisible())
  }
})

// A phone shows the latest document saved under the words, in place of the list.
export const Phone = meta.story({
  globals: { viewport: { value: "iphone12", isRotated: false } },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Pack" }))
    await waitFor(() => expect(current(canvas)).toHaveTextContent("Pack"), { timeout: 10000 })
    await waitFor(() => expect(canvas.getByText(/^Saved to the purchase order: /)).toBeVisible())
    await expect(canvas.getByText(/^\d+ documents?$/)).not.toBeVisible()
  }
})
