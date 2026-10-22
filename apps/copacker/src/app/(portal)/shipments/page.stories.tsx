import { type OrderInput } from "@repo/copacker-orders"
import { expect, within } from "storybook/test"
import preview from "#.storybook/preview"
import { can, type Permissions } from "@/lib/access"
import type { ShipmentsSearch } from "@/lib/page-search"
import type { AmazonShipment } from "@/server/amazon-shipments"
import { shipmentListRows } from "@/server/logistics-rows"
import {
  buyerContacts,
  orderRecords,
  sellerCentralShipments,
  shipmentList,
  type ShipmentRow
} from "@/stories/fixtures/logistics"
import { portalPage, serverStory } from "@/stories/server"
import { member, owner, workspaces } from "@/stories/workspace"
import PageView from "./page"

type OrderRow = { order: { id: string; data: OrderInput; buyerOrgId: string }; supplier: { name: string } }

type Args = {
  kind: "buyer" | "supplier"
  permissions: Permissions
  // The ?view= tab.
  view?: ShipmentsSearch["view"]
  // The purchase orders the person can see, and their shipments, newest first.
  rows: OrderRow[]
  list: ShipmentRow[]
  // A supplier's customers.
  customers: { id: string; name: string }[]
  // The shipments in the buyer's Amazon account; null without one connected.
  amazonShipments: AmazonShipment[] | null
  // Whether reading them from Amazon failed.
  amazonFails?: boolean
}

// The Shipments page (page.tsx) with what the database and Amazon would return, through the server's own rows.
async function ShipmentsPage({ kind, permissions, view, rows, list, customers, amazonShipments, amazonFails }: Args) {
  const isBuyer = kind === "buyer"
  return (
    <PageView
      page={{
        viewer: kind,
        seesOrders: can(permissions, "orders"),
        amazonFailed: isBuyer && Boolean(amazonFails),
        rows: await shipmentListRows({
          isBuyer,
          rows,
          list,
          customers,
          amazon: isBuyer && !amazonFails ? (amazonShipments ?? []) : []
        })
      }}
      search={{ view }}
    />
  )
}

const rows: OrderRow[] = [
  { order: orderRecords.warehouse, supplier: { name: "Lotus Manufacturing" } },
  { order: orderRecords.amazon, supplier: { name: "Lotus Manufacturing" } }
]

// The page inside the portal, as each kind of workspace sees it.
const buyer = portalPage("/shipments")
const supplier = portalPage("/shipments", "supplier")
// Delivery addresses are named from the buyer's saved addresses.
const db = { contacts: buyerContacts.map(({ id, name }) => ({ id, name })) }

const meta = preview.meta({
  title: "Pages/Shipments/List",
  ...serverStory(ShipmentsPage),
  args: {
    kind: "buyer",
    permissions: owner,
    rows,
    list: shipmentList,
    customers: [],
    amazonShipments: sellerCentralShipments
  } satisfies Args,
  parameters: { db }
})

// Every shipment, then the buyer's other Amazon shipments, which open in Seller Central.
export const Buyer = meta.story({
  ...buyer,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Shipments" })).toBeVisible()
    const tabs = canvas.getByRole("navigation", { name: "Shipment views" })
    await expect(within(tabs).getByRole("link", { name: /All/ })).toHaveAttribute("aria-current", "page")
    // The linked AWD shipment shows once, under its purchase order.
    await expect(within(tabs).getByRole("link", { name: /All/ })).toHaveTextContent("7")
    await expect(within(tabs).getByRole("link", { name: /Active/ })).toHaveTextContent("4")
    // Labels to buy and packing to approve wait on the buyer.
    await expect(within(tabs).getByRole("link", { name: /Needs you/ })).toHaveTextContent("2")
    await expect(within(tabs).getByRole("link", { name: /Received/ })).toHaveAttribute(
      "href",
      "/shipments?view=received"
    )
    await expect(canvas.getByRole("link", { name: "PO-1045, shipment 2" })).toHaveAttribute(
      "href",
      "/shipments/c0ffee00-1234-4abc-9def-000000000011"
    )
    await expect(canvas.getByText("STAR-8KQ2M7-1")).toBeInTheDocument()
    await expect(canvas.getAllByText("Portland warehouse")[0]).toBeInTheDocument()
    await expect(canvas.getAllByText("Amazon AWD US")[0]).toBeInTheDocument()
    await expect(canvas.getByText("Needs shipping labels")).toBeVisible()
    await expect(canvas.getByText("Approval needed")).toBeVisible()
    const external = canvas.getByRole("link", { name: /FBA18ZZTOP01/ })
    await expect(external).toHaveAttribute("href", sellerCentralShipments[1]!.url)
    await expect(external).toHaveAttribute("target", "_blank")
    await expect(canvas.getByText("Spring restock")).toBeVisible()
    await expect(canvas.queryByRole("link", { name: /^STAR-8KQ2M7-1/ })).toBeNull()
    await expect(canvas.getByRole("columnheader", { name: "Waiting on" })).toBeVisible()
  }
})

// What waits on the buyer, from the URL's view.
export const NeedsYou = meta.story({
  ...buyer,
  args: { view: "needsYou" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: /Needs you/ })).toHaveAttribute("aria-current", "page")
    await expect(canvas.getByText("Needs shipping labels")).toBeVisible()
    await expect(canvas.getByText("Approval needed")).toBeVisible()
    await expect(canvas.queryByRole("link", { name: /FBA18ZZTOP01/ })).toBeNull()
  }
})

// Amazon calls a received shipment closed.
export const Received = meta.story({
  ...buyer,
  args: { view: "received" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: /Received/ })).toHaveAttribute("aria-current", "page")
    await expect(canvas.getByRole("link", { name: /^PO-1046/ })).toBeVisible()
    await expect(canvas.getByRole("link", { name: /FBA17OLD0001/ })).toBeVisible()
    await expect(canvas.queryByRole("link", { name: /^PO-1045/ })).toBeNull()
  }
})

// A view with nothing in it says so inside the table, keeping its border.
export const EmptyView = meta.story({
  ...buyer,
  args: {
    view: "received",
    list: shipmentList.filter((shipment) => shipment.status !== "received"),
    amazonShipments: null
  },
  play: async ({ canvas }) => {
    await expect(within(canvas.getByRole("table")).getByText("No received shipments")).toBeVisible()
  }
})

// Search narrows every view, and clearing it brings the rows back.
export const Search = meta.story({
  ...buyer,
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByRole("searchbox", { name: "Search shipments" }), "FBA18")
    await expect(canvas.getByRole("link", { name: /FBA18ZZTOP01/ })).toBeVisible()
    await expect(canvas.queryByRole("link", { name: /^PO-1045/ })).toBeNull()
    await userEvent.click(canvas.getAllByRole("button", { name: "Clear filters" })[0]!)
    await expect(canvas.getAllByRole("link", { name: /^PO-1045/ }).length).toBeGreaterThan(0)
  }
})

// Amazon didn't answer: the purchase order shipments still show.
export const AmazonFailed = meta.story({
  ...buyer,
  args: { amazonFails: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent("Amazon shipments didn’t load")
    await expect(canvas.getAllByRole("link", { name: /^PO-1045/ }).length).toBeGreaterThan(1)
    await expect(canvas.queryByRole("link", { name: /FBA18ZZTOP01/ })).toBeNull()
  }
})

// With only Amazon's own shipments, the list still shows them.
export const OnlyAmazonShipments = meta.story({
  ...buyer,
  args: { list: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: /FBA18ZZTOP01/ })).toBeVisible()
    await expect(canvas.getByRole("link", { name: /STAR-8KQ2M7-1/ })).toBeVisible()
  }
})

export const Empty = meta.story({
  ...buyer,
  args: { list: [], amazonShipments: null },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No shipments yet")).toBeVisible()
    await expect(canvas.getByText("Start one from a sent purchase order.")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "View purchase orders" })).toHaveAttribute("href", "/orders")
  }
})

// A member who can't open purchase orders isn't sent there.
export const EmptyWithoutOrders = meta.story({
  ...buyer,
  parameters: { ...buyer.parameters, permissions: { role: "member", access: { shipments: "view" } } },
  args: { list: [], amazonShipments: null, permissions: { role: "member", access: { shipments: "view" } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No shipments yet")).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "View purchase orders" })).toBeNull()
  }
})

// A supplier sees each shipment's customer, what waits on it, and no Amazon account.
export const Supplier = meta.story({
  ...supplier,
  parameters: { ...supplier.parameters, permissions: member },
  args: {
    kind: "supplier",
    permissions: member,
    customers: [{ id: workspaces.buyer.id, name: workspaces.buyer.name }]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("columnheader", { name: "Customer" })).toBeInTheDocument()
    await expect(canvas.getAllByText("Harbor Goods").length).toBeGreaterThan(0)
    // Packing waits on the supplier itself, approval on its customer.
    await expect(canvas.getAllByText("You").length).toBeGreaterThan(0)
    await expect(canvas.queryByRole("link", { name: /FBA18ZZTOP01/ })).toBeNull()
  }
})

export const SupplierEmpty = meta.story({
  ...supplier,
  args: { kind: "supplier", list: [], customers: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Start one from an order.")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "View orders" })).toHaveAttribute("href", "/orders")
  }
})
