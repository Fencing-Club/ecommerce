import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { type ActionRequest, recordActions, serverError } from "@/stories/fixtures/logistics"
import { InviteSupplier } from "./invite-supplier"
const sent: ActionRequest[] = []
const meta = preview.meta({
  component: InviteSupplier,
  args: { onCreated: fn() },
  beforeEach: ({ msw }) => {
    sent.length = 0
    msw.use(recordActions(sent))
  }
})
export const Add = meta.story({
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add supplier" }))
    const dialog = await screen.findByRole("dialog", { name: "Add a supplier" })
    await expect(dialog).toHaveTextContent("For a supplier that isn’t in Shopify yet.")
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Supplier company" }), "Northwind Textiles")
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Email" }), "sales@northwind.example.com")
    await userEvent.click(within(dialog).getByRole("button", { name: "Add supplier" }))
    await waitFor(() =>
      expect(sent).toEqual([
        { action: "supplier.create", data: { name: "Northwind Textiles", email: "sales@northwind.example.com" } }
      ])
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(args.onCreated).toHaveBeenCalled())
  }
})

export const AddValidation = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add supplier" }))
    const dialog = await screen.findByRole("dialog")
    await userEvent.click(within(dialog).getByRole("button", { name: "Add supplier" }))
    await expect(await within(dialog).findByText("Fill in this field")).toBeInTheDocument()
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Email" }), "sales@")
    await userEvent.click(within(dialog).getByRole("button", { name: "Add supplier" }))
    await expect(await within(dialog).findByText("Enter an email address")).toBeInTheDocument()
    await expect(sent).toHaveLength(0)
  }
})

export const AddFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, () => serverError("Northwind Textiles is already one of your suppliers.")))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add supplier" }))
    const dialog = await screen.findByRole("dialog")
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Supplier company" }), "Northwind Textiles")
    await userEvent.click(within(dialog).getByRole("button", { name: "Add supplier" }))
    await expect(
      await within(dialog).findByText("Northwind Textiles is already one of your suppliers.")
    ).toBeInTheDocument()
  }
})

// Opened from the Add partner menu, without a trigger of its own.
export const AddControlled = meta.story({
  args: { open: true, onOpenChange: fn() },
  play: async ({ args, canvas }) => {
    await expect(canvas.queryByRole("button", { name: "Add supplier" })).toBeNull()
    const dialog = await screen.findByRole("dialog", { name: "Add a supplier" })
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
    await expect(args.onOpenChange).toHaveBeenCalledWith(false, expect.anything())
  }
})
