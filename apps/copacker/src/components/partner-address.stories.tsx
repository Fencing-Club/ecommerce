import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { HttpResponse } from "msw"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { Button } from "@/components/ui/button"
import {
  type ActionRequest,
  forwarderRecordId,
  partnerAddresses,
  pickupAddress,
  recordActions,
  serverError,
  supplierRecordId,
  warehouseAddress
} from "@/stories/fixtures/logistics"
import { AddressSummary, PartnerAddressDialog, PartnerAddressSheet } from "./partner-address"

const sent: ActionRequest[] = []
const supplier = { kind: "supplier", id: supplierRecordId, name: "Lotus Manufacturing" } as const
const forwarder = { kind: "forwarder", id: forwarderRecordId, name: "Bayline Freight" } as const
const onSaved = fn()

const meta = preview.meta({
  component: PartnerAddressSheet,
  args: {
    partner: supplier,
    joined: false,
    editable: true,
    addresses: [partnerAddresses.factory],
    open: true,
    onOpenChange: fn()
  },
  beforeEach: ({ msw }) => {
    sent.length = 0
    msw.use(recordActions(sent))
  }
})

export const SupplierPickups = meta.story({
  play: async ({ args }) => {
    const sheet = await screen.findByRole("dialog", { name: "Lotus Manufacturing" })
    await expect(sheet).toHaveTextContent("Pickup addresses")
    await expect(within(sheet).getByText("Factory")).toBeInTheDocument()
    await expect(within(sheet).getByText("1000 Siji Road, Building 3, Yiwu, Zhejiang, 322000, CN")).toBeInTheDocument()
    await expect(within(sheet).getByRole("button", { name: "Add address" })).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole("button", { name: "Close" }))
    await expect(args.onOpenChange).toHaveBeenCalledWith(false, expect.anything())
  }
})

export const EditPickup = meta.story({
  play: async () => {
    await userEvent.click(await screen.findByRole("button", { name: "More actions for Factory" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Edit" }))
    const dialog = await screen.findByRole("dialog", { name: "Edit pickup address" })
    const name = within(dialog).getByRole("textbox", { name: "Address name" })
    await expect(name).toHaveValue("Factory")
    await userEvent.clear(name)
    await userEvent.type(name, "Main factory")
    await userEvent.click(within(dialog).getByRole("button", { name: "Save changes" }))
    await waitFor(() => expect(sent).toHaveLength(1))
    await expect(sent[0]).toEqual({
      action: "supplier.address",
      data: {
        name: "Main factory",
        address: pickupAddress,
        supplierId: supplierRecordId,
        id: partnerAddresses.factory.id
      }
    })
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit pickup address" })).toBeNull())
    await waitFor(() => expect(getRouter().refresh).toHaveBeenCalled())
  }
})

export const RemovePickup = meta.story({
  play: async () => {
    await userEvent.click(await screen.findByRole("button", { name: "More actions for Factory" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Remove" }))
    await waitFor(() =>
      expect(sent).toEqual([
        {
          action: "supplier.address",
          data: { supplierId: supplierRecordId, id: partnerAddresses.factory.id, remove: true }
        }
      ])
    )
    await waitFor(() => expect(getRouter().refresh).toHaveBeenCalled())
  }
})

export const RemoveFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, () => new HttpResponse(null, { status: 500 })))
  },
  play: async () => {
    await userEvent.click(await screen.findByRole("button", { name: "More actions for Factory" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Remove" }))
    await expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t remove Factory")
    // The menu comes back to try again.
    await expect(await screen.findByRole("button", { name: "More actions for Factory" })).toBeEnabled()
  }
})

// Adding a pickup address needs a phone number: Amazon needs one to schedule a pickup.
export const AddPickup = meta.story({
  args: { addresses: [] },
  play: async () => {
    const sheet = await screen.findByRole("dialog", { name: "Lotus Manufacturing" })
    await expect(within(sheet).getByText("No addresses yet")).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole("button", { name: "Add address" }))
    const dialog = await screen.findByRole("dialog", { name: "Add a pickup address for Lotus Manufacturing" })
    await expect(within(dialog).getByRole("textbox", { name: "Address name" })).toHaveAttribute(
      "placeholder",
      "Factory"
    )
    await userEvent.click(within(dialog).getByRole("button", { name: "Save address" }))
    await expect(
      await within(dialog).findByText("Add a pickup phone number. Amazon needs it to schedule pickup")
    ).toBeInTheDocument()
    await expect(within(dialog).getAllByText("This field is required").length).toBeGreaterThan(3)
    await expect(sent).toHaveLength(0)
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Address name" }), "Warehouse 2")
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Contact name" }), "Mei Chen")
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Phone number" }), "+86 579 8555 1234")
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Street address" }), "12 Chouzhou Road")
    await userEvent.type(within(dialog).getByRole("textbox", { name: "City" }), "Yiwu")
    await userEvent.type(within(dialog).getByRole("textbox", { name: "State or province" }), "Zhejiang")
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Postal code" }), "322000")
    await userEvent.click(within(dialog).getByRole("combobox", { name: "Country" }))
    await userEvent.click(await screen.findByRole("option", { name: "China" }))
    await userEvent.click(within(dialog).getByRole("button", { name: "Save address" }))
    await waitFor(() => expect(sent).toHaveLength(1))
    await expect(sent[0]).toMatchObject({
      action: "supplier.address",
      data: {
        name: "Warehouse 2",
        supplierId: supplierRecordId,
        address: expect.objectContaining({ addressLine1: "12 Chouzhou Road", countryCode: "CN", city: "Yiwu" })
      }
    })
    await expect(sent[0]?.data).not.toHaveProperty("id")
  }
})

// A forwarder's addresses are kept by id on purchase orders, so they're edited but not removed here. The forwarder's
// own actions sit at the foot of the panel.
export const Forwarder = meta.story({
  args: {
    partner: forwarder,
    addresses: [partnerAddresses.forwarderWarehouse],
    children: <Button variant="outline">Rename</Button>
  },
  play: async () => {
    const sheet = await screen.findByRole("dialog", { name: "Bayline Freight" })
    await expect(sheet).toHaveTextContent("Stops on the way to Amazon or your warehouse")
    await expect(within(sheet).getByRole("button", { name: "Rename" })).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole("button", { name: "More actions for Shenzhen consolidation" }))
    const edit = await screen.findByRole("menuitem", { name: "Edit" })
    await expect(screen.queryByRole("menuitem", { name: "Remove" })).toBeNull()
    await userEvent.click(edit)
    const dialog = await screen.findByRole("dialog", { name: "Edit address" })
    await userEvent.click(within(dialog).getByRole("button", { name: "Save changes" }))
    await waitFor(() =>
      expect(sent).toEqual([
        {
          action: "forwarder.address",
          data: {
            name: "Shenzhen consolidation",
            address: partnerAddresses.forwarderWarehouse.address,
            forwarderId: forwarderRecordId,
            id: partnerAddresses.forwarderWarehouse.id
          }
        }
      ])
    )
  }
})

export const JoinedSupplier = meta.story({
  args: { joined: true, editable: false },
  play: async () => {
    const sheet = await screen.findByRole("dialog", { name: "Lotus Manufacturing" })
    await expect(sheet).toHaveTextContent("Keeps its own pickup addresses on Copacker")
    await expect(within(sheet).getByText("Factory")).toBeInTheDocument()
    await expect(within(sheet).queryByRole("button", { name: "Add address" })).toBeNull()
    await expect(within(sheet).queryByRole("button", { name: /More actions/ })).toBeNull()
  }
})

export const JoinedForwarder = meta.story({
  args: { partner: forwarder, joined: true, editable: false, addresses: [] },
  play: async () => {
    const sheet = await screen.findByRole("dialog", { name: "Bayline Freight" })
    await expect(sheet).toHaveTextContent("Keeps its own addresses on Copacker")
    await expect(within(sheet).getByText("No addresses yet")).toBeInTheDocument()
  }
})

// A pickup address typed on a shipment starts the dialog, which reports the saved address with its new id.
export const DialogFromDraft = meta.story({
  render: (args) => (
    <PartnerAddressDialog
      partner={supplier}
      draft={{ ...pickupAddress, addressLine2: "" }}
      open
      onOpenChange={args.onOpenChange}
      onSaved={onSaved}
    />
  ),
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, () => HttpResponse.json({ ok: true, id: "3c1a8f2e-0d4b-4c7a-9e21-5a6b7c8d9e09" })))
  },
  play: async ({ args }) => {
    const dialog = await screen.findByRole("dialog", { name: "Add a pickup address for Lotus Manufacturing" })
    await expect(within(dialog).getByRole("textbox", { name: "Street address" })).toHaveValue("1000 Siji Road")
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Address name" }), "Factory")
    await userEvent.click(within(dialog).getByRole("button", { name: "Save address" }))
    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith({
        id: "3c1a8f2e-0d4b-4c7a-9e21-5a6b7c8d9e09",
        name: "Factory",
        address: { ...pickupAddress, addressLine2: "" }
      })
    )
    await waitFor(() => expect(args.onOpenChange).toHaveBeenCalledWith(false))
  }
})

export const DialogFails = meta.story({
  render: (args) => (
    <PartnerAddressDialog partner={forwarder} draft={warehouseAddress} open onOpenChange={args.onOpenChange} />
  ),
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, () => serverError("Bayline Freight already has an address named Portland.")))
  },
  play: async ({ args }) => {
    const dialog = await screen.findByRole("dialog", { name: "Add an address for Bayline Freight" })
    await expect(within(dialog).getByRole("textbox", { name: "Address name" })).toHaveAttribute(
      "placeholder",
      "Yiwu warehouse"
    )
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Address name" }), "Portland")
    await userEvent.click(within(dialog).getByRole("button", { name: "Save address" }))
    await expect(
      await within(dialog).findByText("Bayline Freight already has an address named Portland.")
    ).toBeInTheDocument()
    await expect(args.onOpenChange).not.toHaveBeenCalled()
  }
})

export const Summary = meta.story({
  render: () => <AddressSummary name="Factory" address={pickupAddress} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Factory")).toBeVisible()
    await expect(canvas.getByText("1000 Siji Road, Building 3, Yiwu, Zhejiang, 322000, CN")).toBeVisible()
    await expect(canvas.getByText(/^Mei Chen, \+86/)).toBeVisible()
  }
})

// Without a name or contact, only the street shows.
export const SummaryStreetOnly = meta.story({
  render: () => <AddressSummary address={{ addressLine1: "2400 NW Front Ave", city: "Portland", countryCode: "US" }} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("2400 NW Front Ave, Portland, US")).toBeVisible()
    await expect(canvas.queryByText(/Mei Chen/)).toBeNull()
  }
})
