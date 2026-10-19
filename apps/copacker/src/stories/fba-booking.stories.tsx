import { expect, fn, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { FbaBookingPreview } from "./fba-booking"

const meta = preview.meta({
  title: "Workflows/Shipments/FBA booking",
  component: FbaBookingPreview,
  args: {
    orderName: "PO38",
    shipmentName: "Shipment 1",
    origin: "Oakland warehouse, California",
    readyDate: "Oct 23, 2026",
    currency: "USD",
    quotes: [
      {
        id: "single",
        name: "One destination",
        placementFee: 2400,
        shipments: [{ destination: "Amazon ONT8", cartons: 18, carrier: "UPS", service: "Small parcel", cost: 12600 }]
      },
      {
        id: "split",
        name: "Two destinations",
        placementFee: 0,
        shipments: [
          { destination: "Amazon ONT8", cartons: 10, carrier: "UPS", service: "Small parcel", cost: 8200 },
          { destination: "Amazon SMF3", cartons: 8, carrier: "UPS", service: "Small parcel", cost: 7400 }
        ]
      }
    ],
    onBook: fn(async () => "confirmed" as const)
  }
})
export const Options = meta.story({
  play: async () => {
    await waitFor(() => expect(screen.getByRole("radiogroup", { name: "Placement and shipping" })).toBeVisible())
  }
})
export const Review = meta.story({
  args: { initialStage: "review" },
  play: async () => {
    await expect(screen.getByRole("button", { name: "Confirm and book $150" })).toBeDisabled()
  }
})
export const BookShipping = meta.story({
  play: async ({ args }) => {
    await userEvent.click(screen.getByRole("radio", { name: /Two destinations/ }))
    await userEvent.click(screen.getByRole("button", { name: "Review charges" }))
    const book = screen.getByRole("button", { name: "Confirm and book $156" })
    await expect(book).toBeDisabled()
    await userEvent.click(screen.getByRole("checkbox"))
    await userEvent.click(book)
    await expect(await screen.findByText("Shipping confirmed for Shipment 1.")).toBeVisible()
    await expect(args.onBook).toHaveBeenCalledWith("split")
    await expect(screen.getByText("Carrier labels")).toBeVisible()
  }
})
export const Confirmed = meta.story({
  args: { initialStage: "confirmed" },
  play: async () => {
    await waitFor(() => expect(screen.getByText("Amazon carton labels")).toBeVisible())
  }
})
export const LabelsProcessing = meta.story({
  args: { initialStage: "confirmed", labelsReady: false },
  play: async () => {
    await expect(screen.getByRole("status")).toHaveTextContent("Preparing labels")
  }
})
export const ExpiredQuote = meta.story({
  args: { initialStage: "expired" },
  play: async () => {
    await expect(screen.getByRole("alert")).toHaveTextContent("expired")
    await expect(screen.queryByRole("button", { name: /Confirm and book/ })).toBeNull()
  }
})
export const FailedBooking = meta.story({
  args: { initialStage: "failed" },
  play: async () => {
    await expect(screen.getByRole("alert")).toHaveTextContent("couldn’t confirm")
    await userEvent.click(screen.getByRole("button", { name: "Review new quotes" }))
    await waitFor(() => expect(screen.getByRole("radiogroup")).toBeVisible())
  }
})
export const UncertainBooking = meta.story({
  args: { initialStage: "uncertain" },
  play: async () => {
    await expect(screen.getByRole("alert")).toHaveTextContent("Don’t book again")
    await expect(screen.queryByRole("button", { name: /Confirm and book/ })).toBeNull()
  }
})
export const Booking = meta.story({
  args: { initialStage: "booking" },
  play: async () => {
    await expect(screen.getByRole("status")).toHaveTextContent("Confirming with Amazon")
  }
})
