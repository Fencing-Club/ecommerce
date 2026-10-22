import { useState } from "react"
import { expect, fn, screen, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { restockChannels, suppliers } from "@/stories/fixtures/catalog"
import { RestockToolbar } from "./restock-toolbar"

// The toolbar holding its own settings, as the report does.
function Toolbar(props: React.ComponentProps<typeof RestockToolbar>) {
  const [channel, setChannel] = useState(props.channel)
  const [supplier, setSupplier] = useState(props.supplier)
  const [days, setDays] = useState(props.days)
  const [leadTimeDays, setLeadTimeDays] = useState(props.leadTimeDays)
  return (
    <RestockToolbar
      {...props}
      channel={channel}
      onChannelChange={(key) => {
        setChannel(key)
        props.onChannelChange(key)
      }}
      supplier={supplier}
      onSupplierChange={(id) => {
        setSupplier(id)
        props.onSupplierChange(id)
      }}
      days={days}
      onDaysChange={(value) => {
        setDays(value)
        props.onDaysChange(value)
      }}
      leadTimeDays={leadTimeDays}
      onLeadTimeDaysChange={(value) => {
        setLeadTimeDays(value)
        props.onLeadTimeDaysChange(value)
      }}
    />
  )
}

// What Restock calculates for: a location, a supplier, the sales period and the default lead time.
const meta = preview.meta({
  title: "Components/Inventory/Restock toolbar",
  component: RestockToolbar,
  args: {
    channels: restockChannels,
    channelsLoading: false,
    channel: "amazon",
    onChannelChange: fn(),
    suppliers,
    supplier: "all",
    onSupplierChange: fn(),
    days: "60",
    onDaysChange: fn(),
    leadTimeDays: "60",
    onLeadTimeDaysChange: fn()
  },
  render: (args) => <Toolbar {...args} />
})

export const Settings = meta.story({
  play: async ({ args, canvas }) => {
    await expect(canvas.getByRole("combobox", { name: "Restock location" })).toHaveTextContent("Amazon")
    await expect(canvas.getByRole("combobox", { name: "Supplier" })).toHaveTextContent("All suppliers")
    await userEvent.click(canvas.getByRole("combobox", { name: "Restock location" }))
    await userEvent.click(await screen.findByRole("option", { name: "Harbor Warehouse" }))
    await expect(args.onChannelChange).toHaveBeenCalledWith("shopify:81234")
    await userEvent.click(canvas.getByRole("combobox", { name: "Supplier" }))
    await userEvent.click(await screen.findByRole("option", { name: suppliers[1]!.name }))
    await expect(args.onSupplierChange).toHaveBeenCalledWith(suppliers[1]!.id)
  }
})

// Days are kept as typed; one that isn't a whole number from 1 to 730 is marked.
export const Days = meta.story({
  play: async ({ args, canvas }) => {
    const days = canvas.getByRole("spinbutton", { name: "Sales period" })
    await userEvent.clear(days)
    await expect(days).toHaveAttribute("aria-invalid", "true")
    await userEvent.type(days, "800")
    await expect(days).toHaveAttribute("aria-invalid", "true")
    await userEvent.clear(days)
    await userEvent.type(days, "90")
    await expect(days).toHaveAttribute("aria-invalid", "false")
    await expect(args.onDaysChange).toHaveBeenLastCalledWith("90")
    const leadTime = canvas.getByRole("spinbutton", { name: "Lead time" })
    await expect(leadTime).toHaveValue(60)
    await userEvent.type(leadTime, "{Backspace}")
    await expect(args.onLeadTimeDaysChange).toHaveBeenLastCalledWith("6")
  }
})

// Before the first stock sync there's no location to restock.
export const NoLocations = meta.story({
  args: { channels: [], channel: null },
  play: async ({ canvas }) => {
    const location = canvas.getByRole("combobox", { name: "Restock location" })
    await expect(location).toHaveTextContent("Sync inventory first")
    await expect(location).toHaveAttribute("data-disabled")
  }
})

export const LoadingLocations = meta.story({
  args: { channels: [], channel: null, channelsLoading: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("combobox", { name: "Restock location" })).toHaveTextContent("Loading…")
  }
})
