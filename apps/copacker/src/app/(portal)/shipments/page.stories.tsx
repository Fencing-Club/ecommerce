import { type OrderInput } from "@repo/aisle"
import { expect, within } from "storybook/test"
import preview from "#.storybook/preview"
import { can, type Permissions } from "@/lib/access"
import type { AmazonShipment } from "@/server/amazon-shipments"
import {
  buyerContacts,
  orderRecords,
  sellerCentralShipments,
  shipmentList,
  type ShipmentRow
} from "@/stories/fixtures/logistics"
import { portalPage, serverStory } from "@/stories/server"
import { member, owner, workspaces } from "@/stories/workspace"
import { shipmentDestinations } from "./destination"
import PageView from "./page"

type OrderRow = { order: { id: string; data: OrderInput; buyerOrgId: string }; supplier: { name: string } }

type Args = {
  kind: "buyer" | "supplier"
  permissions: Permissions
  // The ?view= tab.
  view?: string
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

const views = [
  { view: undefined, key: "active" },
  { view: "received", key: "received" },
  { view: "cancelled", key: "cancelled" },
  { view: "all", key: "all" }
] as const
function stage(status: string) {
  if (["received", "CLOSED"].includes(status)) {
    return "received"
  }
  return ["cancelled", "CANCELLED"].includes(status) ? "cancelled" : undefined
}

// The Shipments page (page.tsx) with what the database and Amazon would return.
async function ShipmentsPage({ kind, permissions, view, rows, list, customers, amazonShipments, amazonFails }: Args) {
  const current = views.find((tab) => tab.view === view) ?? views[0]
  const inView = (status: string) => current.view === "all" || stage(status) === current.view
  const isBuyer = kind === "buyer"
  const supplierView = kind === "supplier"
  const destination = await shipmentDestinations(rows.map((row) => row.order.data))
  const shown = list.flatMap((shipment) => {
    const row = rows.find((candidate) => candidate.order.id === shipment.orderId)
    if (!row) {
      return []
    }
    const number =
      list
        .filter((other) => other.orderId === shipment.orderId)
        .toReversed()
        .indexOf(shipment) + 1
    const partner = isBuyer
      ? row.supplier.name
      : (customers.find((customer) => customer.id === row.order.buyerOrgId)?.name ?? "—")
    return inView(shipment.status) ? [{ shipment, order: row.order, partner, number }] : []
  })
  const count = (...states: string[]) => list.filter((shipment) => states.includes(shipment.status)).length
  let amazon: AmazonShipment[] = []
  let amazonAll: AmazonShipment[] = []
  let amazonFailed = false
  if (isBuyer) {
    if (amazonFails) {
      amazonFailed = true
    } else {
      const linked = new Set(list.flatMap((shipment) => shipment.amazonShipmentId?.split(", ") ?? []))
      amazonAll = (amazonShipments ?? []).filter((row) => !linked.has(row.shipmentId))
      amazon = amazonAll.filter((row) => inView(row.status))
    }
  }
  const statuses = [...list.map((shipment) => shipment.status), ...amazonAll.map((row) => row.status)]
  const tabCount = (tab: (typeof views)[number]["view"]) =>
    statuses.filter((status) => tab === "all" || stage(status) === tab).length

  return (
    <PageView
      page={{
        isBuyer,
        supplierView,
        seesOrders: can(permissions, "orders"),
        listCount: list.length,
        amazonAllCount: amazonAll.length,
        amazon,
        amazonFailed,
        current: current.key,
        stats: { packing: count("packing"), actionNeeded: count("approval", "waiting_labels"), ready: count("ready") },
        tabs: views.map((tab) => ({ ...tab, count: tabCount(tab.view) })),
        shown: shown.map(({ shipment, order, partner, number }) => ({
          shipment: { id: shipment.id, status: shipment.status, amazonShipmentId: shipment.amazonShipmentId },
          reference: order.data.reference,
          partner,
          number,
          cartons: shipment.packingDraft?.cartons?.length ?? shipment.packing?.cartons.length ?? 0,
          ready: shipment.packingDraft?.readyDate || shipment.packing?.readyDate,
          destination: destination(order.data, shipment.amazonNetwork)
        }))
      }}
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
  title: "Pages/Shared/Shipments/List",
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

// Active shipments, then the buyer's other Amazon shipments, which open in Seller Central.
export const Buyer = meta.story({
  ...buyer,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Shipments" })).toBeVisible()
    await expect(canvas.getByText("Action needed")).toBeVisible()
    const tabs = canvas.getByRole("navigation", { name: "Shipment status" })
    await expect(within(tabs).getByRole("link", { name: /Active/ })).toHaveAttribute("aria-current", "page")
    // The linked AWD shipment shows once, under its purchase order.
    await expect(within(tabs).getByRole("link", { name: /Active/ })).toHaveTextContent("4")
    await expect(within(tabs).getByRole("link", { name: /All/ })).toHaveTextContent("7")
    await expect(within(tabs).getByRole("link", { name: /Received/ })).toHaveAttribute(
      "href",
      "/shipments?view=received"
    )
    const [firstRow] = canvas.getAllByRole("link", { name: "PO-1045" })
    await expect(firstRow).toHaveAttribute("href", "/shipments/c0ffee00-1234-4abc-9def-000000000011")
    await expect(canvas.getByText("Shipment 2")).toBeInTheDocument()
    await expect(canvas.getByText("Shipment 3, STAR-8KQ2M7-1")).toBeInTheDocument()
    await expect(canvas.getAllByText("Portland warehouse")[0]).toBeInTheDocument()
    await expect(canvas.getByText("Amazon AWD US")).toBeInTheDocument()
    await expect(canvas.getByText("Amazon FBA")).toBeInTheDocument()
    await expect(canvas.getByText("Needs shipping labels")).toBeVisible()
    await expect(canvas.getByText("Approval needed")).toBeVisible()
    const external = canvas.getByRole("link", { name: /FBA18ZZTOP01/ })
    await expect(external).toHaveAttribute("href", sellerCentralShipments[1]!.url)
    await expect(external).toHaveAttribute("target", "_blank")
    await expect(canvas.getByText("Spring restock")).toBeVisible()
    await expect(canvas.queryByText("STAR-8KQ2M7-1", { selector: "a" })).toBeNull()
    await expect(canvas.queryByText("FBA17OLD0001")).toBeNull()
  }
})

// Amazon calls a received shipment closed.
export const Received = meta.story({
  ...buyer,
  args: { view: "received" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: /Received/ })).toHaveAttribute("aria-current", "page")
    await expect(canvas.getByRole("link", { name: "PO-1046" })).toBeVisible()
    await expect(canvas.getByRole("link", { name: /FBA17OLD0001/ })).toBeVisible()
    await expect(canvas.getAllByText("Received")).not.toHaveLength(0)
    await expect(canvas.queryByRole("link", { name: "PO-1045" })).toBeNull()
  }
})

export const Cancelled = meta.story({
  ...buyer,
  args: { view: "cancelled", amazonShipments: null },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "PO-1046" })).toHaveAttribute(
      "href",
      "/shipments/c0ffee00-1234-4abc-9def-000000000014"
    )
    await expect(canvas.getAllByText("Canceled").length).toBeGreaterThan(1)
  }
})

export const EmptyTab = meta.story({
  ...buyer,
  args: { view: "cancelled", list: shipmentList.filter((shipment) => shipment.status !== "cancelled") },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No canceled shipments")).toBeVisible()
  }
})

// Amazon didn't answer: the purchase order shipments still show.
export const AmazonFailed = meta.story({
  ...buyer,
  args: { amazonFails: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent("Amazon shipments didn’t load")
    await expect(canvas.getAllByRole("link", { name: "PO-1045" })).toHaveLength(2)
    await expect(canvas.queryByRole("link", { name: /FBA18ZZTOP01/ })).toBeNull()
  }
})

// With only Amazon's own shipments, the list shows them without counts.
export const OnlyAmazonShipments = meta.story({
  ...buyer,
  args: { list: [] },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText("Action needed")).toBeNull()
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

// A supplier sees each shipment's customer, and no Amazon account.
export const Supplier = meta.story({
  ...supplier,
  parameters: { ...supplier.parameters, permissions: member },
  args: {
    kind: "supplier",
    permissions: member,
    customers: [{ id: workspaces.buyer.id, name: workspaces.buyer.name }]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Waiting on buyer")).toBeVisible()
    await expect(canvas.getByRole("columnheader", { name: "Customer" })).toBeInTheDocument()
    await expect(canvas.getAllByText("Harbor Goods").length).toBeGreaterThan(0)
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
