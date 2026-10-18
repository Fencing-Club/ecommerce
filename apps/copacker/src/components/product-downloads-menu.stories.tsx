import { expect, fn, screen, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { ProductDownloadsMenu } from "./product-downloads-menu"
const meta = preview.meta({
  component: ProductDownloadsMenu,
  args: {
    items: [
      { id: "sku", label: "SKU labels" },
      { id: "fnsku", label: "FNSKU labels" },
      { id: "choking", label: "Choking hazard labels", unavailable: "Label not provided" }
    ],
    onDownload: fn()
  }
})
export const Default = meta.story({
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Product labels" }))
    await expect(screen.getByRole("menuitem", { name: /Choking hazard labels/ })).toHaveAttribute(
      "aria-disabled",
      "true"
    )
    await userEvent.click(screen.getByRole("menuitem", { name: "FNSKU labels" }))
    await expect(args.onDownload).toHaveBeenCalledWith(["fnsku"])
    await userEvent.click(canvas.getByRole("button", { name: "Product labels" }))
    await userEvent.click(screen.getByRole("menuitem", { name: "Download all product labels" }))
    await expect(args.onDownload).toHaveBeenLastCalledWith(["sku", "fnsku"])
  }
})
export const Unavailable = meta.story({
  args: { items: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Product labels" })).toBeDisabled()
  }
})
