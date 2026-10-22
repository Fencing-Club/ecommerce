import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { Amounts } from "./shared"

// The pieces the supplier pages share: amounts in each currency. Product and catalog statuses are the app's `Status`,
// and a product's photo is `ProductThumb`.
const meta = preview.meta({
  title: "Components/Supplier workspace/Shared",
  component: Amounts,
  args: { amounts: [] }
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
