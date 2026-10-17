import { expect, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { type ActionRequest, recordActions, serverError, shipmentId } from "@/stories/fixtures/logistics"
import { ShipmentTransportSettings } from "./shipment-transport"

const sent: ActionRequest[] = []
const agl = {
  service: "agl",
  handoff: "supplier",
  collection: "pickup",
  carrierLabels: "none",
  instructions: ""
} as const
const meta = preview.meta({
  component: ShipmentTransportSettings,
  args: { id: shipmentId, revision: 1, initial: null, hasForwarder: false },
  beforeEach: ({ msw }) => {
    sent.length = 0
    msw.use(recordActions(sent))
  }
})

export const ConfigureAgl = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Service" }))
    await userEvent.click(await screen.findByRole("option", { name: "Amazon Global Logistics (AGL)" }))
    await expect(canvas.getByRole("combobox", { name: "Carrier labels" })).toHaveTextContent("Not required")
    await userEvent.click(canvas.getByRole("button", { name: "Save transport" }))
    await waitFor(() =>
      expect(sent).toEqual([
        { action: "shipment.transport", data: { id: shipmentId, revision: 1, expected: null, transport: agl } }
      ])
    )
  }
})

export const ForwarderPickup = meta.story({
  args: { initial: { ...agl, handoff: "forwarder" }, hasForwarder: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("combobox", { name: "Handoff location" })).toHaveTextContent("Freight forwarder")
    await userEvent.click(canvas.getByRole("combobox", { name: "Carrier labels" }))
    await userEvent.click(await screen.findByRole("option", { name: "One per carton" }))
    await userEvent.click(canvas.getByRole("button", { name: "Save transport" }))
    await waitFor(() =>
      expect(sent[0]?.data.transport).toMatchObject({
        service: "agl",
        handoff: "forwarder",
        carrierLabels: "per_carton"
      })
    )
  }
})

export const Released = meta.story({
  args: { initial: agl, editable: false },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Amazon Global Logistics (AGL) / Supplier / Carrier pickup")).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Save transport" })).toBeNull()
  }
})

export const SaveFailure = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, () => serverError("Transport changed or is already released. Reload the shipment.")))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Save transport" }))
    await expect(
      await canvas.findByText("Transport changed or is already released. Reload the shipment.")
    ).toBeVisible()
  }
})
