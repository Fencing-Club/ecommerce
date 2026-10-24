import { receivers } from "@repo/copacker-packing-rules"
import { useState } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { pickupLocations } from "@/stories/fixtures/purchase-orders"
import { direct, fbaStop, routeChoices, throughAgl, throughForwarder } from "@/stories/fixtures/routes"
import { chooseOption, shownDialog, width } from "@/stories/play"
import { ReadyDateAndPallets } from "./packing-form"
import type { PartnerAddress } from "./partner-address"
import { PartnerAddressDialog } from "./partner-address"
import { PickupAddressSelect } from "./pickup-address-select"
import { type Route, RouteEditor } from "./route-editor"

// The editor keeps no route of its own: a story holds it, as the Route section does.
function Editable(props: React.ComponentProps<typeof RouteEditor>) {
  const [route, setRoute] = useState<Route>(props.route)
  return (
    <RouteEditor
      {...props}
      route={route}
      onChange={(next) => {
        setRoute(next)
        props.onChange?.(next)
      }}
    />
  )
}

// While packing: the supplier's saved addresses, Add new address, which opens the address dialog and picks what it
// saves, and the packing's ready date and pallets.
function Packing(props: React.ComponentProps<typeof RouteEditor>) {
  const form = useForm({ defaultValues: { readyDate: "2026-10-27", palletized: false } })
  const [addresses, setAddresses] = useState<PartnerAddress[]>(pickupLocations)
  const [pickup, setPickup] = useState("supplier-origin")
  const [adding, setAdding] = useState(false)
  return (
    <FormProvider {...form}>
      <RouteEditor
        {...props}
        shipFrom={
          <PickupAddressSelect
            addresses={addresses}
            value={pickup}
            onChange={setPickup}
            onAdd={() => setAdding(true)}
          />
        }
        packing={<ReadyDateAndPallets />}
      />
      <PartnerAddressDialog
        open={adding}
        onOpenChange={setAdding}
        onSaved={(saved) => {
          const id = saved.id ?? saved.name
          setAddresses((current) => [...current, { id, name: saved.name, address: saved.address }])
          setPickup(id)
        }}
      />
    </FormProvider>
  )
}

const meta = preview.meta({
  title: "Unused/Shipments/Route editor",
  component: RouteEditor,
  decorators: [width("max-w-3xl")],
  args: { route: throughForwarder, buyer: "Harbor Goods", readyDate: "2026-10-27" },
  argTypes: { route: { control: false }, choices: { control: false } }
})

// Read only: each stop on the rail, and between two, who moves the goods and what that means. Ship from says when the
// cartons are ready.
export const ReadOnly = meta.story({
  play: async ({ canvas }) => {
    const route = within(canvas.getByRole("list", { name: "Route" }))
    for (const text of [
      "Ship from",
      "Northwind Textiles / Main factory",
      "Ready Oct 27",
      "Ship to",
      "Final destination"
    ]) {
      await expect(route.getByText(text)).toBeVisible()
    }
    await expect(route.getAllByText("Bayline Freight arranges shipping")).toHaveLength(2)
    await expect(
      route.getAllByText("Bayline Freight books the carrier and adds the tracking code and cost.")
    ).toHaveLength(2)
    await expect(canvas.queryByRole("combobox")).toBeNull()
    await expect(canvas.queryByRole("button", { name: "Add stop" })).toBeNull()
  }
})

// Straight to the buyer's warehouse, in the supplier's own vehicle. The warehouse has no requirements to show.
export const Direct = meta.story({
  args: { route: direct, readyDate: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Northwind Textiles delivers")).toBeVisible()
    await expect(canvas.getByText("In their own vehicle.")).toBeVisible()
    await expect(canvas.getByText("Final destination")).toBeVisible()
    await expect(canvas.queryByText(/^Ready/)).toBeNull()
    await expect(canvas.queryByRole("button", { name: /^About/ })).toBeNull()
  }
})

// Amazon moves the goods to and from AGL: the buyer books it in Seller Central.
export const ThroughAgl = meta.story({
  args: { route: throughAgl },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText("Amazon arranges shipping")).toHaveLength(2)
    await expect(
      canvas.getByText(
        "AGL collects the cartons from Northwind Textiles. Harbor Goods books it in Seller Central and links the shipment."
      )
    ).toBeVisible()
    await expect(canvas.getByText("AGL ships the cartons on to Amazon FBA US.")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "About Amazon FBA US" })).toBeVisible()
  }
})

// An Amazon network's About link: what it is, the rules its cartons and pallets follow in a few words each, and its own
// pages.
export const AmazonRequirements = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "About Amazon AWD US" }))
    const popover = await shownDialog("Amazon AWD US")
    await expect(popover.getByText(/bulk storage/)).toBeVisible()
    for (const rule of receivers.awd_us.cartonPolicy.rules) {
      await expect(popover.getByText(rule.summary)).toBeVisible()
    }
    await userEvent.click(popover.getByRole("tab", { name: "Pallets" }))
    for (const rule of receivers.awd_us.palletPolicy.rules) {
      await waitFor(() => expect(popover.getByText(rule.summary)).toBeVisible())
    }
    await expect(popover.getByRole("link", { name: /Documentation/ })).toHaveAttribute(
      "href",
      receivers.awd_us.documentation
    )
    await expect(popover.getByRole("link", { name: /Website/ })).toHaveAttribute("href", receivers.awd_us.website)
  }
})

// Editing: each leg is a menu of who can move the goods, and each stop after Ship from a menu of where it can be.
// Choosing AGL hands both its legs to Amazon.
export const Editing = meta.story({
  args: { editing: true, choices: routeChoices, onChange: fn() },
  render: (args) => <Editable {...args} />,
  play: async ({ args, canvas }) => {
    await chooseOption(
      canvas.getByRole("combobox", { name: "Shipping, Northwind Textiles to Bayline Freight" }),
      /^Northwind Textiles delivers/
    )
    await expect(args.onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ legs: ["senderMoves", "senderArranges"] })
    )
    await expect(canvas.getByText("In their own vehicle.")).toBeVisible()
    await chooseOption(canvas.getByRole("combobox", { name: "Ship to" }), /^Amazon Global Logistics/)
    await expect(canvas.getAllByText("Amazon arranges shipping")).toHaveLength(2)
    await expect(canvas.queryByRole("combobox", { name: /^Shipping/ })).toBeNull()
  }
})

// Only the sender ships into an Amazon network, so the leg into AWD offers Bayline Freight alone.
export const IntoAmazon = meta.story({
  args: { editing: true, choices: routeChoices },
  render: (args) => <Editable {...args} />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Shipping, Bayline Freight to Amazon" }))
    const options = await screen.findAllByRole("option")
    await expect(options.map((option) => option.textContent)).toEqual([
      "Bayline Freight arranges shippingBooks the carrier",
      "Bayline Freight deliversIn their own vehicle"
    ])
    await userEvent.keyboard("{Escape}")
  }
})

// A final destination ends the route: Add stop is off, and its tooltip says why.
export const EndsRoute = meta.story({
  args: { editing: true, choices: routeChoices },
  render: (args) => <Editable {...args} />,
  play: async ({ canvas }) => {
    const add = canvas.getByRole("button", { name: "Add stop" })
    await expect(add).toHaveAttribute("aria-disabled", "true")
    await userEvent.hover(add)
    await waitFor(() =>
      expect(screen.getByText("Amazon AWD US ends the route. Remove it to add a stop before it.")).toBeVisible()
    )
  }
})

// Removing the last stop leaves Bayline Freight as Ship to, and Add stop adds a final destination after it.
export const RemoveAndAddStop = meta.story({
  args: { editing: true, choices: routeChoices, onChange: fn() },
  render: (args) => <Editable {...args} />,
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Remove Amazon AWD US" }))
    await expect(canvas.queryByText("Final destination")).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "Add stop" }))
    await chooseOption(canvas.getByRole("combobox", { name: "Final destination" }), /^Amazon FBA US/)
    await expect(args.onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ stops: [throughForwarder.stops[0], throughForwarder.stops[1], fbaStop] })
    )
    await expect(canvas.getByRole("button", { name: "About Amazon FBA US" })).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Add stop" })).toHaveAttribute("aria-disabled", "true")
  }
})

// While packing, Ship from is the supplier's saved addresses, with Add new address, and the packing's ready date and
// Packed on pallets follow it.
export const ShipFromWhilePacking = meta.story({
  args: { readyDate: undefined },
  render: (args) => <Packing {...args} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("combobox", { name: "Ship from" })).toHaveTextContent(
      "Northwind Textiles / Main factory"
    )
    await expect(canvas.getByLabelText("Ready date", { exact: false })).toHaveValue("2026-10-27")
    await expect(canvas.getByRole("checkbox", { name: "Packed on pallets" })).not.toBeChecked()
    await chooseOption(canvas.getByRole("combobox", { name: "Ship from" }), "Add new address")
    const dialog = await shownDialog("Add new address")
    await expect(dialog.getByRole("textbox", { name: "Street address" })).toBeVisible()
  }
})
