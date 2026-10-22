import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { photo } from "@/stories/fixtures/supplier"
import { Amounts, ProductThumb, StatusBadge } from "./shared"

// The pieces the supplier pages share: a product's photo, status badges and amounts.
const meta = preview.meta({
  title: "Components/Supplier workspace/Shared",
  component: ProductThumb,
  args: { image: photo }
})

export const Thumbnails = meta.story({
  render: () => (
    <div className="flex gap-2" data-testid="thumbs">
      <ProductThumb image={photo} />
      <ProductThumb image={null} />
    </div>
  ),
  play: async ({ canvas }) => {
    const image = canvas.getByTestId("thumbs").querySelector("img")
    await expect(image).toHaveAttribute("src", `/api/product-images?key=${encodeURIComponent(photo.key)}`)
    await expect(canvas.getByTestId("thumbs").querySelectorAll("svg")).toHaveLength(1)
  }
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
  }
})
