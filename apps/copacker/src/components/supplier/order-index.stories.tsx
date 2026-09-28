import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { expect, userEvent, within } from "storybook/test"
import preview from "#.storybook/preview"
import { customerIds, manySupplierOrders, supplierOrders, unpricedOrders } from "@/stories/fixtures/supplier"
import { member } from "@/stories/workspace"
import { SupplierOrderIndex } from "./order-index"

const meta = preview.meta({
  component: SupplierOrderIndex,
  args: { orders: supplierOrders }
})

const rowOf = (canvas: ReturnType<typeof within>, reference: string) =>
  within(canvas.getByRole("link", { name: reference }).closest("tr")!)

export const Default = meta.story({
  play: async ({ canvas }) => {
    const [first] = supplierOrders
    await expect(canvas.getByRole("link", { name: "PO-2051" })).toHaveAttribute("href", `/orders/${first!.id}`)
    const row = rowOf(canvas, "PO-2051")
    await expect(row.getByText("Canvas tote bag and 2 more")).toBeVisible()
    await expect(row.getByRole("link", { name: "Harbor Goods" })).toHaveAttribute(
      "href",
      `/customers/${customerIds.harbor}`
    )
    await expect(row.getByText("Packing")).toBeVisible()
    await expect(row.getByText("$1,030.00")).toBeVisible()
    // An order in euros totals in euros.
    await expect(rowOf(canvas, "PO-2048").getByText("€960.00")).toBeVisible()
    await expect(rowOf(canvas, "PO-2050").getByText("Canvas tote bag")).toBeVisible()
    await expect(canvas.getByRole("tab", { name: /All\s*6/ })).toHaveAttribute("aria-selected", "true")
    await expect(canvas.getByRole("tab", { name: /To pack\s*2/ })).toBeVisible()
  }
})

export const Tabs = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("tab", { name: /To ship\s*1/ }))
    await expect(canvas.getByRole("link", { name: "PO-2048" })).toBeVisible()
    await expect(canvas.queryByRole("link", { name: "PO-2051" })).toBeNull()
    await userEvent.click(canvas.getByRole("tab", { name: /Closed\s*1/ }))
    await expect(canvas.getByRole("link", { name: "PO-2046" })).toBeVisible()
    await expect(rowOf(canvas, "PO-2046").getByText("Closed")).toBeVisible()
  }
})

export const OpensOnTab = meta.story({
  args: { initialTab: "waiting" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("tab", { name: /Waiting\s*1/ })).toHaveAttribute("aria-selected", "true")
    await expect(canvas.getAllByRole("row")).toHaveLength(2)
  }
})

export const UnknownTab = meta.story({
  args: { initialTab: "archived" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("tab", { name: /All\s*6/ })).toHaveAttribute("aria-selected", "true")
  }
})

export const Search = meta.story({
  play: async ({ canvas }) => {
    const search = canvas.getByRole("searchbox", { name: "Search orders" })
    // By customer, product or reference.
    await userEvent.type(search, "summit")
    await expect(canvas.getAllByRole("row")).toHaveLength(3)
    await userEvent.clear(search)
    await userEvent.type(search, "basket")
    await expect(canvas.getByRole("link", { name: "PO-2046" })).toBeVisible()
    await userEvent.clear(search)
    await userEvent.type(search, "PO-9")
    await expect(canvas.getByText("No orders here")).toBeVisible()
    await expect(canvas.getByText("Try another tab or search")).toBeVisible()
  }
})

export const OpenFromRow = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(rowOf(canvas, "PO-2049").getByText("Linen apron and 2 more"))
    await expect(getRouter().push).toHaveBeenCalledWith(`/orders/${supplierOrders[2]!.id}`)
  }
})

// A customer's page lists its own orders, without the customer column.
export const ForOneCustomer = meta.story({
  args: { showCustomer: false },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("columnheader", { name: "Customer" })).toBeNull()
    await expect(canvas.queryByRole("link", { name: "Harbor Goods" })).toBeNull()
  }
})

// A member without prices gets orders without totals; the customer shows as text without the Customers page.
export const WithoutPrices = meta.story({
  args: { orders: unpricedOrders },
  parameters: { permissions: member },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("columnheader", { name: "Total" })).toBeNull()
    await expect(canvas.queryByText("$1,030.00")).toBeNull()
    await expect(canvas.queryByRole("link", { name: "Harbor Goods" })).toBeNull()
    await expect(rowOf(canvas, "PO-2051").getByText("Harbor Goods")).toBeVisible()
  }
})

export const ManyOrders = meta.story({
  args: { orders: manySupplierOrders(60) },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("1–50 of 60")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Next page" }))
    await expect(canvas.getByText("51–60 of 60")).toBeVisible()
    await expect(canvas.getByRole("link", { name: "PO-3059" })).toBeVisible()
    // A new tab starts from its first page.
    await userEvent.click(canvas.getByRole("tab", { name: /To pack\s*30/ }))
    await expect(canvas.queryByText(/of 30/)).toBeNull()
  }
})

export const Empty = meta.story({
  args: { orders: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No orders yet")).toBeVisible()
    await expect(canvas.getByText("Purchase orders your customers send appear here")).toBeVisible()
  }
})
