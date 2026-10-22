import { expect, fn, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { shownDialog } from "@/stories/fixtures/purchase-orders"
import { CostSummaryDialog } from "./cost-summary-dialog"

const meta = preview.meta({
  title: "Components/Purchase orders/Cost summary dialog",
  component: CostSummaryDialog,
  args: { currency: "USD", adjustments: [], onSave: fn() }
})

async function open() {
  await userEvent.click(screen.getByRole("button", { name: "Edit cost summary" }))
  return shownDialog("Edit cost summary")
}

// Each adjustment needs its type and amount; a discount saves as taken off.
export const AddAdjustments = meta.story({
  play: async ({ args }) => {
    const dialog = await open()
    const save = dialog.getByRole("button", { name: "Save" })
    await userEvent.click(dialog.getByRole("button", { name: "Add adjustment" }))
    await expect(save).toBeDisabled()
    await userEvent.click(dialog.getByRole("combobox", { name: "Adjustment" }))
    await userEvent.click(await screen.findByRole("option", { name: "Discount" }))
    await expect(save).toBeDisabled()
    await expect(dialog.getByText("$")).toBeVisible()
    await userEvent.type(dialog.getByRole("textbox", { name: "Amount" }), "12.5")
    await expect(save).toBeEnabled()
    await userEvent.click(save)
    await expect(args.onSave).toHaveBeenCalledWith([{ description: "Discount", amount: -1250 }])
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  }
})

// The PO's adjustments open to edit, its own types beside the standard ones, and Cancel keeps them as they were.
export const EditAndCancel = meta.story({
  args: {
    currency: "EUR",
    adjustments: [
      { description: "Shipping amount", amount: 8_000 },
      { description: "Pallet wrap", amount: 1_250 }
    ]
  },
  play: async ({ args }) => {
    const dialog = await open()
    const [shipping, wrap] = dialog.getAllByRole("textbox", { name: "Amount" })
    await expect(shipping).toHaveValue("80.00")
    await expect(wrap).toHaveValue("12.50")
    await expect(dialog.getAllByText("€")).toHaveLength(2)
    await userEvent.click(dialog.getAllByRole("combobox", { name: "Adjustment" })[0]!)
    await expect(await screen.findByRole("option", { name: "Pallet wrap" })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("option", { name: "Shipping amount" }))
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
    await userEvent.click(dialog.getAllByRole("button", { name: "Remove adjustment" })[1]!)
    await expect(dialog.getAllByRole("textbox", { name: "Amount" })).toHaveLength(1)
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await expect(args.onSave).not.toHaveBeenCalled()
  }
})
