import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { ShipmentDestination } from "./shipment-destination"

const meta = preview.meta({ component: ShipmentDestination, args: { addresses: [], pending: true } })
export const Pending = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Amazon assigns the delivery address after shipment creation.")).toBeVisible()
  }
})
export const Confirmed = meta.story({
  args: {
    pending: false,
    addresses: [
      {
        name: "TEST1",
        addressLine1: "10 Warehouse Road",
        addressLine2: "",
        city: "Seattle",
        stateOrRegion: "WA",
        postalCode: "98101",
        countryCode: "US",
        phoneNumber: "",
        email: ""
      }
    ]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("TEST1")).toBeVisible()
    await expect(canvas.getByText(/10 Warehouse Road/)).toBeVisible()
  }
})
export const Unavailable = meta.story({
  args: { pending: false },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Delivery address unavailable. Check the purchase order or linked Amazon shipment.")
    ).toBeVisible()
  }
})
