import { HttpResponse } from "msw/http"
import { expect, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { type ActionRequest, recordActions, failWith } from "@/stories/actions"
import { buyerContacts, shopifyLocations, supplierContacts } from "@/stories/fixtures/logistics"
import { harborWarehouse } from "@/stories/fixtures/parties"
import { shownDialog, chooseOption } from "@/stories/play"
import { SavedAddresses } from "./saved-addresses"

const sent: ActionRequest[] = []
const [warehouse] = buyerContacts

const meta = preview.meta({
  title: "Components/Settings/Saved addresses",
  component: SavedAddresses,
  args: { contacts: buyerContacts, locations: shopifyLocations, admin: true },
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent))
  }
})

export const Buyer = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("4 addresses")).toBeVisible()
    await expect(canvas.getByText("2400 NW Front Ave, Portland, OR 97209, US")).toBeVisible()
    await expect(canvas.getByText("Stock arrives at Portland warehouse")).toBeVisible()
    // A location the store no longer lists is named generally.
    await expect(canvas.getByText("Stock arrives at a Shopify location")).toBeVisible()
    await expect(canvas.getAllByRole("link", { name: "+1 (503) 555-0142" })[0]).toHaveAttribute(
      "href",
      "tel:+15035550142"
    )
    await expect(canvas.getAllByRole("link", { name: "receiving@harbor.example.com" })[0]).toHaveAttribute(
      "href",
      "mailto:receiving@harbor.example.com"
    )
    // Only kinds other than delivery are named, and a buyer's old pickup address asks to be removed.
    await expect(canvas.getByText("Freight forwarder")).toBeVisible()
    await expect(canvas.getByText("Pickup address")).toBeVisible()
    await expect(canvas.getByText("Your supplier keeps pickups now. Remove this once they’ve added it.")).toBeVisible()
    await expect(canvas.queryByText("Delivery address")).toBeNull()
  }
})

export const Add = meta.story({
  args: { contacts: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No addresses")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Add address" }))
    const dialog = await shownDialog("Add address")
    await userEvent.click(dialog.getByRole("button", { name: "Save address" }))
    await expect((await dialog.findAllByText("Fill in this field")).length).toBeGreaterThan(3)
    await expect(sent).toHaveLength(0)
    await userEvent.type(dialog.getByRole("textbox", { name: "Address name" }), "Portland warehouse")
    // A delivery address can be linked to a Shopify location.
    await chooseOption(dialog.getByRole("combobox", { name: "Shopify location" }), "Portland warehouse")
    await userEvent.type(dialog.getByRole("textbox", { name: "Contact name" }), "Jordan Lee")
    await userEvent.type(dialog.getByRole("textbox", { name: "Street address" }), "2400 NW Front Ave")
    await userEvent.type(dialog.getByRole("textbox", { name: "City" }), "Portland")
    await userEvent.type(dialog.getByRole("textbox", { name: "Postal code" }), "97209")
    await chooseOption(dialog.getByRole("combobox", { name: "Country" }), "United States")
    await chooseOption(dialog.getByRole("combobox", { name: "State or province" }), "Oregon")
    await userEvent.click(dialog.getByRole("button", { name: "Save address" }))
    await waitFor(() => expect(sent).toHaveLength(1))
    await expect(sent[0]).toEqual({
      action: "contact.create",
      data: {
        name: "Portland warehouse",
        kind: "delivery",
        shopifyLocationId: shopifyLocations[0]!.id,
        address: {
          name: "Jordan Lee",
          phoneNumber: "",
          email: "",
          addressLine1: "2400 NW Front Ave",
          addressLine2: "",
          city: "Portland",
          stateOrRegion: "OR",
          postalCode: "97209",
          countryCode: "US"
        }
      }
    })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalled())
  }
})

export const Edit = meta.story({
  args: { contacts: [warehouse!] },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More for Portland warehouse" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Edit" }))
    const dialog = await shownDialog("Edit address")
    await expect(dialog.getByRole("combobox", { name: "Shopify location" })).toHaveTextContent("Portland warehouse")
    // Unlinking the location sends none.
    await chooseOption(dialog.getByRole("combobox", { name: "Shopify location" }), "Not linked")
    await userEvent.clear(dialog.getByRole("textbox", { name: "Postal code" }))
    await userEvent.type(dialog.getByRole("textbox", { name: "Postal code" }), "97210")
    await userEvent.click(dialog.getByRole("button", { name: "Save changes" }))
    await waitFor(() => expect(sent).toHaveLength(1))
    await expect(sent[0]).toEqual({
      action: "contact.update",
      data: {
        id: warehouse!.id,
        name: "Portland warehouse",
        kind: "delivery",
        shopifyLocationId: null,
        address: { ...harborWarehouse, postalCode: "97210" }
      }
    })
  }
})

export const EditFails = meta.story({
  args: { contacts: [warehouse!] },
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, failWith("Another address is already named Portland warehouse.")))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More for Portland warehouse" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Edit" }))
    const dialog = await shownDialog("Edit address")
    await userEvent.click(dialog.getByRole("button", { name: "Save changes" }))
    await expect(await dialog.findByText("Another address is already named Portland warehouse.")).toBeInTheDocument()
  }
})

export const Remove = meta.story({
  args: { contacts: [warehouse!] },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More for Portland warehouse" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Remove" }))
    await waitFor(() => expect(sent).toEqual([{ action: "contact.delete", data: { id: warehouse!.id } }]))
    await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalled())
  }
})

export const RemoveFails = meta.story({
  args: { contacts: [warehouse!] },
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, () => new HttpResponse(null, { status: 500 })))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More for Portland warehouse" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Remove" }))
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Couldn’t remove this address")
    await expect(canvas.getByRole("button", { name: "More for Portland warehouse" })).toBeEnabled()
  }
})

// A supplier's addresses are pickups, which need a phone number to use on shipments.
export const Supplier = meta.story({
  args: { contacts: supplierContacts, supplier: true, locations: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("2 addresses")).toBeVisible()
    await expect(canvas.queryByText("Pickup address")).toBeNull()
    await expect(canvas.getAllByText("Add a phone number to use it on shipments")).toHaveLength(1)
    await userEvent.click(canvas.getByRole("button", { name: "Add address" }))
    const dialog = await shownDialog("Add address")
    await expect(dialog.queryByRole("combobox", { name: "Shopify location" })).toBeNull()
    await expect(dialog.getByRole("textbox", { name: "Address name" })).toHaveAttribute(
      "placeholder",
      "Shenzhen warehouse"
    )
  }
})

// A supplier's pickup has no Shopify location, and stays a pickup when it's saved.
export const SupplierEditPickup = meta.story({
  args: { contacts: supplierContacts, supplier: true, locations: [] },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More for Factory" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Edit" }))
    const dialog = await shownDialog("Edit address")
    await expect(dialog.queryByRole("combobox", { name: "Shopify location" })).toBeNull()
    await expect(dialog.getByRole("combobox", { name: "Country" })).toHaveTextContent("China")
    await userEvent.click(dialog.getByRole("button", { name: "Save changes" }))
    await waitFor(() => expect(sent).toHaveLength(1))
    await expect(sent[0]).toMatchObject({
      action: "contact.update",
      data: { id: supplierContacts[0]!.id, kind: "pickup", shopifyLocationId: null }
    })
  }
})

// Cancelling an edit drops it: the next opening starts from the address as saved.
export const EditCancelled = meta.story({
  args: { contacts: [warehouse!] },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More for Portland warehouse" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Edit" }))
    let dialog = await shownDialog("Edit address")
    await userEvent.clear(dialog.getByRole("textbox", { name: "City" }))
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await userEvent.click(canvas.getByRole("button", { name: "More for Portland warehouse" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Edit" }))
    dialog = await shownDialog("Edit address")
    await expect(dialog.getByRole("textbox", { name: "City" })).toHaveValue("Portland")
    await expect(sent).toHaveLength(0)
  }
})

export const SupplierEmpty = meta.story({
  args: { contacts: [], supplier: true, locations: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No pickup addresses")).toBeVisible()
  }
})

// Members see the addresses without Add or their menus.
export const Member = meta.story({
  args: { admin: false },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("4 addresses")).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Add address" })).toBeNull()
    await expect(canvas.queryByRole("button", { name: /^More for/ })).toBeNull()
  }
})
