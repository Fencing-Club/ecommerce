import { useState } from "react"
import { expect, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { type ActionRequest, recordActions, serverError } from "@/stories/fixtures/logistics"
import { AddForwarder } from "./add-forwarder"
import { Button } from "./ui/button"

const sent: ActionRequest[] = []

// The Add partner menu holds the dialog's state; this button stands in for it.
function Opener() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open</Button>
      <AddForwarder open={open} onOpenChange={setOpen} />
    </>
  )
}

const meta = preview.meta({
  title: "Components/Partners/Add forwarder",
  render: () => <Opener />,
  beforeEach: ({ msw }) => {
    sent.length = 0
    msw.use(recordActions(sent))
  }
})

export const Add = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Open" }))
    const dialog = await screen.findByRole("dialog", { name: "Add a forwarder" })
    await expect(dialog).toHaveTextContent("Picks up from your supplier and ships on to Amazon or your warehouse.")
    await userEvent.type(screen.getByRole("textbox", { name: "Company" }), "Bayline Freight")
    await userEvent.type(screen.getByRole("textbox", { name: "Email" }), "ops@bayline.example.com")
    await userEvent.click(screen.getByRole("button", { name: "Add forwarder" }))
    await waitFor(() =>
      expect(sent).toEqual([
        { action: "forwarder.create", data: { name: "Bayline Freight", email: "ops@bayline.example.com" } }
      ])
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    // The page shows the new forwarder before the dialog closes.
    await expect(getStoryRouter().invalidate).toHaveBeenCalledWith({ sync: true })
  }
})

// Without an email, the forwarder is added without an invitation.
export const AddWithoutEmail = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Open" }))
    await screen.findByRole("dialog")
    await userEvent.type(screen.getByRole("textbox", { name: "Company" }), "Pacific Consolidators")
    await userEvent.click(screen.getByRole("button", { name: "Add forwarder" }))
    await waitFor(() =>
      expect(sent).toEqual([{ action: "forwarder.create", data: { name: "Pacific Consolidators", email: "" } }])
    )
  }
})

export const AddValidation = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Open" }))
    await screen.findByRole("dialog")
    await userEvent.type(screen.getByRole("textbox", { name: "Company" }), "B")
    await userEvent.type(screen.getByRole("textbox", { name: "Email" }), "ops@")
    await userEvent.click(screen.getByRole("button", { name: "Add forwarder" }))
    await expect(await screen.findByText("Enter at least 2 characters")).toBeInTheDocument()
    await expect(screen.getByText("Enter an email address")).toBeInTheDocument()
    // The email's hint and its error both describe it.
    await expect(screen.getByRole("textbox", { name: "Email" })).toHaveAccessibleDescription(
      "Add one to invite them now. Enter an email address"
    )
    await expect(sent).toHaveLength(0)
  }
})

export const AddFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, () => serverError("Bayline Freight is already one of your forwarders.")))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Open" }))
    await screen.findByRole("dialog")
    await userEvent.type(screen.getByRole("textbox", { name: "Company" }), "Bayline Freight")
    await userEvent.click(screen.getByRole("button", { name: "Add forwarder" }))
    await expect(await screen.findByText("Bayline Freight is already one of your forwarders.")).toBeInTheDocument()
    await expect(screen.getByRole("dialog")).toBeInTheDocument()
  }
})

// Cancelling drops what was typed and the error: the next opening starts empty.
export const CancelStartsOver = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, () => serverError("Bayline Freight is already one of your forwarders.")))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Open" }))
    await screen.findByRole("dialog")
    await userEvent.type(screen.getByRole("textbox", { name: "Company" }), "Bayline Freight")
    await userEvent.click(screen.getByRole("button", { name: "Add forwarder" }))
    await screen.findByText("Bayline Freight is already one of your forwarders.")
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await userEvent.click(canvas.getByRole("button", { name: "Open" }))
    await screen.findByRole("dialog")
    await expect(screen.getByRole("textbox", { name: "Company" })).toHaveValue("")
    await expect(screen.queryByText("Bayline Freight is already one of your forwarders.")).toBeNull()
  }
})
