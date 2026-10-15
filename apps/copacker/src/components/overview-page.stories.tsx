import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { buyerOverview, supplierOverviewData } from "@/stories/fixtures/overview"
import { owner } from "@/stories/workspace"
import { OverviewPagePending, OverviewPageView } from "./overview-page"

const meta = preview.meta({
  component: OverviewPageView,
  args: { page: { kind: "buyer", admin: true, data: buyerOverview } }
})

export const Buyer = meta.story({
  args: { page: { kind: "buyer", admin: true, data: buyerOverview } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible()
    await expect(canvas.getByRole("region", { name: "Sales, Last 30 days" })).toBeVisible()
  }
})
export const Supplier = meta.story({
  args: { page: { kind: "supplier", data: supplierOverviewData, permissions: owner } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible()
    await expect(canvas.getAllByText("Orders received")[0]).toBeVisible()
  }
})
export const Pending = meta.story({
  render: () => <OverviewPagePending />,
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("Loading overview")).toHaveAttribute("aria-busy", "true")
  }
})

export const SupplierUrdu = meta.story({
  args: { page: { kind: "supplier", data: supplierOverviewData, permissions: owner } },
  globals: { locale: "ur" },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("heading", { name: "جائزہ", level: 1 })).toBeVisible()
    await expect(canvasElement.ownerDocument.documentElement).toHaveAttribute("dir", "rtl")
  }
})
