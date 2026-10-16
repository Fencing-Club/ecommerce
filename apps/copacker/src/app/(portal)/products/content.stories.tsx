import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { supplierProducts } from "@/stories/fixtures/catalog"
import ProductsPage from "./page"
const meta = preview.meta({})
export const Products = meta.story({
  render: () => <ProductsPage page={{ kind: "supplier", products: supplierProducts, editable: true }} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Products", level: 1 })).toBeVisible()
  }
})
