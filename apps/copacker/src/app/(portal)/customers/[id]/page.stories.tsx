import { expect, within } from "storybook/test"
import preview from "#.storybook/preview"
import { CustomerPageView } from "@/components/customer-page"
import { can, type Permissions } from "@/lib/access"
import { catalogIds, customerIds, customerRows, harborDetail } from "@/stories/fixtures/supplier"
import { pageStory } from "@/stories/server"
import { owner } from "@/stories/workspace"

function CustomerPage({ detail, permissions }: { detail: typeof harborDetail; permissions: Permissions }) {
  const prices = can(permissions, "prices")
  const showOrders = can(permissions, "orders")
  return (
    <CustomerPageView
      {...detail}
      customer={{ ...detail.customer, spent: prices ? detail.customer.spent : [] }}
      orders={showOrders ? detail.orders.map((order) => ({ ...order, total: prices ? order.total : null })) : []}
      prices={prices}
      showOrders={showOrders}
      openCatalog={prices && can(permissions, "catalogs")}
    />
  )
}

const meta = preview.meta({
  title: "Pages/Supplier/Customers/Detail",
  ...pageStory(`/customers/${customerIds.harbor}`, CustomerPage, "supplier"),
  args: { detail: harborDetail, permissions: owner }
})

const card = (canvas: ReturnType<typeof within>, title: string) =>
  within(canvas.getByText(title).closest("[data-slot=card]")!)

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Harbor Goods" })).toBeVisible()
    // The figures are the app's stat cards: the first currency spent, the others named beneath.
    const spent = card(canvas, "Amount spent")
    await expect(spent.getByText("$12,840.00")).toBeVisible()
    await expect(spent.getByText("Plus €960.00")).toBeVisible()
    // Each figure has its own card.
    await expect(canvas.getByText("6").closest("[data-slot=card]")).toHaveTextContent("Orders6")
    // Its orders, without a customer column.
    await expect(canvas.getByRole("link", { name: "PO-2051" })).toBeVisible()
    await expect(canvas.queryByRole("columnheader", { name: "Customer" })).toBeNull()
    await expect(canvas.getByRole("columnheader", { name: "Total" })).toBeVisible()
    const catalog = card(canvas, "Catalog")
    await expect(catalog.getByRole("combobox", { name: "Catalog for Harbor Goods" })).toHaveTextContent(
      "Wholesale 2026"
    )
    await expect(catalog.getByRole("link", { name: "Open Wholesale 2026" })).toHaveAttribute(
      "href",
      `/catalogs/${catalogIds.wholesale}`
    )
    const contact = card(canvas, "Contact")
    await expect(contact.getByText("Jordan Lee")).toBeVisible()
    await expect(contact.getByRole("link", { name: "jordan@example.com" })).toHaveAttribute(
      "href",
      "mailto:jordan@example.com"
    )
    await expect(contact.getByRole("link", { name: "+1 (425) 260-2501" })).toHaveAttribute("href", "tel:+14252602501")
    await expect(contact.getByRole("link", { name: "https://harbor.example.com" })).toHaveAttribute(
      "href",
      "https://harbor.example.com"
    )
  }
})

// A new customer without a catalog, contact details or orders.
export const NewCustomer = meta.story({
  args: {
    detail: {
      customer: customerRows[0]!,
      contact: { name: null, email: null, phone: null, website: null },
      catalogs: harborDetail.catalogs,
      orders: []
    }
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Bluebird Home" })).toBeVisible()
    const catalog = card(canvas, "Catalog")
    await expect(catalog.getByRole("combobox")).toHaveTextContent("No catalog")
    await expect(catalog.getByText("All products at list prices")).toBeVisible()
    await expect(catalog.queryByRole("link")).toBeNull()
    await expect(canvas.getByText("No contact details")).toBeVisible()
    await expect(canvas.getByText("No orders yet")).toBeVisible()
    await expect(card(canvas, "Amount spent").getByText("—")).toBeVisible()
  }
})

// A member who views customers, without prices, orders or catalogs: what's left is the customer and its catalog.
const customerViewer: Permissions = { role: "member", access: { customers: "view" } }

export const Member = meta.story({
  args: { permissions: customerViewer },
  parameters: { permissions: customerViewer },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText("Amount spent")).toBeNull()
    await expect(canvas.getByText("Customer since")).toBeVisible()
    await expect(canvas.queryByRole("link", { name: "PO-2051" })).toBeNull()
    await expect(canvas.getByRole("combobox", { name: "Catalog for Harbor Goods" })).toBeDisabled()
    await expect(canvas.queryByRole("link", { name: "Open Wholesale 2026" })).toBeNull()
  }
})

// A member who opens orders without prices sees them without totals.
const orderViewer: Permissions = { role: "member", access: { customers: "view", orders: "view" } }

export const MemberWithOrders = meta.story({
  args: { permissions: orderViewer },
  parameters: { permissions: orderViewer },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "PO-2051" })).toBeVisible()
    await expect(canvas.queryByRole("columnheader", { name: "Total" })).toBeNull()
  }
})
