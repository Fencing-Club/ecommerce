import { useState } from "react"
import { expect, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { Button } from "@/components/ui/button"
import { type ActionRequest, recordActions, failWith } from "@/stories/actions"
import { forwarderRecordId } from "@/stories/fixtures/logistics"
import { shownDialog, shownAlertDialog } from "@/stories/play"
import { InviteForwarder, RemoveForwarder, RenameForwarder } from "./forwarder-actions"

const sent: ActionRequest[] = []

const meta = preview.meta({
  title: "Components/Partners/Forwarder actions",
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent))
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
    const dialog = await shownDialog("Invite Bayline Freight")
    await expect(dialog.element).toHaveTextContent(
      "They’ll keep their own warehouse addresses for your purchase orders."
    )
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
    await shownDialog()
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
    msw.use(recordActions(sent, failWith("Bayline Freight already joined Copacker.")))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Invite" }))
    await shownDialog()
    await userEvent.click(screen.getByRole("button", { name: "Send invitation" }))
    await expect(await screen.findByText("Bayline Freight already joined Copacker.")).toBeInTheDocument()
  }
})

export const Rename = meta.story({
  render: () => <RenameForwarder id={forwarderRecordId} name="Bayline Freight" />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Edit Bayline Freight" }))
    await shownDialog("Edit forwarder")
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

// Cancelling drops the edit and its error: the next opening shows the saved name.
export const RenameCancelled = meta.story({
  render: () => <RenameForwarder id={forwarderRecordId} name="Bayline Freight" />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Edit Bayline Freight" }))
    await shownDialog("Edit forwarder")
    await userEvent.clear(screen.getByRole("textbox", { name: "Company" }))
    await userEvent.click(screen.getByRole("button", { name: "Save" }))
    await screen.findByText("Fill in this field")
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
    await userEvent.click(canvas.getByRole("button", { name: "Edit Bayline Freight" }))
    await shownDialog("Edit forwarder")
    await expect(screen.getByRole("textbox", { name: "Company" })).toHaveValue("Bayline Freight")
    await expect(screen.queryByText("Fill in this field")).toBeNull()
    await expect(sent).toHaveLength(0)
  }
})

export const Remove = meta.story({
  render: () => <RemoveForwarder id={forwarderRecordId} name="Bayline Freight" />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Remove" }))
    const dialog = await shownAlertDialog("Remove Bayline Freight?")
    await expect(dialog.element).toHaveTextContent("Purchase orders already sent keep their address.")
    // Cancel keeps the forwarder.
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    await expect(sent).toHaveLength(0)
    await userEvent.click(canvas.getByRole("button", { name: "Remove" }))
    await shownAlertDialog()
    await userEvent.click(screen.getByRole("button", { name: "Remove" }))
    await waitFor(() => expect(sent).toEqual([{ action: "forwarder.remove", data: { id: forwarderRecordId } }]))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalled())
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
    await shownAlertDialog()
    await userEvent.click(screen.getByRole("button", { name: "Remove" }))
    await expect(await screen.findByText("Couldn’t remove Bayline Freight. Try again.")).toBeInTheDocument()
    await expect(screen.getByRole("alertdialog")).toBeInTheDocument()
    // Opening it again starts without the error.
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    await userEvent.click(canvas.getByRole("button", { name: "Remove" }))
    await shownAlertDialog()
    await expect(screen.queryByText("Couldn’t remove Bayline Freight. Try again.")).toBeNull()
  }
})
