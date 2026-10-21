import { expect, fn, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { type ActionRequest, recordActions, serverError, shipmentId } from "@/stories/fixtures/logistics"
import { ApproveInvoice, CorrectionForm, ReconcileShipment, LinkExistingShipment } from "./shipment-actions"

const sent: ActionRequest[] = []
const linked = fn(async (_shipmentId: string | null) => undefined)

const meta = preview.meta({
  title: "Components/Shipments/Shipment actions",
  component: ApproveInvoice,
  args: { id: shipmentId, revision: 3 },
  beforeEach: ({ msw }) => {
    sent.length = 0
    msw.use(recordActions(sent))
  }
})

export const LinkExistingAwd = meta.story({
  render: () => <LinkExistingShipment onLink={linked} linkedId={null} />,
  play: async ({ canvas }) => {
    const field = canvas.getByRole("textbox", { name: "AWD shipment ID" })
    await userEvent.type(field, "invalid")
    await userEvent.click(canvas.getByRole("button", { name: "Link shipment" }))
    await expect(await canvas.findByText("Enter a shipment ID starting with STAR-")).toBeVisible()
    await expect(sent).toHaveLength(0)
    await userEvent.clear(field)
    await userEvent.type(field, "star-example")
    await userEvent.click(canvas.getByRole("button", { name: "Link shipment" }))
    await waitFor(() => expect(linked).toHaveBeenCalledWith("STAR-EXAMPLE"))
  }
})

export const ExistingAwdLinked = meta.story({
  render: () => <LinkExistingShipment onLink={linked} linkedId="STAR-EXAMPLE" />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Linked to STAR-EXAMPLE/)).toBeVisible()
    await expect(canvas.queryByRole("textbox")).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "Remove link" }))
    await waitFor(() => expect(linked).toHaveBeenCalledWith(null))
  }
})

export const Approve = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Shopify costs must be in the purchase order’s currency.")).toBeVisible()
    await userEvent.click(canvas.getByRole("checkbox", { name: "Also update Shopify unit costs" }))
    await userEvent.click(canvas.getByRole("button", { name: "Approve changes" }))
    await waitFor(() =>
      expect(sent).toEqual([{ action: "shipment.approve", data: { id: shipmentId, revision: 3, updateCost: true } }])
    )
    await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalled())
  }
})

// Approving needs no change first, and leaves Shopify's costs alone unless asked.
export const ApproveWithoutCosts = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Approve changes" })).toBeEnabled()
    await userEvent.click(canvas.getByRole("button", { name: "Approve changes" }))
    await waitFor(() => expect(sent).toHaveLength(1))
    await expect(sent[0]?.data).toEqual({ id: shipmentId, revision: 3, updateCost: false })
  }
})

export const ApproveFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, () => serverError("The invoice changed. Reload to see the latest version.")))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Approve changes" }))
    await expect(await canvas.findByText("The invoice changed. Reload to see the latest version.")).toBeVisible()
    await expect(getStoryRouter().invalidate).not.toHaveBeenCalled()
  }
})

export const Correction = meta.story({
  render: () => <CorrectionForm id={shipmentId} />,
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("textbox")).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "Request a correction" }))
    const reason = await canvas.findByRole("textbox", { name: "What needs to change?" })
    await expect(canvas.getByText("This shipment’s documents become outdated.")).toBeVisible()
    await userEvent.type(reason, "ab")
    await userEvent.click(canvas.getByRole("button", { name: "Request correction" }))
    await expect(await canvas.findByText("Enter at least 3 characters")).toBeVisible()
    await userEvent.type(reason, "c: carton C2 weighs 19 kg")
    await userEvent.click(canvas.getByRole("button", { name: "Request correction" }))
    await waitFor(() =>
      expect(sent).toEqual([
        { action: "shipment.correct", data: { id: shipmentId, reason: "abc: carton C2 weighs 19 kg" } }
      ])
    )
  }
})

export const CorrectionFails = meta.story({
  render: () => <CorrectionForm id={shipmentId} />,
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, () => serverError("This shipment was already picked up.")))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Request a correction" }))
    await userEvent.type(await canvas.findByRole("textbox", { name: "What needs to change?" }), "Wrong carton count")
    await userEvent.click(canvas.getByRole("button", { name: "Request correction" }))
    await expect(await canvas.findByText("This shipment was already picked up.")).toBeVisible()
  }
})

// An AWD order is linked by its STAR- ID, typed in any case.
export const ReconcileAwd = meta.story({
  render: () => <ReconcileShipment id={shipmentId} fba={false} />,
  play: async ({ canvas }) => {
    const field = canvas.getByRole("textbox", { name: "Existing Amazon AWD order ID" })
    await expect(field).toHaveAttribute("placeholder", "STAR-")
    await userEvent.type(field, "wf1234")
    await userEvent.click(canvas.getByRole("button", { name: "Verify and resume" }))
    await expect(await canvas.findByText("Enter the Amazon order ID, which starts with STAR-")).toBeVisible()
    await userEvent.clear(field)
    await userEvent.type(field, "star-8kq2m7")
    await userEvent.click(canvas.getByRole("button", { name: "Verify and resume" }))
    await waitFor(() =>
      expect(sent).toEqual([{ action: "shipment.reconcile", data: { id: shipmentId, amazonOrderId: "STAR-8KQ2M7" } }])
    )
  }
})

export const ReconcileFba = meta.story({
  render: () => <ReconcileShipment id={shipmentId} fba />,
  play: async ({ canvas }) => {
    const field = canvas.getByRole("textbox", { name: "Existing FBA inbound plan ID" })
    await expect(field).toHaveAttribute("placeholder", "wf")
    await userEvent.type(field, "STAR-8KQ2M7")
    await userEvent.click(canvas.getByRole("button", { name: "Verify and resume" }))
    await expect(await canvas.findByText("Enter the inbound plan ID, which starts with wf")).toBeVisible()
    await userEvent.clear(field)
    const plan = "WF0A1B2C3D-4E5F-6A7B-8C9D-0E1F2A3B4C5D"
    await userEvent.type(field, plan)
    await userEvent.click(canvas.getByRole("button", { name: "Verify and resume" }))
    await waitFor(() => expect(sent).toHaveLength(1))
    await expect(sent[0]).toEqual({
      action: "shipment.reconcile",
      data: { id: shipmentId, amazonOrderId: plan.toLowerCase() }
    })
  }
})

export const ReconcileFails = meta.story({
  render: () => <ReconcileShipment id={shipmentId} fba={false} />,
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, () => serverError("Amazon has no order STAR-8KQ2M7.")))
  },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole("textbox", { name: "Existing Amazon AWD order ID" }), "STAR-8KQ2M7")
    await userEvent.click(canvas.getByRole("button", { name: "Verify and resume" }))
    await expect(await screen.findByText("Amazon has no order STAR-8KQ2M7.")).toBeInTheDocument()
  }
})
