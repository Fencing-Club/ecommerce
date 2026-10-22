import { expect, within } from "storybook/test"
import { translateStory } from "#.storybook/intl"
import preview from "#.storybook/preview"
import { can, isAdmin, type Permissions } from "@/lib/access"
import type { OrdersSearch } from "@/lib/page-search"
import { orderListRows } from "@/server/order-list"
import type { ListedOrder } from "@/server/supplier-workspace"
import { packingFor, shipmentRow } from "@/stories/fixtures/logistics"
import { orderRows } from "@/stories/fixtures/orders"
import { warehouse } from "@/stories/fixtures/purchase-orders"
import { supplierOrders } from "@/stories/fixtures/supplier"
import { pageStory } from "@/stories/server"
import { member, owner, type WorkspaceKind } from "@/stories/workspace"
import PageView from "./page"

type Row = (typeof orderRows)[number]

type Args = {
  kind: WorkspaceKind
  permissions: Permissions
  // The purchase orders the workspace sees, oldest first as the query returns them.
  rows: Row[]
  // A supplier's orders, as supplierOrders returns them.
  orders: ListedOrder[]
  // The ?view= the URL asks for, or a supplier's ?tab=.
  view?: OrdersSearch["view"]
  tab?: string
  // Whether the buyer connected Shopify, and has a supplier.
  shopify: boolean
  supplierLinked: boolean
}

// The Purchase orders page (page.tsx) with the rows the database would return, for each kind of workspace.
async function OrdersPage({ kind, permissions: s, rows: queried, orders, view, tab, shopify, supplierLinked }: Args) {
  const t = await translateStory("orders.index")
  if (kind === "supplier") {
    return (
      <PageView
        page={{
          view: "supplier",
          orders: can(s, "prices") ? orders : orders.map((order) => ({ ...order, total: null }))
        }}
        search={{ tab }}
      />
    )
  }
  const rows = queried.toReversed()
  const showValue = kind !== "forwarder" && can(s, "prices")
  const isBuyer = kind === "buyer"
  const creates = isBuyer && can(s, "orders", "edit")
  let nextStep = {
    description: t("next.create.description"),
    href: "/orders/new",
    action: t("create"),
    allowed: creates
  }
  if (!shopify) {
    nextStep = {
      description: t("next.shopify.description"),
      href: "/settings#integrations",
      action: t("next.shopify.action"),
      allowed: isAdmin(s)
    }
  } else if (!supplierLinked) {
    nextStep = {
      description: t("next.supplier.description"),
      href: "/partners",
      action: t("next.supplier.action"),
      allowed: can(s, "partners", "edit")
    }
  }
  const guided = isBuyer && nextStep.allowed

  return (
    <PageView
      page={{
        view: "other",
        rows: await orderListRows(rows, showValue),
        creates,
        nextStep,
        guided,
        kind
      }}
      search={{ view }}
    />
  )
}

// The page in the portal of a workspace of `kind`, for someone with `permissions`.
function page(kind: WorkspaceKind, permissions: Permissions = owner) {
  const story = pageStory("/orders", OrdersPage, kind)
  return { loaders: story.loaders, decorators: story.decorators, parameters: { ...story.parameters, permissions } }
}

const meta = preview.meta({
  title: "Pages/Purchase orders/List",
  // Each story shows it in its workspace's portal; the render is the same for all.
  render: pageStory("/orders", OrdersPage).render,
  args: {
    kind: "buyer",
    permissions: owner,
    rows: orderRows.toReversed(),
    orders: [],
    shopify: true,
    supplierLinked: true
  } satisfies Args,
  // The delivery address the purchase orders go to, PO-1045's shipment on its way, and PO-1044's supplier proposing
  // changes.
  parameters: {
    db: {
      contacts: [warehouse],
      shipments: [
        shipmentRow({
          orderId: "order-PO-1045",
          status: "shipped",
          packing: packingFor(orderRows[1]!.order.data)
        })
      ],
      order_proposals: [{ orderId: "order-PO-1044", status: "pending" }]
    }
  }
})

// What waits on the buyer: its draft, and the proposal its supplier sent.
export const Default = meta.story({
  ...page("buyer"),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Purchase orders" })).toBeVisible()
    await expect(canvas.getByRole("button", { name: /Create purchase order/ })).toHaveAttribute("href", "/orders/new")
    await expect(canvas.getByRole("button", { name: /Import/ })).toHaveAttribute("href", "/orders/import")
    const tabs = canvas.getByRole("navigation", { name: "Purchase order views" })
    await expect(within(tabs).getByRole("link", { name: /Needs you/ })).toHaveAttribute("aria-current", "page")
    const links = canvas.getAllByRole("link", { name: /^PO-/ })
    await expect(links.map((link) => link.textContent)).toEqual(["PO-1046", "PO-1044"])
    await expect(canvas.getByText("Changes proposed")).toBeVisible()
    await expect(canvas.getByRole("columnheader", { name: "Total" })).toBeVisible()
  }
})

// Every order, newest first, with how much of each has shipped.
export const All = meta.story({
  ...page("buyer"),
  args: { view: "all" },
  play: async ({ canvas }) => {
    const links = canvas.getAllByRole("link", { name: /^PO-/ })
    await expect(links.map((link) => link.textContent)).toEqual(["PO-1046", "PO-1045", "PO-1044", "PO-1043", "PO-1042"])
    await expect(canvas.getByRole("progressbar", { name: "PO-1045 shipped", hidden: true })).toHaveAttribute(
      "value",
      "300"
    )
    await expect(canvas.getAllByText("300 of 420 shipped")[0]).toBeInTheDocument()
    await expect(canvas.getByText("5 purchase orders")).toBeVisible()
  }
})

// The view the URL names opens first: ?view=active holds the orders on their way.
export const ActiveView = meta.story({
  ...page("buyer"),
  args: { view: "active" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "PO-1045" })).toBeVisible()
    await expect(canvas.queryByRole("link", { name: "PO-1046" })).toBeNull()
  }
})

// Selected orders export as a spreadsheet.
export const Selection = meta.story({
  ...page("buyer"),
  args: { view: "all" },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("checkbox", { name: "Select PO-1045" }))
    await userEvent.click(canvas.getByRole("checkbox", { name: "Select PO-1044" }))
    await expect(canvas.getByText("2 selected")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Clear selection" }))
    await expect(canvas.queryByText("2 selected")).toBeNull()
  }
})

export const Empty = meta.story({
  ...page("buyer"),
  args: { rows: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Your next shipment starts here")).toBeVisible()
    await expect(
      canvas.getByText("Choose products from your catalog, then send the purchase order to your supplier.")
    ).toBeVisible()
    await expect(canvas.getAllByRole("button", { name: /Create purchase order/ })).toHaveLength(2)
    await expect(canvas.queryByRole("table")).toBeNull()
  }
})

// Before Shopify is connected, the first step is connecting it.
export const ConnectShopify = meta.story({
  ...page("buyer"),
  args: { rows: [], shopify: false, supplierLinked: false },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Your next shipment starts here")).toBeVisible()
    await expect(canvas.getByText(/Connect Shopify so purchase orders can use your catalog/)).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Connect Shopify" })).toHaveAttribute(
      "href",
      "/settings#integrations"
    )
  }
})

// With Shopify connected and no supplier yet, the next step is inviting one.
export const InviteSupplier = meta.story({
  ...page("buyer"),
  args: { rows: [], supplierLinked: false },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Invite your supplier, then create your first purchase order.")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Invite a supplier" })).toHaveAttribute("href", "/partners")
  }
})

// A member who views purchase orders can't create or import them, and doesn't see their value.
export const MemberWithoutEdit = meta.story({
  ...page("buyer", member),
  args: { permissions: member },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "PO-1046" })).toBeVisible()
    await expect(canvas.queryByRole("button", { name: /Create purchase order/ })).toBeNull()
    await expect(canvas.queryByRole("button", { name: /Import/ })).toBeNull()
    await expect(canvas.queryByRole("columnheader", { name: "Total" })).toBeNull()
  }
})

// A member who can't take the next step just hears there are none yet.
export const MemberEmpty = meta.story({
  ...page("buyer", member),
  args: { permissions: member, rows: [], shopify: false },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No purchase orders yet")).toBeVisible()
    await expect(canvas.getByText("Purchase orders appear here.")).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Connect Shopify" })).toBeNull()
  }
})

// A supplier's Orders: what its customers sent, by what's next.
export const Supplier = meta.story({
  ...page("supplier"),
  args: { kind: "supplier", orders: supplierOrders, tab: "pack" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Orders" })).toBeVisible()
    await expect(canvas.getByRole("link", { name: "PO-2051" })).toHaveAttribute(
      "href",
      `/orders/${supplierOrders[0]!.id}`
    )
    // The URL's tab opens.
    await expect(canvas.queryByRole("link", { name: "PO-2048" })).toBeNull()
    await expect(canvas.getByRole("columnheader", { name: "Total" })).toBeVisible()
    await expect(canvas.getByText("$1,030")).toBeVisible()
    await expect(canvas.queryByRole("button", { name: /Create purchase order/ })).toBeNull()
  }
})

export const SupplierWithoutPrices = meta.story({
  ...page("supplier", member),
  args: { kind: "supplier", orders: supplierOrders, permissions: member },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "PO-2048" })).toBeVisible()
    await expect(canvas.queryByRole("columnheader", { name: "Total" })).toBeNull()
    await expect(canvas.queryByText("$1,030")).toBeNull()
  }
})

// A forwarder's purchase orders: those shipping through it, without drafts or values.
export const Forwarder = meta.story({
  ...page("forwarder"),
  args: { kind: "forwarder", rows: orderRows.filter((row) => row.order.status !== "draft").toReversed() },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Purchase orders" })).toBeVisible()
    await expect(canvas.getByRole("link", { name: "PO-1045" })).toBeVisible()
    // Forwarders never have drafts, and never act on a purchase order themselves.
    await expect(canvas.queryByRole("link", { name: /^Drafts/ })).toBeNull()
    await expect(canvas.queryByRole("link", { name: /^Needs you/ })).toBeNull()
    await expect(canvas.queryByRole("columnheader", { name: "Total" })).toBeNull()
    await expect(canvas.queryByRole("button", { name: /Create purchase order/ })).toBeNull()
  }
})

export const ForwarderEmpty = meta.story({
  ...page("forwarder"),
  args: { kind: "forwarder", rows: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No purchase orders yet")).toBeVisible()
    await expect(canvas.getByText("Purchase orders shipping through you appear here.")).toBeVisible()
    await expect(canvas.queryByRole("button", { name: /Create purchase order|Connect Shopify/ })).toBeNull()
  }
})
