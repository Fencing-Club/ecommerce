import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { ProductThumb } from "./product-thumb"

// A product's photo in lists and pickers, or a placeholder in the same frame.
const meta = preview.meta({
  title: "Components/Display/Product thumb",
  component: ProductThumb,
  args: { url: "/marketing/og.jpg" }
})

// A photo is decorative beside the product's name, and fits whole inside its frame.
export const Photo = meta.story({
  play: async ({ canvasElement }) => {
    const image = canvasElement.querySelector("img")
    await expect(image).toHaveAttribute("alt", "")
    await expect(image).toHaveAttribute("src", "/marketing/og.jpg")
    await expect(image).toHaveClass("object-contain")
  }
})

// Without a photo, a placeholder keeps the row's alignment and says nothing to screen readers.
export const NoPhoto = meta.story({
  args: { url: null },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("img")).toBeNull()
    await expect(canvasElement.querySelector("span[aria-hidden=true] svg")).not.toBeNull()
  }
})

// Lists size it to their rows: 32, 36 and the default 40px.
export const Sizes = meta.story({
  render: () => (
    <div className="flex items-center gap-3" data-testid="sizes">
      <ProductThumb url={null} className="size-8" />
      <ProductThumb url="/marketing/og.jpg" className="size-9" />
      <ProductThumb url={null} />
    </div>
  ),
  play: async ({ canvas }) => {
    const widths = [...canvas.getByTestId("sizes").children].map((thumb) => thumb.getBoundingClientRect().width)
    await expect(widths).toEqual([32, 36, 40])
  }
})
