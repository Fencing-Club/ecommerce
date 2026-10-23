import { expect, userEvent, within } from "storybook/test"
import preview from "#.storybook/preview"
import { Button } from "@/components/ui/button"
import type { CartonGroup } from "@/lib/carton-groups"
import { order } from "@/stories/fixtures/purchase-orders"
import { member } from "@/stories/workspace"
import { PackedProductsTable } from "./packed-products-table"

const [tote, apron, basket] = order.items
const carton = (cartonId: string, count: number, itemId: string, pieces: number): CartonGroup => ({
  cartonId,
  count,
  cartonIds: [],
  length: 60,
  width: 40,
  height: 40,
  weight: 12,
  items: [{ itemId, pieces }]
})
// Every tote is packed, half the aprons, and more baskets than the order has.
const cartons = [carton("A1", 4, tote!.id, 60), carton("B1", 1, apron!.id, 60), carton("C1", 1, basket!.id, 90)]

const meta = preview.meta({
  title: "Components/Shipments/Packed products table",
  component: PackedProductsTable,
  args: { order, cartons, reserved: {} },
  argTypes: { order: { control: false }, cartons: { control: false }, renderActions: { control: false } }
})

// Closed until opened, with the number of products beside the title; open, each line says how many the cartons hold of
// what's left to ship.
export const Default = meta.story({
  play: async ({ canvas }) => {
    const products = canvas.getByRole("button", { name: "Products" })
    await expect(products).toHaveAttribute("aria-expanded", "false")
    await expect(canvas.getByText("3 products")).toBeVisible()
    await expect(canvas.queryByRole("table")).toBeNull()
    await userEvent.click(products)
    const table = within(canvas.getByRole("table"))
    await expect(table.getByText("240 of 240")).toBeVisible()
    await expect(table.getByText("60 left")).toBeVisible()
    await expect(table.getByText("90 of 60")).toBeVisible()
    await expect(table.getByText("30 too many")).toBeVisible()
    await expect(table.getByText(tote!.supplierSku)).toBeVisible()
    await expect(table.getByRole("columnheader", { name: "Price per unit" })).toBeVisible()
  }
})

// While packing, the line beside the title counts the units still to pack. Packing too many of one product doesn't make
// up for another.
export const Progress = meta.story({
  args: { progress: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("3 products, 60 units left")).toBeVisible()
  }
})

// Every unit packed turns the line green.
export const AllPacked = meta.story({
  args: {
    progress: true,
    cartons: [carton("A1", 4, tote!.id, 60), carton("B1", 2, apron!.id, 60), carton("C1", 1, basket!.id, 60)]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("3 products, all packed")).toBeVisible()
  }
})

// A line packed past what's left keeps the summary from saying all packed.
export const Overpacked = meta.story({
  args: {
    progress: true,
    cartons: [carton("A1", 5, tote!.id, 60), carton("B1", 2, apron!.id, 60), carton("C1", 1, basket!.id, 60)]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("3 products")).toBeVisible()
    await expect(canvas.queryByText("3 products, all packed")).toBeNull()
  }
})

// What the PO's other shipments hold isn't this shipment's to pack.
export const OtherShipments = meta.story({
  args: { reserved: { [tote!.id]: 200 } },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Products" }))
    const table = within(canvas.getByRole("table"))
    await expect(table.getByText("240 of 40")).toBeVisible()
    await expect(table.getByText("200 too many")).toBeVisible()
  }
})

// Each line's own actions sit at its end, such as its label downloads.
export const WithActions = meta.story({
  args: {
    renderActions: (item) => (
      <Button type="button" variant="outline" size="sm">
        Labels for {item.buyerSku}
      </Button>
    )
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Products" }))
    await expect(canvas.getByRole("button", { name: `Labels for ${apron!.buyerSku}` })).toBeVisible()
  }
})

// Someone who doesn't see prices packs without them.
export const WithoutPrices = meta.story({
  parameters: { permissions: { ...member, access: { ...member.access, shipments: "edit" } } },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Products" }))
    await expect(canvas.queryByRole("columnheader", { name: "Price per unit" })).toBeNull()
  }
})

// A 40rem column, too narrow for the carton table's columns, stacks the products as well.
export const NarrowColumn = meta.story({
  decorators: [
    (Story) => (
      <div className="w-[40rem]">
        <Story />
      </div>
    )
  ],
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Products" }))
    await expect(canvas.queryByRole("columnheader", { name: "Packed" })).toBeNull()
  }
})

// Below 44rem, as with the carton and pallet tables, each line stacks, with its column names above the values.
export const Mobile = meta.story({
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Products" }))
    const table = canvas.getByRole("table")
    await expect(canvas.queryByRole("columnheader", { name: "Packed" })).toBeNull()
    await expect(
      within(table)
        .getAllByText("Packed")
        .filter((label) => label.checkVisibility())
    ).toHaveLength(3)
    await expect(table.scrollWidth).toBeLessThanOrEqual(table.clientWidth)
  }
})
