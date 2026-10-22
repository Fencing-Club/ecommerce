import { expect, fn, screen, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { builderSuppliers, deliveries, stops } from "@/stories/fixtures/purchase-orders"
import { OrderFormStory } from "@/stories/order-form"
import { chooseOption } from "@/stories/play"
import { RouteCard } from "./route-card"

const meta = preview.meta({
  title: "Components/Purchase orders/Route card",
  component: RouteCard,
  args: { suppliers: builderSuppliers, deliveries, forwarderAddresses: stops, onDestinationChange: fn() },
  render: (args) => (
    <OrderFormStory values={{ destination: "amazon", deliveryId: undefined, via: undefined }}>
      <RouteCard {...args} />
    </OrderFormStory>
  )
})

async function choose(pill: string, option: string) {
  await chooseOption(screen.getByRole("combobox", { name: pill }), option)
}

// The supplier, then where the goods go: the buyer's location asks for its address, and the editor hears of the change.
export const Destination = meta.story({
  play: async ({ args, canvas }) => {
    await expect(canvas.getByRole("combobox", { name: "Supplier" })).toHaveTextContent("Lotus Manufacturing")
    await choose("Supplier", "Northwind Textiles")
    await expect(canvas.getByRole("combobox", { name: "Supplier" })).toHaveTextContent("Northwind Textiles")
    await expect(canvas.queryByRole("combobox", { name: "Delivery address" })).toBeNull()
    await choose("Destination", "Your location")
    await expect(args.onDestinationChange).toHaveBeenCalledWith("warehouse")
    await choose("Delivery address", "Portland studio")
    await expect(canvas.getByRole("combobox", { name: "Delivery address" })).toHaveTextContent("Portland studio")
  }
})

// A stop on the way: Amazon can't pick up from one without a phone number, which the forwarder's page can add.
export const Stop = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add stop" }))
    await choose("Stop on the way", "Bayline Freight, Shenzhen yard")
    await expect(canvas.getByText(/Amazon needs a phone number at this stop for pickup/)).toBeVisible()
    await expect(canvas.getByRole("link", { name: "Add one" })).toHaveAttribute("href", "/partners?type=forwarder")
    await userEvent.click(canvas.getByRole("button", { name: "Remove the stop" }))
    await expect(canvas.queryByRole("combobox", { name: "Stop on the way" })).toBeNull()
    await expect(canvas.queryByText(/Amazon needs a phone number/)).toBeNull()
  }
})

// Without forwarders' addresses there's no stop to add, and without delivery addresses one is added in Settings.
export const NothingSaved = meta.story({
  args: { deliveries: [], forwarderAddresses: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Add stop" })).toBeDisabled()
    await choose("Destination", "Your location")
    await expect(canvas.getByRole("combobox", { name: "Delivery address" })).toHaveTextContent(
      "Add an address in Settings"
    )
  }
})
