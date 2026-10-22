import type { ComponentProps } from "react"
import { useWatch } from "react-hook-form"
import { expect, fn, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import type { OrderForm } from "@/lib/order-form"
import { order, orderId } from "@/stories/fixtures/purchase-orders"
import { OrderFormStory } from "@/stories/order-form"
import { shownDialog } from "@/stories/play"
import { OrderLineRow } from "./order-line-row"

type Args = Omit<ComponentProps<typeof OrderLineRow>, "item">

// The row in the editor's table, showing its line as the form holds it, as the editor does.
function Row(args: Args) {
  const item = useWatch<OrderForm, `items.${number}`>({ name: `items.${args.index}` })
  return (
    <table className="w-full min-w-3xl text-sm">
      <tbody>
        <OrderLineRow {...args} item={item} />
      </tbody>
    </table>
  )
}

const meta = preview.meta({
  title: "Components/Purchase orders/Order line row",
  component: OrderLineRow,
  args: {
    index: 0,
    item: order.items[0]!,
    currency: "USD",
    toAmazon: true,
    needsLabel: false,
    onPiecesChange: fn(),
    onPriceChange: fn(),
    onRemove: fn()
  },
  render: ({ item: _, ...args }) => (
    <OrderFormStory>
      <Row {...args} />
    </OrderFormStory>
  )
})

// The supplier's quote under the line: what it can still sell, its ordering rules and why a price isn't its quote.
export const Quoted = meta.story({
  args: {
    quote: {
      status: "currency_review",
      unitPriceMinor: null,
      available: 200,
      tiers: [],
      rules: { increment: 50, minimum: 1, maximum: null }
    }
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Canvas tote bag")).toBeVisible()
    await expect(canvas.getByText("Natural")).toBeVisible()
    await expect(canvas.getByText("200 available")).toHaveClass("text-destructive")
    await expect(canvas.getByText("Order in multiples of 50")).toBeVisible()
    await expect(canvas.getByText("Quote is in another currency")).toBeVisible()
    await expect(canvas.getByRole("cell", { name: "$1,020" })).toBeVisible()
  }
})

// Its quantity and cost are edited in place, and its total follows.
export const Edit = meta.story({
  play: async ({ args, canvas }) => {
    const quantity = canvas.getByRole("spinbutton", { name: "Quantity of Canvas tote bag" })
    await userEvent.clear(quantity)
    await userEvent.type(quantity, "100")
    await expect(args.onPiecesChange).toHaveBeenCalled()
    const cost = canvas.getByRole("textbox", { name: "Cost of Canvas tote bag" })
    await expect(cost).toHaveValue("4.25")
    await userEvent.clear(cost)
    await userEvent.type(cost, "5")
    await expect(args.onPriceChange).toHaveBeenCalled()
    await expect(canvas.getByRole("cell", { name: "$500" })).toBeVisible()
    await userEvent.type(canvas.getByRole("textbox", { name: "Supplier SKU for Canvas tote bag" }), "-B")
    await expect(canvas.getByRole("textbox", { name: "Supplier SKU for Canvas tote bag" })).toHaveValue(
      `${order.items[0]!.supplierSku}-B`
    )
    await userEvent.click(canvas.getByRole("button", { name: "Remove Canvas tote bag" }))
    await expect(args.onRemove).toHaveBeenCalled()
  }
})

// On a PO to Amazon, a checkbox chooses the line to move to another network.
export const Selectable = meta.story({
  args: { select: { selected: true, onSelectedChange: fn() } },
  play: async ({ args, canvas }) => {
    const checkbox = canvas.getByRole("checkbox", { name: "Select Canvas tote bag / Natural" })
    await expect(checkbox).toBeChecked()
    await expect(checkbox.closest("tr")).toHaveClass("bg-accent/50")
    await userEvent.click(checkbox)
    await expect(args.select?.onSelectedChange).toHaveBeenCalledWith(false, expect.anything())
  }
})

// A saved draft's line downloads its labels, and its packing details start from the product's.
export const Menu = meta.story({
  args: { orderId, needsLabel: true, error: "Units must be divisible by units per pack" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Needs an uploaded label")).toBeVisible()
    await expect(canvas.getByText("Units must be divisible by units per pack")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "More for Canvas tote bag" }))
    const label = await screen.findByRole("menuitem", { name: "Download label" })
    // The menu shows from the frame after it opens.
    await waitFor(() => expect(label).toBeVisible())
    await expect(label).toHaveAttribute("href", `/api/orders/${orderId}/labels/${order.items[0]!.id}`)
    await expect(screen.getByRole("menuitem", { name: "Download hazard label" })).toHaveAttribute(
      "href",
      `/api/orders/${orderId}/labels/warning`
    )
    await userEvent.click(screen.getByRole("menuitem", { name: "Edit packing details" }))
    const dialog = await shownDialog("Packing details")
    await expect(dialog.getByRole("checkbox", { name: "FNSKU label" })).toBeChecked()
    await expect(dialog.getByRole("checkbox", { name: "Suffocation warning label" })).toBeChecked()
    await userEvent.click(dialog.getByRole("button", { name: "Done" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  }
})
