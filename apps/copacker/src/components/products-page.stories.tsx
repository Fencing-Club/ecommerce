import { fn, expect } from "storybook/test"
import preview from "#.storybook/preview"
import { supplierProducts } from "@/stories/fixtures/catalog"
import { ProductsPageView } from "./products-page"

const meta = preview.meta({ title: "Components/Products/Products page" })

export const Products = meta.story({
  render: () => (
    <ProductsPageView refresh={fn()} page={{ kind: "supplier", products: supplierProducts, editable: true }} />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Products", level: 1 })).toBeVisible()
  }
})
