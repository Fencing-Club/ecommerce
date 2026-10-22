import { useState } from "react"
import { expect, fn, userEvent, within } from "storybook/test"
import preview from "#.storybook/preview"
import { Table, TableBody } from "@/components/ui/table"
import type { LineEdit } from "@/lib/restock-selection"
import { restockLines } from "@/stories/fixtures/catalog"
import { RestockLineRows } from "./restock-line"

const [tote, black, apron, , napkins, twine, , soap] = restockLines

// One line in a wide table, with its edits kept as the supplier group keeps them.
function Line({ line, onEdit, ...props }: React.ComponentProps<typeof RestockLineRows>) {
  const [edit, setEdit] = useState<LineEdit | undefined>(props.edit)
  const [expanded, setExpanded] = useState(props.expanded)
  return (
    <div className="@container">
      <Table framed={false} className="@max-md:block">
        <TableBody className="@max-md:block">
          <RestockLineRows
            line={line}
            edit={edit}
            onEdit={(next) => {
              setEdit(next)
              onEdit(next)
            }}
            expanded={expanded}
            onToggle={() => setExpanded(!expanded)}
          />
        </TableBody>
      </Table>
    </div>
  )
}

// One suggestion: whether to order it and how many, its figures, and how its quantity was worked out.
const meta = preview.meta({
  title: "Components/Inventory/Restock line",
  component: RestockLineRows,
  args: { line: tote!, edit: undefined, onEdit: fn(), expanded: false, onToggle: fn() },
  render: (args) => <Line {...args} />
})

const shown = (elements: HTMLElement[]) => elements.filter((element) => element.checkVisibility())

// Out of stock, so it's ticked at its suggested quantity of whole cases.
export const Suggested = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("checkbox", { name: "Order Canvas tote bag, Natural" })).toBeChecked()
    await expect(canvas.getByRole("spinbutton", { name: "Units of Canvas tote bag, Natural to order" })).toHaveValue(96)
    await expect(canvas.queryByText(/Suggested/)).toBeNull()
  }
})

// A typed quantity says what was suggested, and one that isn't a whole number is marked.
export const EditUnits = meta.story({
  play: async ({ args, canvas }) => {
    const units = canvas.getByRole("spinbutton", { name: "Units of Canvas tote bag, Natural to order" })
    await userEvent.clear(units)
    await expect(units).toHaveAttribute("aria-invalid", "true")
    await userEvent.type(units, "120")
    await expect(units).toHaveAttribute("aria-invalid", "false")
    await expect(canvas.getByText("Suggested 96")).toBeVisible()
    await expect(args.onEdit).toHaveBeenLastCalledWith({ selected: true, units: "120" })
    await userEvent.click(canvas.getByRole("checkbox", { name: "Order Canvas tote bag, Natural" }))
    await expect(args.onEdit).toHaveBeenLastCalledWith({ selected: false, units: "120" })
  }
})

// Opened, the calculation: the sales rate, then the sum to the quantity, and the sales lost before it arrives.
export const Calculation = meta.story({
  args: { expanded: true },
  play: async ({ canvas }) => {
    for (const text of [
      "Sold in 60 days",
      "6 days",
      "2.2 a day",
      "Needed for the 45-day lead time",
      "To order (4 cases of 24)",
      "Until today’s order arrives",
      "$486.00 (27 units)"
    ]) {
      await expect(shown(canvas.getAllByText(text))).toHaveLength(1)
    }
    await userEvent.click(canvas.getByRole("button", { name: "Calculation for Canvas tote bag, Natural" }))
    await expect(canvas.queryByText("Sold in 60 days")).toBeNull()
  }
})

// Rounded up to the minimum order, after the minimum kept at Amazon; without a price, lost sales are units.
export const MinimumOrder = meta.story({
  args: { line: apron!, expanded: true },
  play: async ({ canvas }) => {
    await expect(shown(canvas.getAllByText("Minimum stock at Amazon"))).toHaveLength(1)
    await expect(shown(canvas.getAllByText("To order (minimum order)"))).toHaveLength(1)
    await expect(shown(canvas.getAllByText("24 units"))).not.toHaveLength(0)
  }
})

// A line that can't be calculated says why, and can't be ordered.
export const Blocked = meta.story({
  args: { line: napkins!, expanded: true },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("checkbox")).toBeNull()
    await expect(canvas.queryByRole("spinbutton")).toBeNull()
    await expect(
      shown(canvas.getAllByText("Can’t calculate: stock count unknown, incoming stock unknown"))
    ).toHaveLength(1)
  }
})

export const NotStocked = meta.story({
  args: { line: soap!, expanded: true },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("checkbox")).toBeNull()
    await expect(shown(canvas.getAllByText("Minimum stock at Amazon is 0 in Shopify"))).toHaveLength(1)
  }
})

// A multipack names its pieces under the product.
export const Multipack = meta.story({
  args: { line: twine! },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("TWINE-50, pack of 2")).toBeVisible()
  }
})

// Reorder soon, with days of stock left.
export const ReorderSoon = meta.story({
  args: { line: black! },
  play: async ({ canvas }) => {
    await expect(within(canvas.getByRole("row")).getAllByText(/Reorder soon/).length).toBeGreaterThan(0)
  }
})

// A member who doesn't see prices gets no costs or lost sales.
export const WithoutPrices = meta.story({
  args: { expanded: true },
  parameters: { permissions: { role: "member", access: { restock: "view", orders: "view" } } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText("$486.00 (27 units)")).toBeNull()
    await expect(shown(canvas.getAllByText("27 units"))).toHaveLength(1)
  }
})
