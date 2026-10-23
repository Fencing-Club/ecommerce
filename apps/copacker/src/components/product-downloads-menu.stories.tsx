import { expect, fn, screen, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { chooseMenuItem } from "@/stories/play"
import { ProductDownloadsMenu } from "./product-downloads-menu"
const meta = preview.meta({
  title: "Components/Products/Product downloads menu",
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
    await chooseMenuItem(canvas.getByRole("button", { name: "Product labels" }), "FNSKU labels")
    await expect(args.onDownload).toHaveBeenCalledWith(["fnsku"])
    await userEvent.click(canvas.getByRole("button", { name: "Product labels" }))
    await expect(await screen.findByRole("menuitem", { name: /Choking hazard labels/ })).toHaveAttribute(
      "aria-disabled",
      "true"
    )
    await userEvent.click(await screen.findByRole("menuitem", { name: "Download all product labels" }))
    await expect(args.onDownload).toHaveBeenLastCalledWith(["sku", "fnsku"])
  }
})
export const Unavailable = meta.story({
  args: { items: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Product labels" })).toBeDisabled()
  }
})

export const ProductRow = meta.story({
  args: { productName: "NT-WB-2210" },
  play: async ({ canvas, args }) => {
    const trigger = canvas.getByRole("button", { name: "Labels for NT-WB-2210" })
    trigger.focus()
    await userEvent.keyboard("{Enter}")
    await userEvent.click(await screen.findByRole("menuitem", { name: "FNSKU labels" }))
    await expect(args.onDownload).toHaveBeenCalledWith(["fnsku"])
  }
})

export const SingleLabel = meta.story({
  args: {
    items: [
      { id: "fnsku", label: "FNSKU labels" },
      { id: "sku", label: "SKU labels", unavailable: "Not provided" }
    ],
    attachment: true
  },
  play: async ({ canvas, args }) => {
    const download = canvas.getByRole("button", { name: "Download FNSKU labels" })
    await expect(download).not.toHaveAttribute("aria-haspopup")
    await userEvent.click(download)
    await expect(args.onDownload).toHaveBeenCalledWith(["fnsku"])
  }
})
