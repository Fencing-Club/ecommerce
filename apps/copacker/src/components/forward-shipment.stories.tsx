import { expect, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { type ActionRequest, recordActions, serverError, shipmentId } from "@/stories/fixtures/logistics"
import { ForwardShipment } from "./forward-shipment"

const sent: ActionRequest[] = []

const meta = preview.meta({
  component: ForwardShipment,
  args: { shipmentId, currency: "USD" },
  beforeEach: ({ msw }) => {
    sent.length = 0
    msw.use(recordActions(sent))
  }
})

export const MarkShipped = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Mark shipped" }))
    const dialog = await screen.findByRole("dialog", { name: "Mark shipped" })
    await expect(dialog).toHaveTextContent("The freight cost is added to the purchase order’s landed costs.")
    await userEvent.type(screen.getByRole("textbox", { name: "Freight cost" }), "1,250.50")
    await userEvent.type(screen.getByRole("textbox", { name: "Carrier" }), "Maersk")
    await userEvent.type(screen.getByRole("textbox", { name: "Tracking or booking number" }), "MAEU1234567")
    await userEvent.click(screen.getAllByRole("button", { name: "Mark shipped" }).at(-1)!)
    await waitFor(() =>
      expect(sent).toEqual([
        {
          action: "shipment.forward",
          data: {
            id: shipmentId,
            carrier: "Maersk",
            reference: "MAEU1234567",
            freight: { amountMinor: 125050, currency: "USD" }
          }
        }
      ])
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalled())
  }
})

export const Validation = meta.story({
  args: { currency: "EUR" },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Mark shipped" }))
    const dialog = await screen.findByRole("dialog")
    await expect(dialog).toHaveTextContent("EUR")
    await userEvent.click(screen.getAllByRole("button", { name: "Mark shipped" }).at(-1)!)
    await expect(await screen.findByText("Enter the freight cost")).toBeInTheDocument()
    await expect(screen.getByText("Enter the carrier")).toBeInTheDocument()
    await expect(screen.getByText("Enter the tracking or booking number")).toBeInTheDocument()
    await expect(sent).toHaveLength(0)
    // Cancel closes without sending.
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await expect(sent).toHaveLength(0)
  }
})

export const ServerError = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, () => serverError("This shipment was already marked shipped.")))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Mark shipped" }))
    await screen.findByRole("dialog")
    await userEvent.type(screen.getByRole("textbox", { name: "Freight cost" }), "0")
    await userEvent.type(screen.getByRole("textbox", { name: "Carrier" }), "COSCO")
    await userEvent.type(screen.getByRole("textbox", { name: "Tracking or booking number" }), "BK-2291")
    await userEvent.click(screen.getAllByRole("button", { name: "Mark shipped" }).at(-1)!)
    await expect(await screen.findByText("This shipment was already marked shipped.")).toBeInTheDocument()
    // The dialog stays open to try again.
    await expect(screen.getByRole("dialog")).toBeInTheDocument()
  }
})
