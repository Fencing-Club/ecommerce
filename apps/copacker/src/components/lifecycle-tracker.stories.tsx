import { expect, userEvent, within } from "storybook/test"
import preview from "#.storybook/preview"
import { LifecycleTracker, type LifecycleStage } from "./lifecycle-tracker"

// PO-1045 as Harbor Goods sees it: accepted, one of its two shipments packed, and an invoice waiting on the buyer.
const purchaseOrder: LifecycleStage[] = [
  { id: "draft", label: "Draft", state: "done", caption: "Sep 21" },
  { id: "sent", label: "Sent", state: "done", caption: "Sep 22" },
  { id: "accepted", label: "Accepted", state: "done", caption: "Sep 24" },
  { id: "packing", label: "Packing", state: "attention", caption: "Waiting on you" },
  { id: "shipped", label: "Shipped", state: "upcoming", caption: "Pickup planned Oct 2" },
  { id: "received", label: "Received", state: "upcoming" },
  { id: "closed", label: "Closed", state: "upcoming" }
]

const meta = preview.meta({
  component: LifecycleTracker,
  args: { label: "Purchase order progress", stages: purchaseOrder }
})

export const PurchaseOrder = meta.story({
  play: async ({ canvas }) => {
    const tracker = canvas.getByRole("region", { name: "Purchase order progress" })
    const list = within(tracker).getAllByRole("list")[0]!
    await expect(within(list).getAllByRole("listitem")).toHaveLength(7)
    // Each stage's state is read out, not left to its color.
    await expect(within(list).getByText("Accepted, Done")).toBeInTheDocument()
    await expect(within(list).getByText("Packing, Waiting on you")).toBeInTheDocument()
    await expect(within(list).getByText("Closed, Not started")).toBeInTheDocument()
  }
})

// A shipment through a forwarder whose buyer arranges shipping, being packed by the supplier.
export const Shipment = meta.story({
  args: {
    label: "Shipment progress",
    stages: [
      { id: "packing", label: "Packing", state: "current", caption: "Lotus Manufacturing" },
      { id: "approval", label: "Approval", state: "upcoming" },
      { id: "amazon", label: "Amazon shipment", state: "upcoming" },
      { id: "labels", label: "Labels", state: "upcoming" },
      { id: "ready", label: "Ready for pickup", state: "upcoming", caption: "Planned Oct 2" },
      { id: "shipped", label: "Shipped", state: "upcoming" },
      { id: "forwarder", label: "At the forwarder", state: "upcoming" },
      { id: "onward", label: "Shipped onward", state: "upcoming" },
      { id: "received", label: "Received", state: "upcoming" }
    ]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Packing, Current")).toBeInTheDocument()
  }
})

// PO-1047, declined by Cedar Works: it stops at Sent, in the warning tone.
export const Declined = meta.story({
  args: {
    stages: [
      { id: "draft", label: "Draft", state: "done", caption: "Sep 18" },
      { id: "sent", label: "Declined", state: "attention", caption: "Sep 25" },
      { id: "accepted", label: "Accepted", state: "upcoming" },
      { id: "packing", label: "Packing", state: "upcoming" },
      { id: "shipped", label: "Shipped", state: "upcoming" },
      { id: "received", label: "Received", state: "upcoming" },
      { id: "closed", label: "Closed", state: "upcoming" }
    ]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Declined, Waiting on you")).toBeInTheDocument()
  }
})

// A draft that hasn't gone anywhere yet reads as its first step.
export const JustStarted = meta.story({
  globals: { viewport: { value: "iphone12", isRotated: false } },
  args: {
    stages: purchaseOrder.map((stage, index) =>
      index === 0
        ? { ...stage, state: "current" as const, caption: undefined }
        : { ...stage, state: "upcoming" as const, caption: undefined }
    )
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Step 1 of 7")).toBeVisible()
  }
})

// On a phone: the current stage in a card, and every stage behind All stages.
export const OnAPhone = meta.story({
  globals: { viewport: { value: "iphone12", isRotated: false } },
  play: async ({ canvas }) => {
    // The desktop row is in the page too, hidden, so look only at what shows.
    const shown = (text: string) => canvas.getAllByText(text).filter((element) => element.checkVisibility())
    await expect(canvas.getByText("Step 4 of 7")).toBeVisible()
    const toggle = canvas.getByRole("button", { name: "All stages" })
    await expect(toggle).toHaveAttribute("aria-expanded", "false")
    await expect(shown("Pickup planned Oct 2")).toHaveLength(0)
    await userEvent.click(toggle)
    await expect(toggle).toHaveAttribute("aria-expanded", "true")
    await expect(shown("Pickup planned Oct 2")).toHaveLength(1)
    await expect(canvas.getAllByText("Received, Not started").length).toBeGreaterThan(0)
  }
})
