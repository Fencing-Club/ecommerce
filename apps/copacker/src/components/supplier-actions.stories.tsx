import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { type ActionRequest, recordActions, supplierRecordId } from "@/stories/fixtures/logistics"
import { EditSupplier, InviteSupplierByEmail } from "./supplier-actions"

const sent: ActionRequest[] = []

const contact = {
  website: "https://lotus.example.com",
  contactName: "Mei Chen",
  contactEmail: "mei@lotus.example.com",
  phoneNumber: "+86 188 6161 3263"
}
const noContact = { website: null, contactName: null, contactEmail: null, phoneNumber: null }

const meta = preview.meta({
  title: "Components/Partners/Supplier actions",
  beforeEach: ({ msw }) => {
    sent.length = 0
    msw.use(recordActions(sent))
  }
})

export const Edit = meta.story({
  args: { onOpenChange: fn() },
  render: (args) => (
    <EditSupplier
      id={supplierRecordId}
      name="Lotus Manufacturing"
      shopifySupplierName="LOTUS MANUFACTURING CO., LTD"
      leadTimeDays={45}
      defaultLeadTimeDays={60}
      contact={contact}
      joined={false}
      open
      onOpenChange={args.onOpenChange ?? (() => undefined)}
    />
  ),
  play: async ({ args }) => {
    const dialog = await screen.findByRole("dialog", { name: "Edit Lotus Manufacturing" })
    // Shopify's supplier name shows but can't be changed here.
    await expect(within(dialog).getByRole("textbox", { name: "Company name" })).toBeDisabled()
    await expect(within(dialog).getByRole("textbox", { name: "Company name" })).toHaveValue(
      "LOTUS MANUFACTURING CO., LTD"
    )
    await expect(dialog).toHaveTextContent("From purchase order to sellable stock. Empty means 60.")
    const leadTime = within(dialog).getByRole("spinbutton", { name: "Lead time (days)" })
    await expect(leadTime).toHaveValue(45)
    await userEvent.clear(leadTime)
    await expect(leadTime).toHaveValue(null)
    await userEvent.type(leadTime, "30")
    const website = within(dialog).getByRole("textbox", { name: "Website" })
    await userEvent.clear(website)
    await userEvent.type(website, "lotus-mfg.example.com")
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(sent).toEqual([
        {
          action: "supplier.update",
          data: {
            id: supplierRecordId,
            name: "Lotus Manufacturing",
            leadTimeDays: 30,
            contactName: "Mei Chen",
            contactEmail: "mei@lotus.example.com",
            phoneNumber: "+86 188 6161 3263",
            website: "https://lotus-mfg.example.com"
          }
        }
      ])
    )
    await waitFor(() => expect(args.onOpenChange).toHaveBeenCalledWith(false))
  }
})

// An empty lead time falls back to the workspace's; bad contact details are caught before saving.
export const EditValidation = meta.story({
  args: { onOpenChange: fn() },
  render: (args) => (
    <EditSupplier
      id={supplierRecordId}
      name="Northwind Textiles"
      shopifySupplierName={null}
      leadTimeDays={null}
      defaultLeadTimeDays={60}
      contact={noContact}
      joined={false}
      open
      onOpenChange={args.onOpenChange ?? (() => undefined)}
    />
  ),
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "Edit Northwind Textiles" })
    await expect(within(dialog).getByRole("textbox", { name: "Company name" })).toHaveAttribute(
      "placeholder",
      "Not in Shopify"
    )
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Contact email" }), "sales@")
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Phone" }), "call us")
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Website" }), "northwind")
    await userEvent.type(within(dialog).getByRole("spinbutton", { name: "Lead time (days)" }), "900")
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }))
    await expect(await within(dialog).findByText("Enter an email address")).toBeInTheDocument()
    await expect(within(dialog).getByText("Enter a phone number")).toBeInTheDocument()
    await expect(within(dialog).getByText("Enter a website, such as example.com")).toBeInTheDocument()
    await expect(within(dialog).getByText("Enter 730 or less")).toBeInTheDocument()
    await expect(sent).toHaveLength(0)
    await userEvent.clear(within(dialog).getByRole("textbox", { name: "Contact email" }))
    await userEvent.clear(within(dialog).getByRole("textbox", { name: "Phone" }))
    await userEvent.clear(within(dialog).getByRole("textbox", { name: "Website" }))
    await userEvent.clear(within(dialog).getByRole("spinbutton", { name: "Lead time (days)" }))
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(sent).toHaveLength(1))
    await expect(sent[0]?.data).toMatchObject({ leadTimeDays: null, contactEmail: "", website: "" })
  }
})

// A supplier on Copacker keeps its own contact details, which aren't sent.
export const EditJoined = meta.story({
  args: { onOpenChange: fn() },
  render: (args) => (
    <EditSupplier
      id={supplierRecordId}
      name="Lotus Manufacturing"
      shopifySupplierName="Lotus Manufacturing"
      leadTimeDays={null}
      defaultLeadTimeDays={60}
      contact={contact}
      joined
      open
      onOpenChange={args.onOpenChange ?? (() => undefined)}
    />
  ),
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "Edit Lotus Manufacturing" })
    await expect(within(dialog).getByRole("textbox", { name: "Contact name" })).toBeDisabled()
    await expect(within(dialog).getByRole("textbox", { name: "Website" })).toBeDisabled()
    await expect(dialog).toHaveTextContent("Lotus Manufacturing keeps their contact details in their own workspace.")
    await userEvent.type(within(dialog).getByRole("spinbutton", { name: "Lead time (days)" }), "21")
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(sent).toEqual([
        { action: "supplier.update", data: { id: supplierRecordId, name: "Lotus Manufacturing", leadTimeDays: 21 } }
      ])
    )
  }
})

// Emptying the lead time clears the supplier's own, so the workspace's applies.
export const EditClearLeadTime = meta.story({
  args: { onOpenChange: fn() },
  render: (args) => (
    <EditSupplier
      id={supplierRecordId}
      name="Lotus Manufacturing"
      shopifySupplierName={null}
      leadTimeDays={45}
      defaultLeadTimeDays={60}
      contact={contact}
      joined={false}
      open
      onOpenChange={args.onOpenChange ?? (() => undefined)}
    />
  ),
  play: async ({ args }) => {
    const dialog = await screen.findByRole("dialog", { name: "Edit Lotus Manufacturing" })
    const leadTime = within(dialog).getByRole("spinbutton", { name: "Lead time (days)" })
    await userEvent.clear(leadTime)
    await userEvent.tab()
    await expect(leadTime).toHaveValue(null)
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(sent).toHaveLength(1))
    await expect(sent[0]).toMatchObject({ action: "supplier.update", data: { leadTimeDays: null } })
    await waitFor(() => expect(args.onOpenChange).toHaveBeenCalledWith(false))
  }
})

// Without the server's reason, the dialog says saving failed.
export const EditFails = meta.story({
  args: { onOpenChange: fn() },
  render: (args) => (
    <EditSupplier
      id={supplierRecordId}
      name="Lotus Manufacturing"
      shopifySupplierName={null}
      leadTimeDays={45}
      defaultLeadTimeDays={60}
      contact={contact}
      joined={false}
      open
      onOpenChange={args.onOpenChange ?? (() => undefined)}
    />
  ),
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, () => new Response(null, { status: 500 })))
  },
  play: async ({ args }) => {
    const dialog = await screen.findByRole("dialog")
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }))
    await expect(await within(dialog).findByText("Couldn’t save the supplier. Try again.")).toBeInTheDocument()
    await expect(args.onOpenChange).not.toHaveBeenCalled()
  }
})

export const InviteByEmail = meta.story({
  args: { onOpenChange: fn() },
  render: (args) => (
    <InviteSupplierByEmail
      id={supplierRecordId}
      name="Northwind Textiles"
      email="sales@northwind.example.com"
      open
      onOpenChange={args.onOpenChange ?? (() => undefined)}
    />
  ),
  play: async ({ args }) => {
    const dialog = await screen.findByRole("dialog", { name: "Invite Northwind Textiles" })
    await expect(dialog).toHaveTextContent("They’ll see the purchase orders you share")
    await expect(within(dialog).getByRole("textbox", { name: "Supplier email" })).toHaveValue(
      "sales@northwind.example.com"
    )
    await userEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }))
    await waitFor(() =>
      expect(sent).toEqual([
        { action: "supplier.invite", data: { id: supplierRecordId, email: "sales@northwind.example.com" } }
      ])
    )
    await waitFor(() => expect(args.onOpenChange).toHaveBeenCalledWith(false))
  }
})

export const InviteByEmailFails = meta.story({
  args: { onOpenChange: fn() },
  render: (args) => (
    <InviteSupplierByEmail
      id={supplierRecordId}
      name="Northwind Textiles"
      email={null}
      open
      onOpenChange={args.onOpenChange ?? (() => undefined)}
    />
  ),
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, () => new Response(null, { status: 500 })))
  },
  play: async () => {
    const dialog = await screen.findByRole("dialog")
    const email = within(dialog).getByRole("textbox", { name: "Supplier email" })
    await userEvent.type(email, "sales")
    await userEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }))
    await expect(await within(dialog).findByText("Enter an email address")).toBeInTheDocument()
    await userEvent.type(email, "@northwind.example.com")
    await userEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }))
    await expect(await within(dialog).findByText("Couldn’t invite Northwind Textiles. Try again.")).toBeInTheDocument()
  }
})
