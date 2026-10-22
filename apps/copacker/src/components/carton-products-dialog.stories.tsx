import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { towelOrder } from "@/stories/fixtures/packing"
import { shownDialog } from "@/stories/fixtures/purchase-orders"
import { CartonProductsDialog } from "./carton-products-dialog"

const [natural, sage, teaTowel] = towelOrder.items
const meta = preview.meta({
  title: "Components/Shipments/Carton products dialog",
  component: CartonProductsDialog,
  args: {
    label: "Add products to cartons B1–B6",
    added: [sage!.id],
    products: towelOrder.items,
    remainingPieces: { [natural!.id]: 24, [sage!.id]: 36, [teaTowel!.id]: 20 },
    context: "PO38 / Shipment 1",
    onAdd: fn()
  }
})

// The products with units left, in units; one already in the carton can't be added again.
export const AddProducts = meta.story({
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole("button", { name: "Add products to cartons B1–B6" })).toHaveTextContent("Add product")
    await userEvent.click(canvas.getByRole("button", { name: "Add products to cartons B1–B6" }))
    const dialog = await shownDialog("Add products to carton")
    await expect(dialog.getByText("PO38 / Shipment 1")).toBeVisible()
    await expect(dialog.getByRole("checkbox", { name: `${sage!.name} ${sage!.variant}` })).toHaveAttribute(
      "aria-disabled",
      "true"
    )
    await expect(dialog.getByText("20 units")).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Add to carton" })).toBeDisabled()
    await userEvent.click(dialog.getByRole("checkbox", { name: `${teaTowel!.name} ${teaTowel!.variant}` }))
    await expect(dialog.getByText("1 selected")).toBeVisible()
    await userEvent.click(dialog.getByRole("button", { name: "Add to carton" }))
    await expect(args.onAdd).toHaveBeenCalledWith([teaTowel!.id])
  }
})

// Products with nothing left to pack aren't offered, and search narrows the rest.
export const OnlyUnpackedProducts = meta.story({
  args: { added: [], remainingPieces: { [natural!.id]: 0, [sage!.id]: 0, [teaTowel!.id]: 12 } },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Add products/ }))
    const dialog = await shownDialog("Add products to carton")
    await expect(dialog.queryByText("Waffle bath towel")).toBeNull()
    await expect(dialog.getAllByRole("checkbox")).toHaveLength(1)
    await userEvent.type(dialog.getByRole("textbox", { name: "Search products in this shipment" }), "towel bath")
    await expect(dialog.getByText("No products found")).toBeVisible()
  }
})
