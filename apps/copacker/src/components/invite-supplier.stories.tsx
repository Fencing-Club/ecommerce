import { useState } from "react"
import { expect, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { Button } from "@/components/ui/button"
import { type ActionRequest, recordActions, failWith } from "@/stories/actions"
import { shownDialog } from "@/stories/play"
import { InviteSupplier } from "./invite-supplier"

const sent: ActionRequest[] = []

// The Add partner menu or the import page holds the dialog's state; this button stands in for them.
function Opener() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open</Button>
      <InviteSupplier open={open} onOpenChange={setOpen} />
    </>
  )
}

const meta = preview.meta({
  title: "Components/Partners/Invite supplier",
  render: () => <Opener />,
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent))
  }
})

export const Add = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Open" }))
    const dialog = await shownDialog("Add a supplier")
    await expect(dialog.element).toHaveTextContent("For a supplier that isn’t in Shopify yet.")
    await expect(dialog.getByRole("textbox", { name: "Supplier company" })).toHaveAttribute(
      "placeholder",
      "Northwind Textiles"
    )
    await expect(dialog.element).toHaveTextContent("Add one to invite them now.")
    await userEvent.type(dialog.getByRole("textbox", { name: "Supplier company" }), "Northwind Textiles")
    await userEvent.type(dialog.getByRole("textbox", { name: "Email" }), "sales@northwind.example.com")
    await userEvent.click(dialog.getByRole("button", { name: "Add supplier" }))
    await waitFor(() =>
      expect(sent).toEqual([
        { action: "supplier.create", data: { name: "Northwind Textiles", email: "sales@northwind.example.com" } }
      ])
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    // The page shows the new supplier before the dialog closes.
    await expect(getStoryRouter().invalidate).toHaveBeenCalledWith({ sync: true })
  }
})

export const AddValidation = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Open" }))
    const dialog = await shownDialog()
    await userEvent.click(dialog.getByRole("button", { name: "Add supplier" }))
    await expect(await dialog.findByText("Fill in this field")).toBeInTheDocument()
    await userEvent.type(dialog.getByRole("textbox", { name: "Email" }), "sales@")
    await userEvent.click(dialog.getByRole("button", { name: "Add supplier" }))
    await expect(await dialog.findByText("Enter an email address")).toBeInTheDocument()
    await expect(sent).toHaveLength(0)
  }
})

export const AddFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, failWith("Northwind Textiles is already one of your suppliers.")))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Open" }))
    const dialog = await shownDialog()
    await userEvent.type(dialog.getByRole("textbox", { name: "Supplier company" }), "Northwind Textiles")
    await userEvent.click(dialog.getByRole("button", { name: "Add supplier" }))
    await expect(await dialog.findByText("Northwind Textiles is already one of your suppliers.")).toBeInTheDocument()
  }
})

// Cancel closes it through the state its opener holds.
export const Cancel = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Open" }))
    const dialog = await shownDialog("Add a supplier")
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  }
})
