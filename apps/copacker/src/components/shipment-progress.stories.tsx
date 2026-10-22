import { expect, waitFor } from "storybook/test"
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

// While Amazon creates the shipment, the page refreshes every five seconds.
export const Processing = meta.story({
  args: { processing: true, message: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("status")).toBeNull()
    await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalled(), { timeout: 7000 })
  }
})
