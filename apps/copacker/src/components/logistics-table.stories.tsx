import { useState } from "react"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { listColumns } from "@/lib/logistics-list"
import { purchaseOrderListRows, shipmentListRows } from "@/stories/fixtures/logistics-lists"
import { LogisticsTable } from "./logistics-table"

const orders = purchaseOrderListRows.slice(0, 4)

// The table in the list's container, with its selection kept in state as the list keeps it.
function InList(props: React.ComponentProps<typeof LogisticsTable>) {
  const [selected, setSelected] = useState(props.selected)
  return (
    <div className="@container/list">
      <LogisticsTable
        {...props}
        selected={selected}
        onSelectedChange={(next) => {
          setSelected(next)
          props.onSelectedChange(next)
        }}
      />
    </div>
  )
}

const meta = preview.meta({
  title: "Components/Purchase orders/Logistics table",
  component: InList,
  args: {
    kind: "orders" as const,
    viewer: "buyer" as const,
    rows: orders,
    columns: [...listColumns("orders", orders)],
    view: "all" as const,
    isFiltered: false,
    selected: [],
    onSelectedChange: fn(),
    onClear: fn()
  },
  argTypes: { rows: { control: false } }
})

// Purchase orders: each links to its page, shows its shipped pieces, and can be selected, all of a page at once.
export const Orders = meta.story({
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole("link", { name: "PO-1047" })).toHaveAttribute("href", "/orders/po-1047")
    await expect(canvas.getByRole("columnheader", { name: "Total" })).toBeVisible()
    await userEvent.click(canvas.getByRole("checkbox", { name: "Select all visible purchase orders" }))
    await expect(args.onSelectedChange).toHaveBeenLastCalledWith(orders.map((row) => row.id))
    await userEvent.click(canvas.getByRole("checkbox", { name: "Select PO-1047" }))
    await expect(canvas.getByRole("checkbox", { name: "Select all visible purchase orders" })).toHaveAttribute(
      "aria-checked",
      "mixed"
    )
  }
})

// Shipments: who each waits on, and a menu to open it or its purchase order. Seller Central's own open there.
export const Shipments = meta.story({
  args: {
    kind: "shipments",
    rows: shipmentListRows,
    columns: [...listColumns("shipments", shipmentListRows)]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("columnheader", { name: "Waiting on" })).toBeVisible()
    await expect(canvas.queryByRole("checkbox")).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "Actions for PO-1045, shipment 2" }))
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "View shipment" })).toBeVisible())
    await expect(screen.getByRole("menuitem", { name: "View purchase order" })).toBeVisible()
  }
})

// A view with no rows says so inside the table's frame.
export const EmptyView = meta.story({
  args: { rows: [], view: "closed" },
  play: async ({ canvas }) => {
    const table = within(canvas.getByRole("table"))
    await expect(table.getByRole("heading", { name: "No closed purchase orders" })).toBeVisible()
    await expect(table.queryByRole("button", { name: "Clear filters" })).toBeNull()
  }
})

// Nothing matches the filters: the table offers to clear them.
export const NoMatches = meta.story({
  args: { rows: [], isFiltered: true },
  play: async ({ canvas, args }) => {
    const table = within(canvas.getByRole("table"))
    await expect(table.getByRole("heading", { name: "No matching purchase orders" })).toBeVisible()
    await userEvent.click(table.getByRole("button", { name: "Clear filters" }))
    await expect(args.onClear).toHaveBeenCalledOnce()
  }
})

// Below 640px each row keeps its reference and status, with the rest beneath them, and below 480px it's a card.
export const Mobile = meta.story({
  args: {
    kind: "shipments",
    rows: shipmentListRows,
    columns: [...listColumns("shipments", shipmentListRows)]
  },
  globals: { viewport: { value: "iphone12", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "PO-1045, shipment 2" })).toBeVisible()
    await expect(canvas.queryByRole("columnheader", { name: "Route" })).toBeNull()
    await expect(canvas.getAllByText("9 cartons").some((element) => element.checkVisibility())).toBe(true)
  }
})
