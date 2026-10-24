import { type Route, receivers } from "@repo/copacker-packing-rules"
import { useState } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { pickupLocations } from "@/stories/fixtures/purchase-orders"
import {
  aglStop,
  baylineStop,
  direct,
  fbaStop,
  harborStop,
  northwindStop,
  routeChoices,
  throughAgl,
  throughForwarder
} from "@/stories/fixtures/routes"
import { chooseOption, shownDialog, width } from "@/stories/play"
import { ReadyDateAndPallets } from "./packing-form"
import type { PartnerAddress } from "./partner-address"
import { PartnerAddressDialog } from "./partner-address"
import { PickupAddressSelect } from "./pickup-address-select"
import { RouteEditor, type RouteStop } from "./route-editor"

// The editor keeps no route of its own: a story holds it, as the Route section does.
function Editable(props: React.ComponentProps<typeof RouteEditor>) {
  const [route, setRoute] = useState<Route<RouteStop>>(props.route)
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
  title: "Components/Shipments/Route editor",
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

// A route that doesn't keep its legs, as shipments are today, still shows Amazon's to and from AGL, since nobody
// chooses those. Any other leg is just the rail.
export const WithoutLegs = meta.story({
  args: {
    route: { stops: [northwindStop, baylineStop, aglStop, fbaStop], legs: [] }
  },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText("Amazon arranges shipping")).toHaveLength(2)
    await expect(canvas.queryByText(/Bayline Freight (arranges shipping|picks up)/)).toBeNull()
    await expect(canvas.queryByText(/Northwind Textiles (arranges shipping|delivers)/)).toBeNull()
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
    await chooseOption(canvas.getByRole("combobox", { name: "New stop" }), /^Amazon FBA US/)
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

// The stops a stop's menu lists, by name, after opening it. Escape closes the menu again. Each option reads its name,
// then its address, so the longest name an option starts with is its stop's.
async function menuOptions(control: HTMLElement) {
  const known = routeChoices.flatMap((group) => group.stops.map((stop) => stop.name))
  known.sort((a, b) => b.length - a.length)
  await userEvent.click(control)
  const options = await screen.findAllByRole("option")
  const names = options.map((option) => known.find((name) => option.textContent?.startsWith(name)))
  await userEvent.keyboard("{Escape}")
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
  return names
}

// A stop on the way is a forwarder or AGL, and the final destination one of the places the goods can end up.
export const StopMenus = meta.story({
  args: { editing: true, choices: routeChoices },
  render: (args) => <Editable {...args} />,
  play: async ({ canvas }) => {
    await expect(await menuOptions(canvas.getByRole("combobox", { name: "Ship to" }))).toEqual([
      "Bayline Freight",
      "Bayline Freight / Shenzhen",
      "Amazon Global Logistics (AGL)"
    ])
    await expect(await menuOptions(canvas.getByRole("combobox", { name: "Final destination" }))).toEqual([
      "Harbor Goods / Portland warehouse",
      "Amazon FBA US",
      "Amazon AWD US"
    ])
  }
})

// AGL delivers only into an Amazon network: it isn't offered on the way to the buyer's warehouse, and after it the
// final destination is Amazon's.
export const AglOnlyIntoAmazon = meta.story({
  args: {
    editing: true,
    choices: routeChoices,
    route: { stops: [northwindStop, baylineStop, harborStop], legs: ["senderArranges", "senderArranges"] }
  },
  render: (args) => <Editable {...args} />,
  play: async ({ canvas }) => {
    await expect(await menuOptions(canvas.getByRole("combobox", { name: "Ship to" }))).not.toContain(
      "Amazon Global Logistics (AGL)"
    )
    await chooseOption(canvas.getByRole("combobox", { name: "Final destination" }), /^Amazon FBA US/)
    await chooseOption(canvas.getByRole("combobox", { name: "Ship to" }), /^Amazon Global Logistics/)
    await expect(await menuOptions(canvas.getByRole("combobox", { name: "Final destination" }))).toEqual([
      "Amazon FBA US",
      "Amazon AWD US"
    ])
  }
})

// Making the final destination an Amazon network hands its leg to the sender, since only the sender ships into one.
export const LegMovesToSender = meta.story({
  args: {
    editing: true,
    choices: routeChoices,
    onChange: fn(),
    route: { stops: [northwindStop, harborStop], legs: ["receiverMoves"] }
  },
  render: (args) => <Editable {...args} />,
  play: async ({ args, canvas }) => {
    await expect(
      canvas.getByRole("combobox", { name: "Shipping, Northwind Textiles to Harbor Goods" })
    ).toHaveTextContent("Harbor Goods picks up")
    await chooseOption(canvas.getByRole("combobox", { name: "Final destination" }), /^Amazon FBA US/)
    await expect(args.onChange).toHaveBeenLastCalledWith({ stops: [northwindStop, fbaStop], legs: ["senderArranges"] })
    await expect(canvas.getByRole("combobox", { name: "Shipping, Northwind Textiles to Amazon" })).toHaveTextContent(
      "Northwind Textiles arranges shipping"
    )
  }
})
