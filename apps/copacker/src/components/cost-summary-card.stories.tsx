import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { Button } from "@/components/ui/button"
import { CostSummaryCard } from "./cost-summary-card"

const meta = preview.meta({
  title: "Components/Purchase orders/Cost summary card",
  component: CostSummaryCard,
  args: {
    lines: 3,
    units: 420,
    subtotal: 295_800,
    charges: [
      { description: "Shipping amount", amount: 8_000 },
      { description: "Discount", amount: -2_000 },
      { description: "Pallet wrap", amount: 1_250 }
    ],
    total: 303_050,
    currency: "USD"
  }
})

// The products, then each charge by its name in the reader's language, or as typed, and the total.
export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Cost summary")).toBeVisible()
    await expect(canvas.getByText("3 variants (420 units)")).toBeVisible()
    await expect(canvas.getByText("$2,958")).toBeVisible()
    await expect(canvas.getByText("Shipping amount")).toBeVisible()
    await expect(canvas.getByText("-$20")).toBeVisible()
    await expect(canvas.getByText("Pallet wrap")).toBeVisible()
    await expect(canvas.getByText("$12.50")).toBeVisible()
    await expect(canvas.getByText("$3,030.50")).toBeVisible()
  }
})

// The editor's summary, with its Edit in the header and nothing added yet.
export const InTheEditor = meta.story({
  args: {
    lines: 0,
    units: 0,
    subtotal: 0,
    charges: [],
    total: 0,
    action: (
      <Button variant="ghost" size="sm">
        Edit
      </Button>
    )
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("0 variants (0 units)")).toBeVisible()
    await expect(canvas.getAllByText("$0")).toHaveLength(2)
    await expect(canvas.getByRole("button", { name: "Edit" })).toBeVisible()
  }
})
