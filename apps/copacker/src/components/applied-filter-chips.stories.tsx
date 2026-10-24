import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { startList } from "@/lib/logistics-list"
import { AppliedFilterChips } from "./applied-filter-chips"

const meta = preview.meta({
  title: "Components/Purchase orders/Applied filter chips",
  component: AppliedFilterChips,
  args: {
    kind: "shipments" as const,
    viewer: "buyer" as const,
    criteria: {
      ...startList,
      filters: { ...startList.filters, partner: "Northwind Textiles", status: "Packing" },
      from: "2026-10-01"
    },
    dispatch: fn()
  }
})

// A chip for each filter, which removes it, and one for the ready dates.
export const Default = meta.story({
  play: async ({ canvas, args }) => {
    const supplier = canvas.getByRole("button", { name: "Remove Supplier filter" })
    await expect(supplier).toHaveTextContent("Supplier: Northwind Textiles")
    await expect(canvas.getByRole("button", { name: "Remove Status filter" })).toHaveTextContent("Status: Packing")
    await expect(canvas.getByRole("button", { name: "Remove Ready date filter" })).toHaveTextContent(
      "Ready date: Oct 1 to Any"
    )
    await userEvent.click(supplier)
    await expect(args.dispatch).toHaveBeenLastCalledWith({ type: "filter", key: "partner", value: "" })
    await userEvent.click(canvas.getByRole("button", { name: "Remove Ready date filter" }))
    await expect(args.dispatch).toHaveBeenLastCalledWith({ type: "ready", from: "", to: "" })
    await userEvent.click(canvas.getByRole("button", { name: "Clear filters" }))
    await expect(args.dispatch).toHaveBeenLastCalledWith({ type: "clear" })
  }
})

// A supplier's list names its customers.
export const Supplier = meta.story({
  args: { viewer: "supplier", criteria: { ...startList, filters: { ...startList.filters, partner: "Harbor Goods" } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Remove Customer filter" })).toHaveTextContent(
      "Customer: Harbor Goods"
    )
    await expect(canvas.queryByRole("button", { name: "Remove Ready date filter" })).toBeNull()
  }
})
