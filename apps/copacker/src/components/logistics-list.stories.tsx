import { expect, within } from "storybook/test"
import preview from "#.storybook/preview"
import { purchaseOrderListRows, shipmentListRows } from "@/stories/fixtures/logistics-lists"
import { LogisticsList } from "./logistics-list"

const meta = preview.meta({
  title: "Components/Purchase orders/Logistics list",
  component: LogisticsList,
  args: { kind: "orders" as const, viewer: "buyer" as const, rows: purchaseOrderListRows },
  // Rows are fixtures, and the slots take elements: neither is something to edit in the Controls panel.
  argTypes: { rows: { control: false }, actions: { control: false }, notice: { control: false } }
})

// A buyer's purchase orders open on what waits on it.
export const Orders = meta.story({
  play: async ({ canvas }) => {
    const views = canvas.getByRole("navigation", { name: "Purchase order views" })
    await expect(within(views).getByRole("link", { name: /Needs you/ })).toHaveAttribute("aria-current", "page")
    await expect(within(views).getByRole("link", { name: /Needs you/ })).toHaveTextContent("4")
    await expect(within(views).getAllByRole("link")).toHaveLength(5)
    await expect(canvas.getByText("4 purchase orders")).toBeVisible()
    await expect(canvas.getByText("Changes proposed")).toBeVisible()
    await expect(canvas.getByRole("progressbar", { name: "PO-1045 shipped", hidden: true })).toHaveAttribute(
      "value",
      "0"
    )
    await expect(canvas.getByRole("link", { name: "PO-1047" })).toHaveAttribute("href", "/orders/po-1047")
  }
})

// Choosing a view filters the rows and keeps it in the URL.
export const ChooseView = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("link", { name: /^Drafts/ }))
    await expect(canvas.getByRole("link", { name: /^Drafts/ })).toHaveAttribute("aria-current", "page")
    await expect(canvas.getAllByRole("link", { name: /^PO-/ }).map((link) => link.textContent)).toEqual(["PO-1046"])
  }
})

// More rows than a page holds go to further pages.
export const Pages = meta.story({
  args: { view: "all" },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText("Showing 1–25 of 34 purchase orders")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Previous page" })).toBeDisabled()
    await userEvent.click(canvas.getByRole("button", { name: "Next page" }))
    await expect(canvas.getByText("Showing 26–34 of 34 purchase orders")).toBeVisible()
  }
})

// Search, the supplier menu and the Filters panel narrow the rows, with a removable chip for each filter.
export const SearchAndFilters = meta.story({
  args: { view: "all" },
  play: async ({ canvas, userEvent }) => {
    const body = within(canvas.getByRole("table").ownerDocument.body)
    await userEvent.type(canvas.getByRole("searchbox", { name: "Search purchase orders" }), "Cedar")
    await expect(canvas.getAllByRole("link", { name: /^PO-/ })).toHaveLength(2)
    await userEvent.clear(canvas.getByRole("searchbox", { name: "Search purchase orders" }))
    await userEvent.click(canvas.getByRole("button", { name: "Supplier" }))
    await userEvent.click(await body.findByRole("menuitemcheckbox", { name: "Northwind Textiles" }))
    await expect(canvas.getByRole("button", { name: "Remove Supplier filter" })).toHaveTextContent(
      "Supplier: Northwind Textiles"
    )
    await expect(canvas.queryByRole("link", { name: "PO-1047" })).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "Remove Supplier filter" }))
    await expect(canvas.getByRole("link", { name: "PO-1047" })).toBeVisible()
  }
})

// Nothing matches: the table says so inside its own border and offers to clear the filters.
export const NoMatches = meta.story({
  args: { view: "all" },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByRole("searchbox", { name: "Search purchase orders" }), "nothing like this")
    const table = within(canvas.getByRole("table"))
    await expect(table.getByRole("heading", { name: "No matching purchase orders" })).toBeVisible()
    await userEvent.click(table.getByRole("button", { name: "Clear filters" }))
    await expect(canvas.getAllByRole("link", { name: /^PO-/ }).length).toBeGreaterThan(0)
  }
})

// An empty view keeps the table's frame: its message is a row of the table.
export const EmptyView = meta.story({
  args: { view: "closed", rows: purchaseOrderListRows.filter((row) => row.stage !== "closed") },
  play: async ({ canvas }) => {
    const table = within(canvas.getByRole("table"))
    await expect(table.getByRole("heading", { name: "No closed purchase orders" })).toBeVisible()
    await expect(table.getByRole("cell")).toHaveAttribute("colspan", "7")
  }
})

// Selecting rows offers to export them.
export const Selection = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("checkbox", { name: "Select all visible purchase orders" }))
    await expect(canvas.getByText("4 selected")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Export selected" })).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Clear selection" }))
    await expect(canvas.queryByText("4 selected")).toBeNull()
  }
})

// Columns can be hidden, but never the reference.
export const HideColumns = meta.story({
  args: { view: "all" },
  play: async ({ canvas, userEvent }) => {
    const body = within(canvas.getByRole("table").ownerDocument.body)
    await userEvent.click(canvas.getByRole("button", { name: "Columns" }))
    await expect(body.queryByRole("menuitemcheckbox", { name: "Purchase order" })).toBeNull()
    await userEvent.click(await body.findByRole("menuitemcheckbox", { name: "Route" }))
    await expect(canvas.queryByRole("columnheader", { name: "Route" })).toBeNull()
  }
})

// A forwarder's purchase orders: no drafts, and nothing waits on it.
export const ForwarderOrders = meta.story({
  args: {
    viewer: "forwarder",
    rows: purchaseOrderListRows.filter((row) => row.stage !== "draft").map((row) => ({ ...row, total: null }))
  },
  play: async ({ canvas }) => {
    const views = canvas.getByRole("navigation", { name: "Purchase order views" })
    await expect(
      within(views)
        .getAllByRole("link")
        .map((link) => link.textContent?.replace(/\d+$/, ""))
    ).toEqual(["Active", "Closed", "All"])
    await expect(canvas.queryByRole("columnheader", { name: "Total" })).toBeNull()
    await expect(canvas.queryByRole("checkbox", { name: "Select PO-1046" })).toBeNull()
  }
})

// A buyer's shipments, with who each waits on and Amazon's own shipments opening in Seller Central.
export const Shipments = meta.story({
  args: { kind: "shipments", rows: shipmentListRows },
  play: async ({ canvas }) => {
    const views = canvas.getByRole("navigation", { name: "Shipment views" })
    await expect(within(views).getByRole("link", { name: /^All/ })).toHaveAttribute("aria-current", "page")
    await expect(within(views).getByRole("link", { name: /Needs you/ })).toHaveTextContent("3")
    await expect(canvas.getByRole("link", { name: "PO-1045, shipment 2" })).toHaveAttribute("href", "/shipments/1045-2")
    await expect(canvas.getByRole("columnheader", { name: "Waiting on" })).toBeVisible()
    await expect(canvas.getAllByText("You").length).toBeGreaterThan(0)
    await expect(canvas.getByRole("button", { name: "Export" })).toBeEnabled()
  }
})

// Shipments made in Seller Central have no ready date, so they come last, and open in Seller Central.
export const SellerCentralShipment = meta.story({
  args: { kind: "shipments", rows: shipmentListRows },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByRole("searchbox", { name: "Search shipments" }), "FBA17V2P1R")
    const link = canvas.getByRole("link", { name: /FBA17V2P1R/ })
    await expect(link).toHaveAttribute("target", "_blank")
    await expect(link).toHaveTextContent("(opens in Seller Central)")
    await expect(canvas.queryByRole("button", { name: /^Actions for FBA17V2P1R/ })).toBeNull()
  }
})

// The Filters panel adds a ready-date range for shipments.
export const ShipmentFilters = meta.story({
  args: { kind: "shipments", rows: shipmentListRows },
  play: async ({ canvas, userEvent }) => {
    const body = within(canvas.getByRole("table").ownerDocument.body)
    await userEvent.click(canvas.getByRole("button", { name: "Filters" }))
    const panel = await body.findByRole("dialog", { name: "List filters" })
    await userEvent.type(within(panel).getByLabelText("From"), "2026-10-01")
    await userEvent.click(within(panel).getByRole("button", { name: "Done" }))
    await expect(canvas.getByRole("button", { name: "Remove Ready date filter" })).toBeVisible()
    await expect(canvas.queryByRole("link", { name: "PO-1042, shipment 1" })).toBeNull()
    await expect(canvas.getByRole("link", { name: "PO-1045, shipment 2" })).toBeVisible()
  }
})

// A supplier's shipments name each customer, and what waits on the supplier reads as You.
export const SupplierShipments = meta.story({
  args: {
    kind: "shipments",
    viewer: "supplier",
    rows: shipmentListRows.filter((row) => row.source === "order").map((row) => ({ ...row, partner: "Harbor Goods" }))
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("columnheader", { name: "Customer" })).toBeVisible()
    await expect(canvas.getAllByText("Customer").length).toBeGreaterThan(1)
    await expect(canvas.queryByRole("link", { name: /FBA17V2P1R/ })).toBeNull()
  }
})
