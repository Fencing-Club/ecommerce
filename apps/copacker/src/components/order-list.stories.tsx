import type { ComponentProps } from "react"
import { expect, userEvent, within } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { orderListRows } from "@/server/order-list"
import { daysAgo, orderRow, orderRows } from "@/stories/fixtures/orders"
import { amazonOrder, warehouse } from "@/stories/fixtures/purchase-orders"
import { serverStory } from "@/stories/server"
import { OrderList } from "./order-list"

type Props = Omit<ComponentProps<typeof OrderList>, "rows"> & { rows: typeof orderRows }

const meta = preview.meta({
  ...serverStory(async (props: Props) => (
    <OrderList {...props} rows={await orderListRows(props.rows, props.showValue)} />
  )),
  args: { rows: orderRows, status: undefined, showValue: true, drafts: true, timeZone: undefined },
  // The delivery address the rows' purchase orders go to.
  parameters: { db: { contacts: [warehouse] } }
})

export const AllOrders = meta.story({
  play: async ({ canvas }) => {
    const tabs = within(canvas.getByRole("navigation", { name: "Purchase order status" }))
    // Each tab counts its purchase orders, as the shipment list's tabs do.
    await expect(tabs.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "All5",
      "Draft1",
      "With supplier2",
      "Closed2"
    ])
    await expect(tabs.getByRole("link", { name: /^All/ })).toHaveAttribute("aria-current", "page")
    await expect(tabs.getByRole("link", { name: /^Draft/ })).toHaveAttribute("href", "/orders?status=draft")
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
    await expect(getStoryRouter().navigate).toHaveBeenCalledWith({ href: "/orders/order-PO-1044" })
  }
})

export const Drafts = meta.story({
  args: { status: "draft" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: /^Draft/ })).toHaveAttribute("aria-current", "page")
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
    await expect(canvas.queryByRole("link", { name: /^Draft/ })).toBeNull()
    // Without a Draft tab, the draft status falls back to All.
    await expect(canvas.getByRole("link", { name: /^All/ })).toHaveAttribute("aria-current", "page")
    await expect(canvas.queryByRole("columnheader", { name: "Value" })).toBeNull()
    await expect(canvas.queryByText("$2,958.00")).toBeNull()
    await expect(canvas.getByText("Amazon FBA")).toBeInTheDocument()
    await expect(canvas.getByText("Oakland warehouse")).toBeInTheDocument()
  }
})

// The server builds the destination while client components translate the surrounding UI. Both must use Urdu.
export const Urdu = meta.story({
  globals: { locale: "ur" },
  args: {
    rows: [
      {
        ...toAmazon,
        order: {
          ...toAmazon.order,
          data: {
            ...amazonOrder,
            reference: "PO-1050",
            items: amazonOrder.items.map((item, index) => ({ ...item, amazonNetwork: index === 0 ? "fba" : "awd_us" }))
          }
        }
      }
    ],
    showValue: false,
    drafts: false
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvasElement.ownerDocument.documentElement).toHaveAttribute("dir", "rtl")
    await expect(canvas.getByText("Amazon FBA اور AWD US")).toBeInTheDocument()
    await expect(canvas.getByRole("link", { name: "PO-1050" })).toHaveAttribute("href", "/orders/order-PO-1050")
  }
})

// On a phone each row stacks to its reference and status, with the supplier under the reference and the value below,
// instead of scrolling sideways.
export const Phone = meta.story({
  decorators: [
    (Story) => (
      <div data-phone className="w-[358px]">
        <Story />
      </div>
    )
  ],
  play: async ({ canvas, canvasElement }) => {
    const width = canvasElement.querySelector("[data-phone]")?.getBoundingClientRect().right ?? 0
    await expect(canvas.getByRole("table").getBoundingClientRect().right).toBeLessThanOrEqual(width)
    await expect(canvas.queryByRole("columnheader", { name: "Supplier" })).toBeNull()
    await expect(canvas.getAllByText(/^Lotus Manufacturing,/)[0]).toBeVisible()
    await expect(canvas.getAllByText("$2,958.00")[0]).toBeVisible()
  }
})
