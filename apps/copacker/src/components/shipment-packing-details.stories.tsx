import { useState } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { expect, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { pickupAddress, pickupLocations } from "@/stories/fixtures/purchase-orders"
import { PackingDetailsFields } from "./packing-form"
import {
  ShipmentAddress,
  ShipmentOrigin,
  ShipmentPackingDetails,
  ShipmentTransportLegs
} from "./shipment-packing-details"

function Example({
  readOnly = false,
  forwarder = false,
  amazonPickup = false,
  buyerWarehouse = false
}: {
  readOnly?: boolean
  forwarder?: boolean
  amazonPickup?: boolean
  buyerWarehouse?: boolean
}) {
  const form = useForm({ defaultValues: { origin: pickupAddress, readyDate: "2026-10-21" } })
  const destination = buyerWarehouse ? "Harbor Goods / Portland warehouse" : "Amazon FBA US"
  let destinationAddress = "Amazon assigns the receiving warehouse when the shipment is confirmed."
  if (forwarder) {
    destinationAddress = "18 Gangqiao Road, Beilun, Ningbo, Zhejiang 315800, China"
  } else if (buyerWarehouse) {
    destinationAddress = "42 Distribution Way, Portland, Oregon 97230, United States"
  }
  const [pickup, setPickup] = useState("supplier-origin")
  const details = {
    route: ["Northwind Textiles", ...(forwarder ? ["Bayline Freight"] : []), destination],
    shipTo: (
      <ShipmentAddress
        readOnly={readOnly}
        label="Ship to"
        name={forwarder ? "Bayline Freight" : destination}
        address={destinationAddress}
      />
    ),
    transport: (
      <ShipmentTransportLegs
        legs={
          forwarder
            ? ["Supplier ships to Bayline Freight.", "Amazon pickup from Bayline Freight."]
            : [amazonPickup ? "Amazon pickup from Northwind Textiles." : `Supplier ships to ${destination}.`]
        }
      />
    )
  }
  // Packed, the card shows where the cartons left from; while packing, the packing form's fields.
  return (
    <div className="max-w-4xl">
      {readOnly ? (
        <ShipmentPackingDetails
          {...details}
          shipFrom={<ShipmentOrigin origin={pickupAddress} addresses={pickupLocations} />}
        />
      ) : (
        <FormProvider {...form}>
          <PackingDetailsFields pickup={pickup} onPickupChange={setPickup} addresses={pickupLocations} {...details} />
        </FormProvider>
      )}
    </div>
  )
}

const meta = preview.meta({ title: "Components/Shipments/Shipment packing details", component: Example })

export const Editing = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("combobox", { name: "Ship from" })).toHaveTextContent(pickupAddress.addressLine1)
    await expect(canvas.getByLabelText("Ready date", { exact: false })).toBeRequired()
    await expect(canvas.getByLabelText("Ready date", { exact: false })).toHaveValue("2026-10-21")
  }
})
export const ViaForwarder = meta.story({
  args: { forwarder: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Supplier ships to Bayline Freight.")).toBeVisible()
    await expect(canvas.getByLabelText("Ready date", { exact: false })).toBeRequired()
  }
})
// A packed shipment's pickup address is the saved address it matches, by that address's name, with its contact.
export const ReadOnly = meta.story({
  args: { readOnly: true },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("combobox")).toBeNull()
    await expect(canvas.queryByLabelText("Ready date", { exact: false })).toBeNull()
    await expect(canvas.getByText("Ship from", { exact: true })).toBeVisible()
    await expect(canvas.getByText("Northwind Textiles / Main factory")).toBeVisible()
    await expect(canvas.getByText("Mei Chen")).toBeVisible()
    await expect(canvas.getByRole("link", { name: "+86 574 5555 0100" })).toHaveAttribute("href", "tel:+8657455550100")
  }
})
export const Mobile = meta.story({
  args: { forwarder: true },
  globals: { viewport: { value: "iphone12", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("Ready date", { exact: false })).toBeVisible()
    await expect(canvas.getByText("Ship to", { exact: true })).toBeVisible()
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
    await userEvent.click(canvas.getByRole("combobox", { name: "Ship from" }))
    await userEvent.click(await screen.findByRole("option", { name: "Add new address" }))
    const dialog = await screen.findByRole("dialog", { name: "Add new address" })
    await waitFor(() => expect(within(dialog).getByRole("textbox", { name: "Street address" })).toBeVisible())
  }
})

export const SaveNewAddress = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Ship from" }))
    await userEvent.click(await screen.findByRole("option", { name: "Add new address" }))
    const dialog = within(await screen.findByRole("dialog", { name: "Add new address" }))
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
    await userEvent.click(dialog.getByRole("combobox", { name: "Country" }))
    await userEvent.click(await screen.findByRole("option", { name: /^China$/ }))
    await userEvent.click(dialog.getByRole("combobox", { name: "State or province" }))
    await userEvent.click(await screen.findByRole("option", { name: "Zhejiang Sheng" }))
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
    await expect(canvas.getByText("42 Distribution Way, Portland, Oregon 97230, United States")).toBeVisible()
    await expect(canvas.queryByText(/Amazon assigns/)).toBeNull()
  }
})
