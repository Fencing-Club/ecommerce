import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { ProductIdentity } from "./product-identity"

const meta = preview.meta({
  component: ProductIdentity,
  args: { item: { name: "Novus Kids Jacket 350N", variant: "128 / Left", buyerSku: "fc-cjkn-lh-128", piecesPerSet: 1 } }
})
export const Variant = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("128").closest('[data-slot="badge"]')).toHaveTextContent("128 / Left")
    await expect(canvas.getByText("fc-cjkn-lh-128")).toBeVisible()
  }
})
export const Pack = meta.story({
  args: { item: { name: "Body cords", variant: "Default Title", buyerSku: "cord-2", piecesPerSet: 2 } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("2 per pack")).toBeVisible()
    await expect(canvas.queryByText("Default Title")).toBeNull()
  }
})
export const Narrow = meta.story({
  args: {
    item: {
      name: "Waffle bath towel",
      variant: "Sage / Large / 70 × 140 cm",
      buyerSku: "HG-WBT-SAG",
      piecesPerSet: 1
    }
  },
  render: (args) => (
    <div className="w-44">
      <ProductIdentity {...args} />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("/ 70 × 140 cm")).toBeVisible()
    await expect(canvas.getByText("HG-WBT-SAG")).toBeVisible()
  }
})
