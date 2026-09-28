import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import type { ComponentProps } from "react"
import { expect, userEvent, within } from "storybook/test"
import preview from "#.storybook/preview"
import { daysAgo, orderRow, orderRows } from "@/stories/fixtures/orders"
import { amazonOrder, warehouse } from "@/stories/fixtures/purchase-orders"
import { serverStory } from "@/stories/server"
import { OrderList } from "./order-list"

type Props = ComponentProps<typeof OrderList>

const meta = preview.meta({
  ...serverStory((props: Props) => <OrderList {...props} />),
  args: { rows: orderRows, status: undefined, showValue: true, drafts: true, timeZone: undefined },
  // The delivery address the rows' purchase orders go to.
  parameters: { db: { contacts: [warehouse] } }
})

export const AllOrders = meta.story({
  play: async ({ canvas }) => {
    const tabs = within(canvas.getByRole("navigation", { name: "Purchase order status" }))
    await expect(tabs.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "All",
      "Draft",
      "With supplier",
      "Closed"
    ])
    await expect(tabs.getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "page")
    await expect(tabs.getByRole("link", { name: "Draft" })).toHaveAttribute("href", "/orders?status=draft")
    await expect(canvas.getByRole("columnheader", { name: "Value" })).toBeInTheDocument()
    await expect(canvas.getByRole("link", { name: "PO-1046" })).toHaveAttribute("href", "/orders/order-PO-1046")
    await expect(canvas.getAllByText("3 products")).toHaveLength(5)
    await expect(canvas.getAllByText("Oakland warehouse")).toHaveLength(5)
    await expect(canvas.getAllByText("$2,958.00")).toHaveLength(5)
    // A purchase order from another year shows its year.
    const lastYear = daysAgo(400).toLocaleDateString("en", { year: "numeric" })
    await expect(canvas.getByText(new RegExp(lastYear))).toBeInTheDocument()
    await expect(canvas.getAllByText("With supplier").length).toBeGreaterThan(1)
    // The whole row opens the purchase order.
    await userEvent.click(canvas.getAllByText("Northwind Textiles")[0]!)
    await expect(getRouter().push).toHaveBeenCalledWith("/orders/order-PO-1044")
  }
})

export const Drafts = meta.story({
  args: { status: "draft" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Draft" })).toHaveAttribute("aria-current", "page")
    await expect(canvas.getByRole("link", { name: "PO-1046" })).toBeVisible()
    await expect(canvas.queryByRole("link", { name: "PO-1045" })).toBeNull()
  }
})

export const NoneInTab = meta.story({
  args: { rows: orderRows.filter((row) => row.order.status !== "closed"), status: "closed" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No closed purchase orders")).toBeVisible()
    await expect(canvas.queryByRole("link", { name: /PO-/ })).toBeNull()
  }
})

const toAmazon = orderRow("PO-1050", "submitted", "Lotus Manufacturing", 3)

// A forwarder's list: no drafts and no prices, and a purchase order to Amazon names its network.
export const WithoutValues = meta.story({
  args: {
    rows: [
      { ...toAmazon, order: { ...toAmazon.order, data: { ...amazonOrder, reference: "PO-1050" } } },
      orderRow("PO-1049", "closed", "Northwind Textiles", 20)
    ],
    status: "draft",
    showValue: false,
    drafts: false
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("link", { name: "Draft" })).toBeNull()
    // Without a Draft tab, the draft status falls back to All.
    await expect(canvas.getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "page")
    await expect(canvas.queryByRole("columnheader", { name: "Value" })).toBeNull()
    await expect(canvas.queryByText("$2,958.00")).toBeNull()
    await expect(canvas.getByText("Amazon FBA")).toBeInTheDocument()
    await expect(canvas.getByText("Oakland warehouse")).toBeInTheDocument()
  }
})
