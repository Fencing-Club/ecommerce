import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { photo } from "@/stories/fixtures/supplier"
import { Amounts, ProductThumb } from "./shared"

// The pieces the supplier pages share: a product's photo and amounts. Product and catalog statuses are the app's
// `Status`.
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
