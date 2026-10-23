import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { Button } from "@/components/ui/button"
import { NextStepCard } from "./next-step"

const meta = preview.meta({
  title: "Unused/Display/Next step",
  component: NextStepCard,
  args: {
    title: "Approve the invoice for shipment 1",
    meta: "48 days left",
    metaDetail: "Required by Nov 15",
    secondary: <Button variant="outline">Request correction</Button>,
    primary: <Button>Approve invoice</Button>
  }
})

export const Yours = meta.story({
  play: async ({ canvas }) => {
    const card = canvas.getByRole("region", { name: "Approve the invoice for shipment 1" })
    await expect(card).not.toHaveAttribute("data-waiting")
    await expect(canvas.getByText("Your next step")).toBeVisible()
    await expect(canvas.getByRole("heading", { level: 2 })).toHaveTextContent("Approve the invoice for shipment 1")
    await expect(canvas.getByRole("button", { name: "Approve invoice" })).toBeVisible()
    await expect(canvas.getByText("Required by Nov 15")).toBeVisible()
  }
})

// While Amazon receives it, the buyer can only open Seller Central.
export const Waiting = meta.story({
  args: {
    waitingOn: "Amazon",
    title: "Amazon is receiving shipment 1",
    meta: undefined,
    metaDetail: undefined,
    secondary: <Button variant="outline">Open in Seller Central</Button>,
    primary: undefined
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Waiting on Amazon")).toBeVisible()
    // A waiting card is quiet: white, with a gray border.
    const card = canvas.getByRole("region", { name: "Amazon is receiving shipment 1" })
    await expect(card).toHaveAttribute("data-waiting")
  }
})

// PO-1047, declined: the supplier's reason is the alert.
export const WithAlert = meta.story({
  args: {
    title: "Cedar Works declined PO-1047",
    alert: "We can't make the walnut boards before January.",
    meta: undefined,
    metaDetail: undefined,
    secondary: <Button variant="outline">Close purchase order</Button>,
    primary: <Button>Edit and send again</Button>
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("We can't make the walnut boards before January.")).toBeVisible()
  }
})

// Copacker creating the Amazon shipment: nothing to do until it finishes.
export const Working = meta.story({
  args: {
    working: true,
    title: "Creating the Amazon shipment",
    detail: "This takes a minute or two.",
    meta: undefined,
    metaDetail: undefined,
    secondary: undefined,
    primary: undefined
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Working on it")).toBeVisible()
    await expect(canvas.queryByRole("button")).not.toBeInTheDocument()
  }
})

// On a phone the card keeps its words and meta; its actions move to the docked action bar.
export const OnAPhone = meta.story({
  globals: { viewport: { value: "iphone12", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Your next step")).toBeVisible()
    await expect(canvas.getByText("48 days left")).toBeVisible()
    // Hidden here, so it isn't in the accessibility tree either.
    await expect(canvas.queryByRole("button", { name: "Approve invoice" })).not.toBeInTheDocument()
  }
})
