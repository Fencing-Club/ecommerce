import { expect, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { Table, TableBody } from "@/components/ui/table"
import {
  type ActionRequest,
  forwarderRecordId,
  partnerAddresses,
  recordActions,
  serverError,
  supplierRecordId
} from "@/stories/fixtures/logistics"
import { ForwarderRow, SupplierRow } from "./partner-actions"

const sent: ActionRequest[] = []

type SupplierDetails = React.ComponentProps<typeof SupplierRow>["supplier"]
type ForwarderDetails = React.ComponentProps<typeof ForwarderRow>["forwarder"]

const supplier: SupplierDetails = {
  id: supplierRecordId,
  name: "Lotus Manufacturing",
  email: null,
  shopifySupplierName: "LOTUS MANUFACTURING CO., LTD",
  leadTimeDays: 45,
  contact: {
    website: "https://lotus.example.com",
    contactName: "Mei Chen",
    contactEmail: "mei@lotus.example.com",
    phoneNumber: null
  },
  addresses: [partnerAddresses.factory],
  joined: false,
  invited: false,
  expired: false
}

const forwarder: ForwarderDetails = {
  id: forwarderRecordId,
  name: "Bayline Freight",
  email: "ops@bayline.example.com",
  addresses: [partnerAddresses.forwarderWarehouse],
  joined: false,
  invited: false,
  expired: false
}

// Rows render in the partners table, which stacks them on a phone.
function Rows({ children }: { children: React.ReactNode }) {
  return (
    <div className="@container">
      <Table className="@max-md:block">
        <TableBody className="@max-md:block">{children}</TableBody>
      </Table>
    </div>
  )
}

function SupplierStory(props: Partial<SupplierDetails> & { editable?: boolean; showType?: boolean }) {
  const { editable = true, showType = false, ...changes } = props
  return (
    <Rows>
      <SupplierRow
        supplier={{ ...supplier, ...changes }}
        editable={editable}
        showType={showType}
        defaultLeadTimeDays={60}
      />
    </Rows>
  )
}

function ForwarderStory(props: Partial<ForwarderDetails> & { editable?: boolean; showType?: boolean }) {
  const { editable = true, showType = false, ...changes } = props
  return (
    <Rows>
      <ForwarderRow forwarder={{ ...forwarder, ...changes }} editable={editable} showType={showType} />
    </Rows>
  )
}

const meta = preview.meta({
  title: "Components/Partners/Partner actions",
  beforeEach: ({ msw }) => {
    sent.length = 0
    msw.use(recordActions(sent))
  }
})

export const Supplier = meta.story({
  render: () => <SupplierStory />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("LOTUS MANUFACTURING CO., LTD, Mei Chen, mei@lotus.example.com")).toBeVisible()
    await expect(canvas.getByText("Not invited")).toBeVisible()
    await expect(canvas.getByText("Lead time 45 days, 1 address")).toBeInTheDocument()
    await expect(canvas.getByText("LM")).toBeInTheDocument()
    await userEvent.click(canvas.getByText("Not invited"))
    const edit = await screen.findByRole("dialog", { name: "Edit Lotus Manufacturing" })
    await userEvent.click(within(edit).getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await userEvent.click(canvas.getByRole("button", { name: "More actions for Lotus Manufacturing" }))
    await expect(await screen.findByRole("menuitem", { name: "Edit" })).toBeInTheDocument()
    await expect(screen.getByRole("menuitem", { name: "Addresses" })).toBeInTheDocument()
    await expect(screen.queryByRole("menuitem", { name: "Resend invitation" })).toBeNull()
    await userEvent.click(screen.getByRole("menuitem", { name: "Invite" }))
    const invite = await screen.findByRole("dialog", { name: "Invite Lotus Manufacturing" })
    await userEvent.type(within(invite).getByRole("textbox", { name: "Supplier email" }), "mei@lotus.example.com")
    await userEvent.click(within(invite).getByRole("button", { name: "Send invitation" }))
    await waitFor(() =>
      expect(sent).toEqual([
        { action: "supplier.invite", data: { id: supplierRecordId, email: "mei@lotus.example.com" } }
      ])
    )
  }
})

export const SupplierAddresses = meta.story({
  render: () => <SupplierStory />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More actions for Lotus Manufacturing" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Addresses" }))
    const sheet = await screen.findByRole("dialog", { name: "Lotus Manufacturing" })
    await expect(within(sheet).getByText("Factory")).toBeInTheDocument()
    // The buyer keeps the addresses of a supplier that hasn't joined.
    await expect(within(sheet).getByRole("button", { name: "Add address" })).toBeInTheDocument()
  }
})

export const SupplierResend = meta.story({
  render: () => <SupplierStory email="mei@lotus.example.com" invited showType />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Invited")).toBeVisible()
    await expect(canvas.getByText("Supplier")).toBeInTheDocument()
    await userEvent.click(canvas.getByRole("button", { name: "More actions for Lotus Manufacturing" }))
    await expect(await screen.findByRole("menuitem", { name: "Resend invitation" })).toBeInTheDocument()
    await expect(screen.queryByRole("menuitem", { name: "Invite" })).toBeNull()
    await userEvent.click(screen.getByRole("menuitem", { name: "Resend invitation" }))
    await waitFor(() => expect(sent).toEqual([{ action: "supplier.resend", data: { id: supplierRecordId } }]))
    await expect(await canvas.findByText("Invitation sent to mei@lotus.example.com")).toBeVisible()
  }
})

export const SupplierResendFails = meta.story({
  render: () => <SupplierStory email="mei@lotus.example.com" invited expired />,
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, () => serverError("Lotus Manufacturing already joined Copacker.")))
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Invitation expired")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "More actions for Lotus Manufacturing" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Resend invitation" }))
    const notice = await canvas.findByText("Lotus Manufacturing already joined Copacker.")
    await expect(notice).toHaveClass("text-destructive")
  }
})

// A supplier on Copacker keeps its own addresses, so there's nothing to invite and its addresses are read only.
export const SupplierJoined = meta.story({
  render: () => <SupplierStory joined email="mei@lotus.example.com" addresses={[]} leadTimeDays={null} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("On Copacker")).toBeVisible()
    // Standing renders as a status badge: on Copacker is done.
    await expect(canvas.getByText("On Copacker").closest("[data-slot=status]")).toHaveAttribute("data-tone", "success")
    await expect(canvas.getByText("Lead time 60 days")).toBeInTheDocument()
    await userEvent.click(canvas.getByRole("button", { name: "More actions for Lotus Manufacturing" }))
    await screen.findByRole("menuitem", { name: "Edit" })
    await expect(screen.queryByRole("menuitem", { name: "Invite" })).toBeNull()
    await expect(screen.queryByRole("menuitem", { name: "Resend invitation" })).toBeNull()
    await userEvent.click(screen.getByRole("menuitem", { name: "Addresses" }))
    const sheet = await screen.findByRole("dialog", { name: "Lotus Manufacturing" })
    await expect(sheet).toHaveTextContent("Keeps its own pickup addresses on Copacker")
    await expect(within(sheet).queryByRole("button", { name: "Add address" })).toBeNull()
  }
})

// Someone who can only view partners opens a supplier's addresses from its name.
export const SupplierViewOnly = meta.story({
  render: () => <SupplierStory editable={false} />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Lotus Manufacturing" }))
    const sheet = await screen.findByRole("dialog", { name: "Lotus Manufacturing" })
    await expect(within(sheet).queryByRole("button", { name: "Add address" })).toBeNull()
    await userEvent.click(within(sheet).getByRole("button", { name: "Close" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await userEvent.click(canvas.getByRole("button", { name: "More actions for Lotus Manufacturing" }))
    await screen.findByRole("menuitem", { name: "Addresses" })
    await expect(screen.getAllByRole("menuitem")).toHaveLength(1)
  }
})

// A forwarder's row opens its addresses, with Edit and Remove at the foot of the panel.
export const Forwarder = meta.story({
  render: () => <ForwarderStory showType />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("ops@bayline.example.com")).toBeVisible()
    await expect(canvas.getByText("Freight forwarder")).toBeInTheDocument()
    await expect(canvas.getByText("1 address")).toBeInTheDocument()
    await userEvent.click(canvas.getByRole("button", { name: "Bayline Freight" }))
    const sheet = await screen.findByRole("dialog", { name: "Bayline Freight" })
    await expect(within(sheet).getByText("Shenzhen consolidation")).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole("button", { name: "Edit Bayline Freight" }))
    const rename = await screen.findByRole("dialog", { name: "Edit forwarder" })
    await userEvent.type(within(rename).getByRole("textbox", { name: "Company" }), " Shenzhen")
    await userEvent.click(within(rename).getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(sent).toEqual([
        { action: "forwarder.rename", data: { id: forwarderRecordId, name: "Bayline Freight Shenzhen" } }
      ])
    )
  }
})

export const ForwarderInvite = meta.story({
  render: () => <ForwarderStory />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Not invited")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "More actions for Bayline Freight" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Invite" }))
    const invite = await screen.findByRole("dialog", { name: "Invite Bayline Freight" })
    await expect(within(invite).getByRole("textbox", { name: "Email" })).toHaveValue("ops@bayline.example.com")
    await userEvent.click(within(invite).getByRole("button", { name: "Send invitation" }))
    await waitFor(() =>
      expect(sent).toEqual([
        { action: "forwarder.invite", data: { id: forwarderRecordId, email: "ops@bayline.example.com" } }
      ])
    )
  }
})

// Resending goes to the email the invitation went to before.
export const ForwarderResend = meta.story({
  render: () => <ForwarderStory invited />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More actions for Bayline Freight" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Resend invitation" }))
    await waitFor(() => expect(sent).toEqual([{ action: "forwarder.invite", data: { id: forwarderRecordId } }]))
    await expect(await canvas.findByText("Invitation sent to ops@bayline.example.com")).toBeVisible()
  }
})

export const ForwarderJoined = meta.story({
  render: () => <ForwarderStory joined addresses={[]} email={null} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("On Copacker")).toBeVisible()
    await expect(canvas.getByText("No addresses yet")).toBeInTheDocument()
    await userEvent.click(canvas.getByRole("button", { name: "More actions for Bayline Freight" }))
    await screen.findByRole("menuitem", { name: "Addresses" })
    await expect(screen.getAllByRole("menuitem")).toHaveLength(1)
  }
})

// Without Edit access, the panel has no Edit or Remove.
export const ForwarderViewOnly = meta.story({
  render: () => <ForwarderStory editable={false} />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Bayline Freight" }))
    const sheet = await screen.findByRole("dialog", { name: "Bayline Freight" })
    await expect(within(sheet).queryByRole("button", { name: "Edit Bayline Freight" })).toBeNull()
    await expect(within(sheet).queryByRole("button", { name: "Remove" })).toBeNull()
  }
})

// On a phone the row stacks: the long contact line truncates, and the status and menu stay on screen.
export const Phone = meta.story({
  render: () => (
    <div data-phone className="w-[358px]">
      <SupplierStory />
    </div>
  ),
  play: async ({ canvas, canvasElement }) => {
    const width = canvasElement.querySelector("[data-phone]")?.getBoundingClientRect().right ?? 0
    const menu = canvas.getByRole("button", { name: "More actions for Lotus Manufacturing" })
    await expect(menu.getBoundingClientRect().right).toBeLessThanOrEqual(width)
    await expect(canvas.getByText("Not invited").getBoundingClientRect().right).toBeLessThanOrEqual(width)
    await expect(canvas.queryByRole("columnheader")).toBeNull()
  }
})
