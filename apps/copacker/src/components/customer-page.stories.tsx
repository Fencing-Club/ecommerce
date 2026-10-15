import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { harborDetail } from "@/stories/fixtures/supplier"
import { CustomerPageView } from "./customer-page"

const meta = preview.meta({})

export const Customer = meta.story({
  render: () => <CustomerPageView {...harborDetail} prices showOrders openCatalog />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Harbor Goods", level: 1 })).toBeVisible()
    await expect(canvas.getByRole("link", { name: "PO-2051" })).toBeVisible()
  }
})

export const CustomerUrdu = meta.story({
  globals: { locale: "ur" },
  render: () => <CustomerPageView {...harborDetail} prices showOrders openCatalog />,
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("heading", { name: "Harbor Goods", level: 1 })).toBeVisible()
    await expect(canvasElement.ownerDocument.documentElement).toHaveAttribute("dir", "rtl")
  }
})
