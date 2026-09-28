import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { expect, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { ShipmentProgress } from "./shipment-progress"

const meta = preview.meta({
  component: ShipmentProgress,
  args: { processing: false, message: "The forwarder ships it on next." }
})

export const NextStep = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("The forwarder ships it on next.")
    await expect(getRouter().refresh).not.toHaveBeenCalled()
  }
})

// While Amazon creates the shipment, the page refreshes every five seconds.
export const Processing = meta.story({
  args: { processing: true, message: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("status")).toBeNull()
    await waitFor(() => expect(getRouter().refresh).toHaveBeenCalled(), { timeout: 7000 })
  }
})
