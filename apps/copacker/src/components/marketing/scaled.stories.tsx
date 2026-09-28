import { expect, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { Scaled } from "./scaled"

// A shot drawn at 1280 by 800, in a column half as wide.
const meta = preview.meta({
  component: Scaled,
  args: {
    width: 1280,
    height: 800,
    children: <div className="flex size-full items-center justify-center bg-muted text-4xl font-semibold">Restock</div>
  },
  decorators: [
    (Story) => (
      <div data-testid="column" style={{ width: 640 }}>
        <Story />
      </div>
    )
  ]
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    const box = canvas.getByText("Restock").parentElement?.parentElement
    if (!box) {
      throw new Error("The shot has its box")
    }
    // The box keeps the shot's shape, and the shot is scaled to fit it.
    await expect(box.style.aspectRatio).toBe("1280 / 800")
    await expect(box.getBoundingClientRect().height).toBeCloseTo(400, 0)
    await waitFor(() => expect(box.style.getPropertyValue("--scale")).toBe("0.5"))
    // A narrower column scales it down again.
    canvas.getByTestId("column").style.width = "320px"
    await waitFor(() => expect(box.style.getPropertyValue("--scale")).toBe("0.25"))
  }
})
