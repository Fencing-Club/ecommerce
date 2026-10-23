import { expect, mocked, spyOn, waitFor } from "storybook/test"
import invariant from "tiny-invariant"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { ShipmentProgress } from "./shipment-progress"

const meta = preview.meta({
  title: "Components/Shipments/Shipment progress",
  component: ShipmentProgress,
  args: { processing: false, message: "Cancel the existing Amazon shipment before creating a replacement" }
})

export const NextStep = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Cancel the existing Amazon shipment before creating a replacement"
    )
    await expect(getStoryRouter().invalidate).not.toHaveBeenCalled()
  }
})

// While Amazon creates the shipment, the page refreshes every five seconds. The play runs the timer's tick itself
// instead of waiting five seconds for it.
export const Processing = meta.story({
  args: { processing: true, message: undefined },
  beforeEach: () => {
    const timers = spyOn(window, "setInterval")
    return () => timers.mockRestore()
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("status")).toBeNull()
    await waitFor(() => expect(window.setInterval).toHaveBeenCalledWith(expect.any(Function), 5000))
    const [tick] = mocked(window.setInterval).mock.calls.find(([, delay]) => delay === 5000) ?? []
    invariant(typeof tick === "function")
    tick()
    await expect(getStoryRouter().invalidate).toHaveBeenCalled()
  }
})
