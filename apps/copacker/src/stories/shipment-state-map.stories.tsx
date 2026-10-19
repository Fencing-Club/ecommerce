import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { ShipmentStateMap } from "./shipment-state-map"

const meta = preview.meta({ title: "Workflows/Shipments/States and actions", component: ShipmentStateMap })
export const AllArrangements = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole("table")).toHaveLength(8)
    const fba = canvas.getByRole("region", { name: "FBA / Supplier ships" })
    await expect(fba).toHaveTextContent("Validate packing submission")
    await expect(fba).toHaveTextContent("Approve FBA placement and charges")
    const awd = canvas.getByRole("region", { name: "AWD / AGL" })
    await expect(awd).toHaveTextContent("Approve and book AGL")
    await expect(awd).not.toHaveTextContent("Approve FBA placement and charges")
    const forwarder = canvas.getByRole("region", { name: "FBA / Freight forwarder picks up" })
    await expect(forwarder).toHaveTextContent("Prepare first-leg documents")
    await expect(forwarder).toHaveTextContent("Forwarder → final destination")
  }
})
