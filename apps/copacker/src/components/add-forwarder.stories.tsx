import { expect, fn, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { type ActionRequest, recordActions, serverError } from "@/stories/fixtures/logistics"
import { AddForwarder } from "./add-forwarder"
const sent: ActionRequest[] = []
const meta = preview.meta({
  title: "Components/Partners/Add forwarder",
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
    // The page shows the new forwarder before the dialog closes.
    await expect(getStoryRouter().invalidate).toHaveBeenCalledWith({ sync: true })
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
