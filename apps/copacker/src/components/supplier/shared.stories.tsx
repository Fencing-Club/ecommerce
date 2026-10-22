import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { Amounts, StatusBadge } from "./shared"

// The pieces the supplier pages share: status badges and amounts.
const meta = preview.meta({
  title: "Components/Supplier workspace/Shared",
  component: StatusBadge,
  args: { status: "active" }
})

export const Statuses = meta.story({
  render: () => (
    <div className="flex gap-2">
      <StatusBadge status="active" />
      <StatusBadge status="draft" />
      <StatusBadge status="archived" />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Active")).toBeVisible()
    await expect(canvas.getByText("Draft")).toBeVisible()
    await expect(canvas.getByText("Archived")).toBeVisible()
  }
})

export const AmountsInCurrencies = meta.story({
  render: () => (
    <div className="flex gap-8">
      <Amounts
        amounts={[
          { currency: "USD", amount: 1_284_000 },
          { currency: "EUR", amount: 96_000 }
        ]}
      />
      <Amounts amounts={[]} />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("$12,840")).toBeVisible()
    await expect(canvas.getByText("€960")).toBeVisible()
    await expect(canvas.getByText("—")).toBeVisible()
    await expect(canvas.getByText("None")).toHaveClass("sr-only")
  }
})
