import { useMap } from "@mantine/hooks"
import { useState } from "react"
import { expect, fn, userEvent, within } from "storybook/test"
import preview from "#.storybook/preview"
import type { LineEdit } from "@/lib/restock-selection"
import { restockLines } from "@/stories/fixtures/catalog"
import { supplierId } from "@/stories/fixtures/orders"
import { RestockSupplierGroup } from "./restock-supplier-group"

const lotusLines = restockLines.filter((line) => line.supplier?.id === supplierId && line.status !== "no_listing")

// A group holding its own edits and whether it's open, as the report does.
function Group({ setEdit, onOpenChange, ...props }: React.ComponentProps<typeof RestockSupplierGroup>) {
  const edits = useMap<string, LineEdit>()
  const [open, setOpen] = useState(props.open)
  return (
    <RestockSupplierGroup
      {...props}
      edits={edits}
      setEdit={(variantId, edit) => {
        edits.set(variantId, edit)
        setEdit(variantId, edit)
      }}
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        onOpenChange(next)
      }}
    />
  )
}

// One supplier's suggestions under a header with what its selected lines add up to, and Reorder.
const meta = preview.meta({
  title: "Components/Inventory/Restock supplier group",
  component: RestockSupplierGroup,
  args: {
    groupKey: supplierId,
    name: "Lotus Manufacturing",
    supplierId,
    lines: lotusLines,
    channel: { kind: "amazon" } as const,
    edits: new Map<string, LineEdit>(),
    setEdit: fn(),
    open: false,
    onOpenChange: fn()
  },
  render: (args) => <Group {...args} />
})

// Collapsed, the header still shows the selection's totals and Reorder.
export const Collapsed = meta.story({
  play: async ({ canvas }) => {
    const group = canvas.getByRole("region", { name: "Lotus Manufacturing" })
    await expect(within(group).queryByRole("table")).toBeNull()
    await expect(within(group).getByText(/Lead time 45 days, 2 lines, 120 units, 5 cases/)).toBeVisible()
    await expect(within(group).getByText("$510.00")).toBeVisible()
    await expect(within(group).getByRole("button", { name: "Reorder" })).toHaveAttribute(
      "href",
      expect.stringContaining("destination=amazon")
    )
  }
})

// Leaving a line out changes the totals and Reorder.
export const EditLines = meta.story({
  play: async ({ args, canvas }) => {
    const group = canvas.getByRole("region", { name: "Lotus Manufacturing" })
    await userEvent.click(within(group).getByRole("button", { name: "Lotus Manufacturing" }))
    await expect(args.onOpenChange).toHaveBeenCalledWith(true)
    await userEvent.click(within(group).getByRole("checkbox", { name: "Order Canvas tote bag, Black" }))
    await expect(args.setEdit).toHaveBeenCalledWith(lotusLines[1]!.variantId, { selected: false, units: "24" })
    await expect(within(group).getByText(/Lead time 45 days, 1 line, 96 units, 4 cases/)).toBeVisible()
    // Each line opens its calculation on its own.
    await userEvent.click(within(group).getByRole("button", { name: "Calculation for Canvas tote bag, Natural" }))
    await expect(
      within(group).getByRole("button", { name: "Calculation for Canvas tote bag, Natural" })
    ).toHaveAttribute("aria-expanded", "true")
    await expect(within(group).getByRole("button", { name: "Calculation for Canvas tote bag, Black" })).toHaveAttribute(
      "aria-expanded",
      "false"
    )
  }
})

// Nothing selected: Reorder waits for a line.
export const NothingSelected = meta.story({
  args: { lines: lotusLines.filter((line) => line.status === "stocked") },
  play: async ({ canvas }) => {
    const group = canvas.getByRole("region", { name: "Lotus Manufacturing" })
    await expect(within(group).getByText(/nothing selected/)).toBeVisible()
    await expect(within(group).getByRole("button", { name: "Reorder" })).toBeDisabled()
  }
})

// A supplier only in Shopify is ordered outside Copacker, so there's no Reorder.
export const OrderedOutside = meta.story({
  args: {
    groupKey: "shopify:Coastal Paper",
    name: "Coastal Paper",
    supplierId: null,
    lines: restockLines.filter((line) => line.externalSupplier === "Coastal Paper")
  },
  play: async ({ canvas }) => {
    const group = canvas.getByRole("region", { name: "Coastal Paper" })
    await expect(within(group).getByText("Ordered outside Copacker")).toBeVisible()
    await expect(within(group).queryByRole("button", { name: "Reorder" })).toBeNull()
  }
})

// A member who sees no prices and can't make purchase orders sees quantities only.
export const ForMember = meta.story({
  parameters: { permissions: { role: "member", access: { restock: "view", orders: "view" } } },
  play: async ({ canvas }) => {
    const group = canvas.getByRole("region", { name: "Lotus Manufacturing" })
    await expect(within(group).queryByText("Estimated cost")).toBeNull()
    await expect(within(group).queryByRole("button", { name: "Reorder" })).toBeNull()
  }
})
