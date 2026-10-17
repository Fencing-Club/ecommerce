import { expect, within } from "storybook/test"
import preview from "#.storybook/preview"
import type { Permissions } from "@/lib/access"
import { customerIds, overviewData, quietOverviewData, supplierOrders } from "@/stories/fixtures/supplier"
import { owner } from "@/stories/workspace"
import { SupplierOverview } from "./overview"

const meta = preview.meta({
  component: SupplierOverview,
  args: { data: overviewData(), permissions: owner }
})

const card = (canvas: ReturnType<typeof within>, title: string) =>
  within(canvas.getAllByText(title).at(-1)!.closest("[data-slot=card]")!)

export const Default = meta.story({
  play: async ({ canvas }) => {
    // What needs doing, most urgent first, each linking to its list.
    const tasks = card(canvas, "Needs attention")
    const links = tasks.getAllByRole("link")
    await expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/inventory?tab=short",
      "/orders?tab=pack",
      "/orders?tab=ship",
      "/products",
      "/customers"
    ])
    await expect(tasks.getByText("1 variant is short")).toBeVisible()
    await expect(tasks.getByText("2 orders to pack")).toBeVisible()
    await expect(tasks.getByText("1 customer without a catalog")).toBeVisible()
    // Figures against the period before.
    const orders = card(canvas, "Units ordered")
    await expect(orders.getByText("5,280")).toBeVisible()
    await expect(orders.getByText("+5%")).toBeVisible()
    // The buyer Overview's pill: tinted, with the comparison beside it when the tile has room and always read out.
    await expect(orders.getByText("+5%")).toHaveClass("bg-success/10")
    await expect(orders.getByText("vs previous period")).toBeInTheDocument()
    await expect(card(canvas, "Order value").getByText("$18,420")).toBeVisible()
    await expect(card(canvas, "Order value").getByText("-12%")).toHaveClass("text-destructive")
    await expect(card(canvas, "Units shipped").getByText("No earlier orders to compare")).toBeVisible()
    await expect(canvas.getByText("Order value in USD, by the day each order arrived")).toBeVisible()
    // Open orders by stage.
    const open = card(canvas, "Open orders")
    await expect(open.getByText("4 orders, 1,084 units")).toBeVisible()
    await expect(open.getByRole("link", { name: /To pack/ })).toHaveAttribute("href", "/orders?tab=pack")
    await expect(open.getByRole("link", { name: /Ready to ship\s*1\s*order/ })).toBeVisible()
    await expect(open.getByText("520 units")).toBeVisible()
  }
})

export const TopProductsAndCustomers = meta.story({
  play: async ({ canvas }) => {
    const products = card(canvas, "Top products")
    await expect(products.getByText("Units ordered, Last 30 days")).toBeVisible()
    await expect(products.getByRole("link", { name: "Canvas tote bag (Natural)" })).toHaveAttribute(
      "href",
      "/products/2f8c6b14-4b3e-4f5a-8c6d-000000000001"
    )
    await expect(products.getByText("LM-TOTE-NAT, $10,200")).toBeVisible()
    await expect(products.getByText("2,400")).toBeVisible()
    // A SKU that's no longer a product shows without a link.
    await expect(products.queryByRole("link", { name: "LM-OLD" })).toBeNull()
    const customers = card(canvas, "Top customers")
    await expect(customers.getByRole("link", { name: "Harbor Goods" })).toHaveAttribute(
      "href",
      `/customers/${customerIds.harbor}`
    )
    await expect(customers.getByText("9 orders")).toBeVisible()
    await expect(customers.getByText("$12,840")).toBeVisible()
  }
})

export const InventoryHealth = meta.story({
  play: async ({ canvas }) => {
    const health = card(canvas, "Inventory health")
    await expect(health.getByText("3 tracked variants, $680 on hand")).toBeVisible()
    await expect(health.getByRole("button", { name: "View all" })).toHaveAttribute("href", "/inventory")
    for (const label of ["Short", "Out of stock", "Low", "In stock"]) {
      await expect(health.getByText(label)).toBeVisible()
    }
    // The variants to watch: short by how much, or what's left.
    await expect(health.getByText("24 short")).toHaveClass("text-destructive")
    await expect(health.getByText("64 committed, 40 on hand")).toBeVisible()
    await expect(health.getByText("40 available")).toBeVisible()
  }
})

export const RecentOrders = meta.story({
  play: async ({ canvas }) => {
    const recent = card(canvas, "Recent orders")
    const rows = recent.getAllByRole("row")
    await expect(rows).toHaveLength(6)
    await expect(recent.getByRole("link", { name: "PO-2051" })).toHaveAttribute(
      "href",
      `/orders/${supplierOrders[0]!.id}`
    )
    await expect(within(rows[4]!).getByText("€960")).toBeVisible()
    await expect(within(rows[1]!).getByText("Packing")).toBeVisible()
  }
})

// A new supplier: nothing to do, no orders and no tracked stock.
export const Quiet = meta.story({
  args: { data: quietOverviewData() },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("All caught up")).toBeVisible()
    await expect(canvas.getAllByText("No earlier orders to compare")).toHaveLength(4)
    await expect(canvas.getAllByText("No orders in this period")).toHaveLength(2)
    await expect(canvas.getByText("No tracked variants")).toBeVisible()
    await expect(canvas.queryByText("Short")).toBeNull()
    await expect(canvas.getByText("No orders yet")).toBeVisible()
    await expect(card(canvas, "Open orders").getByText("0 orders, 0 units")).toBeVisible()
  }
})

// A custom range without a comparison names the range and leaves out the changes.
export const CustomRange = meta.story({
  args: {
    data: {
      ...overviewData(),
      period: {
        ...overviewData().period,
        key: "custom",
        range: { from: "2026-08-01", to: "2026-08-31" },
        comparison: "none"
      }
    }
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Units ordered, Aug 1 – Aug 31, 2026")).toBeVisible()
    await expect(canvas.getAllByText("No earlier orders to compare")).toHaveLength(4)
    await expect(canvas.queryByText(/vs previous/)).toBeNull()
  }
})

// A member who sees the Overview and orders, but not inventory, products or customers.
const orderViewer: Permissions = { role: "member", access: { overview: "view", orders: "view", prices: "view" } }

export const Member = meta.story({
  args: { permissions: orderViewer },
  parameters: { permissions: orderViewer },
  play: async ({ canvas }) => {
    const tasks = card(canvas, "Needs attention")
    await expect(tasks.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/orders?tab=pack",
      "/orders?tab=ship"
    ])
    await expect(tasks.queryByText("1 variant is short")).toBeNull()
    // Pages they can't open show as text.
    await expect(canvas.queryByRole("link", { name: "Harbor Goods" })).toBeNull()
    await expect(canvas.queryByRole("link", { name: "Canvas tote bag (Natural)" })).toBeNull()
    await expect(card(canvas, "Inventory health").queryByRole("button", { name: "View all" })).toBeNull()
    await expect(card(canvas, "Recent orders").getByRole("link", { name: "PO-2051" })).toBeVisible()
  }
})
