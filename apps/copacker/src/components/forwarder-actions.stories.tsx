import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { useState } from "react"
import { expect, fn, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { Button } from "@/components/ui/button"
import { type ActionRequest, forwarderRecordId, recordActions, serverError } from "@/stories/fixtures/logistics"
import { AddForwarder, InviteForwarder, RemoveForwarder, RenameForwarder } from "./forwarder-actions"

const sent: ActionRequest[] = []

const meta = preview.meta({
  component: AddForwarder,
  beforeEach: ({ msw }) => {
    sent.length = 0
    msw.use(recordActions(sent))
  }
})

export const Add = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add forwarder" }))
    const dialog = await screen.findByRole("dialog", { name: "Add a forwarder" })
    await expect(dialog).toHaveTextContent("Picks up from your supplier and ships on to Amazon or your warehouse.")
    await userEvent.type(screen.getByRole("textbox", { name: "Company" }), "Bayline Freight")
    await userEvent.type(screen.getByRole("textbox", { name: "Email" }), "ops@bayline.example.com")
    await userEvent.click(screen.getAllByRole("button", { name: "Add forwarder" }).at(-1)!)
    await waitFor(() =>
      expect(sent).toEqual([
        { action: "forwarder.create", data: { name: "Bayline Freight", email: "ops@bayline.example.com" } }
      ])
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(getRouter().refresh).toHaveBeenCalled())
  }
})

// Without an email, the forwarder is added without an invitation.
export const AddWithoutEmail = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add forwarder" }))
    await screen.findByRole("dialog")
    await userEvent.type(screen.getByRole("textbox", { name: "Company" }), "Pacific Consolidators")
    await userEvent.click(screen.getAllByRole("button", { name: "Add forwarder" }).at(-1)!)
    await waitFor(() =>
      expect(sent).toEqual([{ action: "forwarder.create", data: { name: "Pacific Consolidators", email: "" } }])
    )
  }
})

export const AddValidation = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add forwarder" }))
    await screen.findByRole("dialog")
    await userEvent.type(screen.getByRole("textbox", { name: "Company" }), "B")
    await userEvent.type(screen.getByRole("textbox", { name: "Email" }), "ops@")
    await userEvent.click(screen.getAllByRole("button", { name: "Add forwarder" }).at(-1)!)
    await expect(await screen.findByText("Enter at least 2 characters")).toBeInTheDocument()
    await expect(screen.getByText("Enter an email address")).toBeInTheDocument()
    await expect(sent).toHaveLength(0)
  }
})

export const AddFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, () => serverError("Bayline Freight is already one of your forwarders.")))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add forwarder" }))
    await screen.findByRole("dialog")
    await userEvent.type(screen.getByRole("textbox", { name: "Company" }), "Bayline Freight")
    await userEvent.click(screen.getAllByRole("button", { name: "Add forwarder" }).at(-1)!)
    await expect(await screen.findByText("Bayline Freight is already one of your forwarders.")).toBeInTheDocument()
    await expect(screen.getByRole("dialog")).toBeInTheDocument()
  }
})

// Opened by the Add partner menu, which holds the dialog's state; there's no trigger of its own.
export const AddControlled = meta.story({
  args: { open: true, onOpenChange: fn() },
  play: async ({ args, canvas }) => {
    await expect(canvas.queryByRole("button", { name: "Add forwarder" })).toBeNull()
    await screen.findByRole("dialog", { name: "Add a forwarder" })
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
    await expect(args.onOpenChange).toHaveBeenCalledWith(false, expect.anything())
  }
})

function InviteDemo({ email }: { email: string | null }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Invite</Button>
      <InviteForwarder id={forwarderRecordId} name="Bayline Freight" email={email} open={open} onOpenChange={setOpen} />
    </>
  )
}

export const Invite = meta.story({
  render: () => <InviteDemo email="ops@bayline.example.com" />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Invite" }))
    const dialog = await screen.findByRole("dialog", { name: "Invite Bayline Freight" })
    await expect(dialog).toHaveTextContent("They’ll keep their own warehouse addresses for your purchase orders.")
    // It starts from the email the forwarder was added with.
    const email = screen.getByRole("textbox", { name: "Email" })
    await expect(email).toHaveValue("ops@bayline.example.com")
    await userEvent.clear(email)
    await userEvent.type(email, "dispatch@bayline.example.com")
    await userEvent.click(screen.getByRole("button", { name: "Send invitation" }))
    await waitFor(() =>
      expect(sent).toEqual([
        { action: "forwarder.invite", data: { id: forwarderRecordId, email: "dispatch@bayline.example.com" } }
      ])
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  }
})

export const InviteValidation = meta.story({
  render: () => <InviteDemo email={null} />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Invite" }))
    await screen.findByRole("dialog")
    await userEvent.click(screen.getByRole("button", { name: "Send invitation" }))
    await expect(await screen.findByText("Fill in this field")).toBeInTheDocument()
    // Closing drops what was typed and the error.
    await userEvent.type(screen.getByRole("textbox", { name: "Email" }), "not-an-email")
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
    await userEvent.click(canvas.getByRole("button", { name: "Invite" }))
    await expect(await screen.findByRole("textbox", { name: "Email" })).toHaveValue("")
    await expect(screen.queryByText("Fill in this field")).toBeNull()
    await expect(sent).toHaveLength(0)
  }
})

export const InviteFails = meta.story({
  render: () => <InviteDemo email="ops@bayline.example.com" />,
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, () => serverError("Bayline Freight already joined Copacker.")))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Invite" }))
    await screen.findByRole("dialog")
    await userEvent.click(screen.getByRole("button", { name: "Send invitation" }))
    await expect(await screen.findByText("Bayline Freight already joined Copacker.")).toBeInTheDocument()
  }
})

export const Rename = meta.story({
  render: () => <RenameForwarder id={forwarderRecordId} name="Bayline Freight" />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Edit Bayline Freight" }))
    await screen.findByRole("dialog", { name: "Edit forwarder" })
    const company = screen.getByRole("textbox", { name: "Company" })
    await expect(company).toHaveValue("Bayline Freight")
    await userEvent.clear(company)
    await userEvent.click(screen.getByRole("button", { name: "Save" }))
    await expect(await screen.findByText("Fill in this field")).toBeInTheDocument()
    await userEvent.type(company, "Bayline Freight Shenzhen")
    await userEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(sent).toEqual([
        { action: "forwarder.rename", data: { id: forwarderRecordId, name: "Bayline Freight Shenzhen" } }
      ])
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  }
})

export const Remove = meta.story({
  render: () => <RemoveForwarder id={forwarderRecordId} name="Bayline Freight" />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Remove" }))
    const dialog = await screen.findByRole("alertdialog", { name: "Remove Bayline Freight?" })
    await expect(dialog).toHaveTextContent("Purchase orders already sent keep their address.")
    // Cancel keeps the forwarder.
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    await expect(sent).toHaveLength(0)
    await userEvent.click(canvas.getByRole("button", { name: "Remove" }))
    await screen.findByRole("alertdialog")
    await userEvent.click(screen.getByRole("button", { name: "Remove" }))
    await waitFor(() => expect(sent).toEqual([{ action: "forwarder.remove", data: { id: forwarderRecordId } }]))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    await waitFor(() => expect(getRouter().refresh).toHaveBeenCalled())
  }
})

// Without the server's reason, the error names the forwarder.
export const RemoveFails = meta.story({
  render: () => <RemoveForwarder id={forwarderRecordId} name="Bayline Freight" />,
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, () => new Response(null, { status: 500 })))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Remove" }))
    await screen.findByRole("alertdialog")
    await userEvent.click(screen.getByRole("button", { name: "Remove" }))
    await expect(await screen.findByText("Couldn’t remove Bayline Freight. Try again.")).toBeInTheDocument()
    await expect(screen.getByRole("alertdialog")).toBeInTheDocument()
  }
})
