import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { type ActionRequest, recordActions } from "@/stories/fixtures/logistics"
import { SupplierForm } from "./supplier-form"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog"
const sent: ActionRequest[] = []
const meta = preview.meta({
  title: "Components/Partners/Supplier form",
  beforeEach: ({ msw }) => {
    sent.length = 0
    msw.use(recordActions(sent))
  }
})
export const AddSupplier = meta.story({
  render: () => (
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a supplier</DialogTitle>
        </DialogHeader>
        <SupplierForm onSuccess={fn()} />
      </DialogContent>
    </Dialog>
  ),
  play: async () => {
    const dialog = await screen.findByRole("dialog")
    await expect(within(dialog).getByRole("textbox", { name: "Supplier company" })).toHaveAttribute(
      "placeholder",
      "Northwind Textiles"
    )
    await expect(dialog).toHaveTextContent("Add one to invite them now.")
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Supplier company" }), "Northwind Textiles")
    await userEvent.click(within(dialog).getByRole("button", { name: "Add supplier" }))
    await waitFor(() =>
      expect(sent).toEqual([{ action: "supplier.create", data: { name: "Northwind Textiles", email: "" } }])
    )
  }
})
