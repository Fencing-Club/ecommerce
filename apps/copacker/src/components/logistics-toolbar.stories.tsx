import { useReducer, useState } from "react"
import { expect, fn, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { type ListColumn, listReducer, startList } from "@/lib/logistics-list"
import { purchaseOrderListRows, shipmentListRows } from "@/stories/fixtures/logistics-lists"
import { shownDialog } from "@/stories/play"
import { LogisticsToolbar } from "./logistics-toolbar"

type Props = Omit<React.ComponentProps<typeof LogisticsToolbar>, "state" | "hidden" | "onHiddenChange">

// The toolbar in the list's container, keeping the list's state as the list does, and the columns it hides.
function InList(props: Props) {
  const [state, dispatch] = useReducer(listReducer, startList)
  const [hidden, setHidden] = useState<ListColumn[]>([])
  return (
    <div className="@container/list flex flex-col gap-3">
      <LogisticsToolbar
        {...props}
        state={state}
        hidden={hidden}
        dispatch={(action) => {
          dispatch(action)
          props.dispatch(action)
        }}
        onHiddenChange={setHidden}
      />
      <output>Hidden: {hidden.join(", ")}</output>
    </div>
  )
}

const meta = preview.meta({
  title: "Components/Purchase orders/Logistics toolbar",
  component: InList,
  args: { kind: "orders" as const, viewer: "buyer" as const, rows: purchaseOrderListRows, dispatch: fn() },
  argTypes: { rows: { control: false } }
})

// Search and the supplier menu, which offers the suppliers the rows have.
export const Orders = meta.story({
  play: async ({ canvas, args }) => {
    await userEvent.type(canvas.getByRole("searchbox", { name: "Search purchase orders" }), "C")
    await expect(args.dispatch).toHaveBeenLastCalledWith({ type: "search", query: "C" })
    await userEvent.click(canvas.getByRole("button", { name: "Supplier" }))
    await userEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Cedar Works" }))
    await expect(args.dispatch).toHaveBeenLastCalledWith({ type: "filter", key: "partner", value: "Cedar Works" })
    await expect(canvas.getByRole("button", { name: "Supplier" })).toBeVisible()
  }
})

// Shipments add a ready-date range to the Filters panel, and the button counts what's applied.
export const ShipmentFilters = meta.story({
  args: { kind: "shipments", rows: shipmentListRows },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Filters" }))
    const panel = await shownDialog("List filters")
    await expect(panel.getByText("Source")).toBeVisible()
    await userEvent.type(panel.getByLabelText("From"), "2026-10-01")
    await expect(args.dispatch).toHaveBeenLastCalledWith({ type: "ready", from: "2026-10-01" })
    await userEvent.click(panel.getByRole("button", { name: "Done" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await expect(canvas.getByRole("button", { name: /^Filters/ })).toHaveTextContent("1")
  }
})

// Sorting by supplier names it on the button.
export const Sort = meta.story({
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Sort by Newest" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Supplier" }))
    await expect(args.dispatch).toHaveBeenLastCalledWith({ type: "sort", sort: "partner" })
    await expect(canvas.getByRole("button", { name: "Sort by Supplier" })).toBeVisible()
  }
})

// Columns can be hidden, but never the reference.
export const HideColumns = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Columns" }))
    await expect(screen.queryByRole("menuitemcheckbox", { name: "Purchase order" })).toBeNull()
    await userEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Route" }))
    await expect(canvas.getByRole("status")).toHaveTextContent("Hidden: route")
  }
})
