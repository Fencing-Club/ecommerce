import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { importTotals } from "@/lib/import-totals"
import { importProposal } from "@/stories/fixtures/purchase-orders"
import { ImportCostSummary } from "./import-review-summary"

const charges = importProposal.adjustments.map((charge, index) => ({ ...charge, key: `charge-${index}` }))

// An imported purchase order's charges and totals as the review edits them; the review keeps the edits.
const meta = preview.meta({
  title: "Components/Purchase orders/Import review summary",
  component: ImportCostSummary,
  args: {
    charges,
    documentTotal: importProposal.documentTotal,
    totals: importTotals(importProposal),
    currency: "USD",
    checking: false,
    onAddCharge: fn(),
    onEditCharge: fn(),
    onRemoveCharge: fn(),
    onDocumentTotalChange: fn()
  }
})

// Totals that make the document's total say nothing more.
export const Totals = meta.story({
  play: async ({ canvas, args }) => {
    await expect(canvas.getByText("$1,890")).toBeVisible()
    await expect(canvas.getByText("$85")).toBeVisible()
    await expect(canvas.getByText("$1,975")).toBeVisible()
    await expect(canvas.queryByText(/the document total/)).toBeNull()
    await expect(canvas.getByRole("textbox", { name: "Document total" })).toHaveValue("1975.00")
    await userEvent.type(canvas.getByRole("textbox", { name: "Amount of charge 1" }), "0")
    await expect(args.onEditCharge).toHaveBeenCalledWith(0, expect.any(Function))
    await userEvent.click(canvas.getByRole("button", { name: "Add charge" }))
    await expect(args.onAddCharge).toHaveBeenCalledOnce()
    await userEvent.click(canvas.getByRole("button", { name: "Remove charge 1" }))
    await expect(args.onRemoveCharge).toHaveBeenCalledWith(0)
  }
})

// A total that misses the document's says by how much.
export const OverDocumentTotal = meta.story({
  args: { totals: importTotals({ ...importProposal, documentTotal: "1945.00" }) },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("$30 over the document total")).toBeVisible()
  }
})

// Until every line and charge has its amount, the totals wait.
export const Incomplete = meta.story({
  args: { totals: null, checking: true, charges: [{ ...charges[0]!, amount: null }] },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText("—")).toHaveLength(3)
    await expect(canvas.getByRole("textbox", { name: "Amount of charge 1" })).toHaveAttribute("aria-invalid", "true")
  }
})
