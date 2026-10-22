import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { controlled, dialogWidth } from "@/stories/booking"
import { agl, chestProtectors, differingShipment } from "@/stories/fixtures/booking"
import { ShipmentPicker } from "./shipment-picker"

// The picker with its parent keeping the chosen shipment, as the link step does.
const Picker = controlled(ShipmentPicker)

const meta = preview.meta({
  title: "Unused/Booking/Shipment picker",
  component: Picker,
  args: {
    shipments: agl.start.shipments,
    value: chestProtectors.id,
    onValueChange: fn(),
    onRefresh: fn()
  },
  decorators: [dialogWidth]
})

// The picker's box, which keeps one height whatever it holds.
function box(canvasElement: HTMLElement) {
  const picker = canvasElement.querySelector("[data-slot=shipment-picker]")
  if (!(picker instanceof HTMLElement)) {
    throw new Error("No shipment picker")
  }
  return picker
}

// The four newest shipments, with how many match the packing. A plan with several shipments counts them.
export const Recent = meta.story({
  play: async ({ canvas, canvasElement, args }) => {
    const list = canvas.getByRole("radiogroup", { name: "Recent shipments" })
    await expect(list).toBeVisible()
    await expect(canvas.getAllByRole("radio")).toHaveLength(4)
    await expect(canvas.getByText("1 match")).toBeVisible()
    const chosen = canvas.getByRole("radio", { name: "PO36 / Chest protectors" })
    await expect(chosen).toHaveAttribute("aria-checked", "true")
    await expect(chosen).toHaveAccessibleDescription(/^FBA18Z4K2QRL\s*5 cartons, 100 units\s*Matches$/)
    await expect(canvas.getByText("2 shipments, 12 cartons, 240 units")).toBeVisible()
    await expect(box(canvasElement).offsetHeight).toBe(300)

    await userEvent.click(canvas.getByRole("radio", { name: "Knee pads restock" }))
    await expect(args.onValueChange).toHaveBeenCalledWith("FBA18W2H6PQC")
    await expect(canvas.getByRole("radio", { name: "Knee pads restock" })).toHaveAttribute("aria-checked", "true")
  }
})

// A search looks through every shipment by name or ID, not only the newest.
export const Search = meta.story({
  play: async ({ canvas, canvasElement }) => {
    const search = canvas.getByRole("searchbox", { name: "Search by name or ID" })
    await userEvent.type(search, "PO3")
    await expect(canvas.getByRole("radiogroup", { name: "Results" })).toBeVisible()
    await expect(canvas.getByText("3 results")).toBeVisible()
    await expect(canvas.getByRole("radio", { name: "PO32 / Wrist wraps" })).toBeVisible()

    await userEvent.clear(search)
    await userEvent.type(search, "fba18x0")
    await expect(canvas.getByText("1 result")).toBeVisible()
    await expect(canvas.getByRole("radio", { name: "October replenishment" })).toBeVisible()
    await expect(box(canvasElement).offsetHeight).toBe(300)
  }
})

// A search with no results says what to try, in the same box.
export const NoResults = meta.story({
  args: { defaultQuery: "FBA19" },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText("No shipments found")).toBeVisible()
    await expect(canvas.getByText("Check the ID, or refresh in a few minutes.")).toBeVisible()
    await expect(canvas.queryByRole("radiogroup")).toBeNull()
    await expect(box(canvasElement).offsetHeight).toBe(300)
  }
})

// No shipments in Amazon yet, which happens for a few minutes after booking one.
export const NoShipmentsYet = meta.story({
  args: { shipments: [], value: null },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText("No shipments yet")).toBeVisible()
    await expect(canvas.getByText("Amazon can take a few minutes to list a new shipment.")).toBeVisible()
    await expect(box(canvasElement).offsetHeight).toBe(300)
  }
})

// Refresh asks Amazon again, and waits, spinning, while it does.
export const Refresh = meta.story({
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Refresh shipments" }))
    await expect(args.onRefresh).toHaveBeenCalledOnce()
  }
})

export const Refreshing = meta.story({
  args: { refreshing: true },
  play: async ({ canvas, args }) => {
    const refresh = canvas.getByRole("button", { name: "Refresh shipments" })
    await expect(refresh).toHaveAttribute("aria-disabled", "true")
    await expect(refresh.querySelector("[data-spinning=true]")).not.toBeNull()
    await userEvent.click(refresh)
    await expect(args.onRefresh).not.toHaveBeenCalled()
  }
})

// A shipment booked with other counts than the packing's, chosen, with its problem under the list. The list scrolls
// within the box rather than growing it.
export const DoesNotMatch = meta.story({
  args: {
    shipments: agl.differs.shipments,
    value: differingShipment.id,
    issue: {
      title: "3 products don’t match",
      description: "Linking is blocked until they do",
      action: "Review",
      onAction: fn()
    }
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText("Doesn’t match")).toBeVisible()
    await expect(canvas.getByText("No match yet")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Review" })).toBeInTheDocument()
    await expect(box(canvasElement).offsetHeight).toBe(300)
  }
})
