import { useState } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { expect, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { harborWarehouse, northwindFactory } from "@/stories/fixtures/parties"
import { pickupLocations } from "@/stories/fixtures/purchase-orders"
import { baylineStop, fbaStop, harborStop, northwindStop } from "@/stories/fixtures/routes"
import { shownDialog, chooseOption } from "@/stories/play"
import { PackingDetailsFields } from "./packing-form"
import { ShipmentTransportLegs } from "./shipment-packing-details"

// The packing's own fields on the shipment's route: the pickup address, ready date and pallets on its first stop, and
// how the cartons travel under it.
function Example({
  forwarder = false,
  amazonPickup = false,
  buyerWarehouse = false
}: {
  forwarder?: boolean
  amazonPickup?: boolean
  buyerWarehouse?: boolean
}) {
  const form = useForm({ defaultValues: { origin: northwindFactory, readyDate: "2026-10-21" } })
  const [pickup, setPickup] = useState("supplier-origin")
  const destination = buyerWarehouse ? harborStop : fbaStop
  let legs = [amazonPickup ? "Amazon pickup from Northwind Textiles." : `Supplier ships to ${destination.name}.`]
  if (forwarder) {
    legs = ["Supplier ships to Bayline Freight.", "Amazon pickup from Bayline Freight."]
  }
  return (
    <div className="max-w-4xl">
      <FormProvider {...form}>
        <PackingDetailsFields
          pickup={pickup}
          onPickupChange={setPickup}
          addresses={pickupLocations}
          route={{
            route: { stops: [northwindStop, ...(forwarder ? [baylineStop] : []), destination], legs: [] },
            buyer: "Harbor Goods",
            notes: <ShipmentTransportLegs legs={legs} />
          }}
        />
      </FormProvider>
    </div>
  )
}

const meta = preview.meta({ title: "Components/Shipments/Shipment packing details", component: Example })

export const Editing = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("combobox", { name: "Ship from" })).toHaveTextContent(northwindFactory.addressLine1)
    await expect(canvas.getByLabelText("Ready date", { exact: false })).toBeRequired()
    await expect(canvas.getByLabelText("Ready date", { exact: false })).toHaveValue("2026-10-21")
    await expect(canvas.getByRole("checkbox", { name: "Packed on pallets" })).not.toBeChecked()
  }
})
export const ViaForwarder = meta.story({
  args: { forwarder: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Bayline Freight")).toBeVisible()
    await expect(canvas.getByText("Supplier ships to Bayline Freight.")).toBeVisible()
    await expect(canvas.getByLabelText("Ready date", { exact: false })).toBeRequired()
  }
})

// Closing the route hides the packing's fields with it.
export const CloseRoute = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Route" }))
    await waitFor(() => expect(canvas.queryByLabelText("Ready date", { exact: false })).toBeNull())
    await expect(canvas.getByText("Amazon FBA US")).toBeVisible()
  }
})

export const AddressMenu = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Ship from" }))
    await waitFor(() => expect(screen.getByRole("option", { name: /Hangzhou factory/ })).toBeVisible())
  }
})
export const AddAddress = meta.story({
  play: async ({ canvas }) => {
    await chooseOption(canvas.getByRole("combobox", { name: "Ship from" }), "Add new address")
    const dialog = await shownDialog("Add new address")
    await waitFor(() => expect(dialog.getByRole("textbox", { name: "Street address" })).toBeVisible())
  }
})

export const SaveNewAddress = meta.story({
  play: async ({ canvas }) => {
    await chooseOption(canvas.getByRole("combobox", { name: "Ship from" }), "Add new address")
    const dialog = await shownDialog("Add new address")
    for (const { label, value } of [
      { label: "Address name", value: "Warehouse 2" },
      { label: "Contact name", value: "Mei Chen" },
      { label: "Phone number", value: "+86 579 8555 1234" },
      { label: "Street address", value: "12 Chouzhou Road" },
      { label: "City", value: "Yiwu" },
      { label: "Postal code", value: "322000" }
    ]) {
      await userEvent.type(dialog.getByRole("textbox", { name: label }), value)
    }
    await chooseOption(dialog.getByRole("combobox", { name: "Country" }), /^China$/)
    await chooseOption(dialog.getByRole("combobox", { name: "State or province" }), "Zhejiang Sheng")
    await userEvent.click(dialog.getByRole("button", { name: "Save address" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await expect(canvas.getByRole("combobox", { name: "Ship from" })).toHaveTextContent("Warehouse 2")
    await expect(canvas.getByRole("combobox", { name: "Ship from" })).toHaveTextContent("12 Chouzhou Road")
  }
})

export const AmazonPickup = meta.story({
  args: { amazonPickup: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Amazon pickup from Northwind Textiles.")).toBeVisible()
  }
})

export const SupplierShipsToBuyer = meta.story({
  args: { buyerWarehouse: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Supplier ships to Harbor Goods / Portland warehouse.")).toBeVisible()
    await expect(canvas.getByText(harborWarehouse.addressLine1)).toBeVisible()
    await expect(canvas.queryByText(/Amazon picks/)).toBeNull()
  }
})
