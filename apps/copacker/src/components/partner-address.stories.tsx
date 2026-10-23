import { Button } from "@buildkitgg/shadcn-baseui-kit"
import { HttpResponse } from "msw/http"
import { expect, fn, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { type ActionRequest, recordActions, failWith } from "@/stories/actions"
import { forwarderRecordId, partnerAddresses, supplierRecordId } from "@/stories/fixtures/logistics"
import { lotusFactory, harborWarehouse } from "@/stories/fixtures/parties"
import { shownDialog, chooseOption } from "@/stories/play"
import { AddressSummary, PartnerAddressDialog, PartnerAddressSheet } from "./partner-address"

const sent: ActionRequest[] = []
const supplier = { kind: "supplier", id: supplierRecordId, name: "Lotus Manufacturing" } as const
const forwarder = { kind: "forwarder", id: forwarderRecordId, name: "Bayline Freight" } as const
const onSaved = fn()

const meta = preview.meta({
  title: "Components/Partners/Partner address",
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
    msw.use(recordActions(sent))
  }
})

export const SupplierPickups = meta.story({
  play: async ({ args }) => {
    const sheet = await shownDialog("Lotus Manufacturing")
    await expect(sheet.element).toHaveTextContent("Pickup addresses")
    await expect(sheet.getByText("Factory")).toBeInTheDocument()
    await expect(sheet.getByText("1000 Siji Road, Building 3, Yiwu, Zhejiang 322000, CN")).toBeInTheDocument()
    // Who to contact there, with links to call or email them.
    await expect(sheet.getByRole("link", { name: /^\+86/ })).toHaveAttribute("href", "tel:+8657985551234")
    await expect(sheet.getByRole("link", { name: "mei@lotus.example.com" })).toBeInTheDocument()
    await expect(sheet.getByRole("button", { name: "Add address" })).toBeInTheDocument()
    await userEvent.click(sheet.getByRole("button", { name: "Close" }))
    await expect(args.onOpenChange).toHaveBeenCalledWith(false, expect.anything())
  }
})

// In Urdu the sheet opens from the reading direction's end, the left. The address and phone number still read left to
// right, so the street keeps its number first.
export const Urdu = meta.story({
  globals: { locale: "ur" },
  play: async () => {
    const sheet = await shownDialog("Lotus Manufacturing")
    await expect(sheet.element).toHaveAttribute("data-side", "left")
    await expect(sheet.element.getBoundingClientRect().left).toBeLessThan(window.innerWidth / 2)
    await expect(sheet.element.matches(":dir(rtl)")).toBe(true)
    const street = sheet.getByText("1000 Siji Road, Building 3, Yiwu, Zhejiang 322000, CN")
    await expect(street.matches(":dir(ltr)")).toBe(true)
    await expect(sheet.getByRole("link", { name: "+86 579 8555 1234" }).matches(":dir(ltr)")).toBe(true)
  }
})

export const EditPickup = meta.story({
  play: async () => {
    await userEvent.click(await screen.findByRole("button", { name: "More actions for Factory" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Edit" }))
    const dialog = await shownDialog("Edit pickup address")
    const name = dialog.getByRole("textbox", { name: "Address name" })
    await expect(name).toHaveValue("Factory")
    await userEvent.clear(name)
    await userEvent.type(name, "Main factory")
    await userEvent.click(dialog.getByRole("button", { name: "Save changes" }))
    await waitFor(() => expect(sent).toHaveLength(1))
    await expect(sent[0]).toEqual({
      action: "supplier.address",
      data: {
        name: "Main factory",
        address: lotusFactory,
        supplierId: supplierRecordId,
        id: partnerAddresses.factory.id
      }
    })
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit pickup address" })).toBeNull())
    await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalled())
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
    await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalled())
  }
})

export const RemoveFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, () => new HttpResponse(null, { status: 500 })))
  },
  play: async () => {
    await userEvent.click(await screen.findByRole("button", { name: "More actions for Factory" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Remove" }))
    await expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t remove Factory. Try again.")
    // The menu comes back to try again.
    await expect(await screen.findByRole("button", { name: "More actions for Factory" })).toBeEnabled()
  }
})

// Adding a pickup address needs a phone number: Amazon needs one to schedule a pickup.
export const AddPickup = meta.story({
  args: { addresses: [] },
  play: async () => {
    const sheet = await shownDialog("Lotus Manufacturing")
    await expect(sheet.getByText("No addresses yet")).toBeInTheDocument()
    await userEvent.click(sheet.getByRole("button", { name: "Add address" }))
    const dialog = await shownDialog("Add a pickup address for Lotus Manufacturing")
    await expect(dialog.getByRole("textbox", { name: "Address name" })).toHaveAttribute("placeholder", "Factory")
    await userEvent.click(dialog.getByRole("button", { name: "Save address" }))
    await expect(
      await dialog.findByText("Add a pickup phone number. Amazon needs it to schedule pickup")
    ).toBeInTheDocument()
    await expect(dialog.getAllByText("Fill in this field").length).toBeGreaterThan(3)
    await expect(sent).toHaveLength(0)
    await userEvent.type(dialog.getByRole("textbox", { name: "Address name" }), "Warehouse 2")
    await userEvent.type(dialog.getByRole("textbox", { name: "Contact name" }), "Mei Chen")
    await userEvent.type(dialog.getByRole("textbox", { name: "Phone number" }), "+86 579 8555 1234")
    await userEvent.type(dialog.getByRole("textbox", { name: "Street address" }), "12 Chouzhou Road")
    await userEvent.type(dialog.getByRole("textbox", { name: "City" }), "Yiwu")
    await userEvent.type(dialog.getByRole("textbox", { name: "Postal code" }), "322000")
    await chooseOption(dialog.getByRole("combobox", { name: "Country" }), "China")
    await chooseOption(dialog.getByRole("combobox", { name: "State or province" }), "Zhejiang Sheng")
    await userEvent.click(dialog.getByRole("button", { name: "Save address" }))
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
    const sheet = await shownDialog("Bayline Freight")
    await expect(sheet.element).toHaveTextContent("Stops on the way to Amazon or your warehouse")
    await expect(sheet.getByRole("button", { name: "Rename" })).toBeInTheDocument()
    await userEvent.click(sheet.getByRole("button", { name: "More actions for Shenzhen consolidation" }))
    const edit = await screen.findByRole("menuitem", { name: "Edit" })
    await expect(screen.queryByRole("menuitem", { name: "Remove" })).toBeNull()
    await userEvent.click(edit)
    const dialog = await shownDialog("Edit address")
    await userEvent.click(dialog.getByRole("button", { name: "Save changes" }))
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
    const sheet = await shownDialog("Lotus Manufacturing")
    await expect(sheet.element).toHaveTextContent("Keeps its own pickup addresses on Copacker")
    await expect(sheet.getByText("Factory")).toBeInTheDocument()
    await expect(sheet.queryByRole("button", { name: "Add address" })).toBeNull()
    await expect(sheet.queryByRole("button", { name: /More actions/ })).toBeNull()
  }
})

export const JoinedForwarder = meta.story({
  args: { partner: forwarder, joined: true, editable: false, addresses: [] },
  play: async () => {
    const sheet = await shownDialog("Bayline Freight")
    await expect(sheet.element).toHaveTextContent("Keeps its own addresses on Copacker")
    await expect(sheet.getByText("No addresses yet")).toBeInTheDocument()
  }
})

// A pickup address typed on a shipment starts the dialog, which reports the saved address with its new id.
export const DialogFromDraft = meta.story({
  render: (args) => (
    <PartnerAddressDialog
      partner={supplier}
      draft={{ ...lotusFactory, addressLine2: "" }}
      open
      onOpenChange={args.onOpenChange}
      onSaved={onSaved}
    />
  ),
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, () => HttpResponse.json({ ok: true, id: "3c1a8f2e-0d4b-4c7a-9e21-5a6b7c8d9e09" })))
  },
  play: async ({ args }) => {
    const dialog = await shownDialog("Add a pickup address for Lotus Manufacturing")
    await expect(dialog.getByRole("textbox", { name: "Street address" })).toHaveValue("1000 Siji Road")
    await userEvent.type(dialog.getByRole("textbox", { name: "Address name" }), "Factory")
    await userEvent.click(dialog.getByRole("button", { name: "Save address" }))
    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith({
        id: "3c1a8f2e-0d4b-4c7a-9e21-5a6b7c8d9e09",
        name: "Factory",
        address: { ...lotusFactory, addressLine2: "" }
      })
    )
    await waitFor(() => expect(args.onOpenChange).toHaveBeenCalledWith(false))
  }
})

export const DialogFails = meta.story({
  render: (args) => (
    <PartnerAddressDialog partner={forwarder} draft={harborWarehouse} open onOpenChange={args.onOpenChange} />
  ),
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, failWith("Bayline Freight already has an address named Portland.")))
  },
  play: async ({ args }) => {
    const dialog = await shownDialog("Add an address for Bayline Freight")
    await expect(dialog.getByRole("textbox", { name: "Address name" })).toHaveAttribute("placeholder", "Yiwu warehouse")
    await userEvent.type(dialog.getByRole("textbox", { name: "Address name" }), "Portland")
    await userEvent.click(dialog.getByRole("button", { name: "Save address" }))
    await expect(await dialog.findByText("Bayline Freight already has an address named Portland.")).toBeInTheDocument()
    await expect(args.onOpenChange).not.toHaveBeenCalled()
  }
})

export const Summary = meta.story({
  render: () => <AddressSummary name="Factory" address={lotusFactory} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Factory")).toBeVisible()
    await expect(canvas.getByText("1000 Siji Road, Building 3, Yiwu, Zhejiang 322000, CN")).toBeVisible()
    const phone = canvas.getByText("+86 579 8555 1234")
    await expect(phone.parentElement).toHaveTextContent("Mei Chen, +86 579 8555 1234")
    await expect(phone).toHaveAttribute("dir", "ltr")
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
