import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { ShipmentDetails } from "./shipment-details"
const meta = preview.meta({
  title: "Unused/Shipments/Shipment details",
  component: ShipmentDetails,
  args: { readyDate: "2026-10-21", cartons: 5, units: 100, weight: 34.5, volume: 0.53 }
})
export const Packed = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("34.5 kg")).toBeVisible()
    await expect(canvas.getByText("0.53 m³")).toBeVisible()
  }
})
export const Packing = meta.story({
  args: { readyDate: "", weight: null, volume: null },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText("—")).toHaveLength(3)
  }
})
