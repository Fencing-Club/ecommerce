import { useState } from "react"
import { expect, fn, screen, userEvent, within } from "storybook/test"
import preview from "#.storybook/preview"
import { groupCartons } from "@/lib/carton-groups"
import { order, packed, shownDialog } from "@/stories/fixtures/purchase-orders"
import { CartonEditor } from "./carton-editor"

function Controlled(props: React.ComponentProps<typeof CartonEditor>) {
  const [value, setValue] = useState(props.value)
  return (
    <CartonEditor
      {...props}
      value={value}
      onChange={(next) => {
        setValue(next)
        props.onChange?.(next)
      }}
    />
  )
}
const products = order.items.map((item, index) => ({
  ...item,
  name: index === 2 ? "Cotton tea towel (2 Pack)" : "Waffle bath towel",
  variant: ["Natural / Large / 70 × 140 cm", "Sage / Large / 70 × 140 cm", "Stripe / 50 × 70 cm"][index],
  piecesPerSet: index === 2 ? 2 : 1
}))
const prototype = {
  ...groupCartons(packed(1).cartons)[0]!,
  cartonId: "1",
  items: products.map((item, index) => ({ itemId: item.id, pieces: index === 2 ? 20 : 24 }))
}
const value = {
  ...groupCartons(packed(1).cartons)[0]!,
  cartonId: "1",
  items: [
    { itemId: products[0]!.id, pieces: 40 },
    { itemId: products[1]!.id, pieces: 20 }
  ]
}
const meta = preview.meta({
  title: "Components/Shipments/Carton editor",
  component: Controlled,
  args: { value: prototype, products, onChange: fn(), onDelete: fn(), onDuplicate: fn() }
})

export const MixedProducts = meta.story({
  args: {
    value: {
      ...prototype,
      items: [
        { itemId: products[0]!.id, pieces: 40 },
        { itemId: products[2]!.id, pieces: 20 }
      ]
    }
  },
  play: async ({ canvas, args }) => {
    await expect(canvas.getAllByText("2 per pack").some((element) => element.checkVisibility())).toBe(true)
    await expect(canvas.queryByText("1 per pack")).toBeNull()
    await expect(canvas.getAllByText("Supplier SKU").some((element) => element.checkVisibility())).toBe(true)
    await expect(canvas.getByText(products[0]!.supplierSku, { exact: true })).toBeVisible()
    const quantity = canvas.getByRole("spinbutton", { name: `${products[2]!.buyerSku}: quantity per carton 1` })
    await userEvent.clear(quantity)
    await userEvent.type(quantity, "12")
    await expect(canvas.getByText("24 units")).toBeVisible()
    await expect(args.onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        items: [
          { itemId: products[0]!.id, pieces: 40 },
          { itemId: products[2]!.id, pieces: 24 }
        ]
      })
    )
  }
})
export const AddProduct = meta.story({
  args: {
    value,
    context: "PO38 / Shipment 1 / Amazon FBA US"
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add products to carton 1" }))
    const dialog = await shownDialog("Add products to carton")
    await expect(
      dialog.getByRole("checkbox", { name: `${products[0]!.name} ${products[0]!.variant}` })
    ).toHaveAttribute("aria-disabled", "true")
    await userEvent.click(dialog.getByRole("checkbox", { name: `${products[2]!.name} ${products[2]!.variant}` }))
    await userEvent.click(dialog.getByRole("button", { name: "Add to carton" }))
    await expect(
      canvas.getByRole("spinbutton", { name: `${products[2]!.buyerSku}: quantity per carton 1` })
    ).toBeVisible()
  }
})
export const CartonMenu = meta.story({
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Carton 1 actions" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Duplicate carton" }))
    await expect(args.onDuplicate).toHaveBeenCalledOnce()
    await userEvent.click(canvas.getByRole("button", { name: "Carton 1 actions" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete carton" }))
    await expect(args.onDelete).toHaveBeenCalledOnce()
  }
})
export const Validation = meta.story({
  args: {
    value: { ...value, length: 70, weight: Number.NaN },
    showErrors: true,
    issues: [
      { field: "length", message: "Length must be 63.5 cm or less." },
      { message: "AWD cartons must contain one SKU. Move the second product to another carton." }
    ]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("spinbutton", { name: "Carton 1: Weight (kg)" })).toHaveAttribute(
      "aria-invalid",
      "true"
    )
    await expect(canvas.getByText(/AWD cartons must/)).toBeVisible()
    await expect(
      within(canvas.getByRole("region", { name: "Carton 1" })).getByText(/Enter a positive number for Weight/)
    ).toBeVisible()
  }
})
export const Mobile = meta.story({
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Add products to carton 1" })).toBeVisible()
  }
})
export const Packed = meta.story({
  args: { readOnly: true },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("spinbutton")).toBeNull()
    await expect(canvas.queryByRole("button")).toBeNull()
    await expect(canvas.getByText("20 units")).toBeVisible()
  }
})

export const NarrowPacked = meta.story({
  args: { readOnly: true },
  decorators: [
    (Story) => (
      <div style={{ width: 620, maxWidth: "100%" }}>
        <Story />
      </div>
    )
  ],
  play: async ({ canvas }) => {
    const region = canvas.getByRole("region", { name: "Carton 1" })
    await expect(region.scrollWidth).toBeLessThanOrEqual(region.clientWidth)
    await expect(canvas.getByText("20 units")).toBeVisible()
  }
})
export const MobilePacked = meta.story({
  args: { readOnly: true },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    const region = canvas.getByRole("region", { name: "Carton 1" })
    await expect(region.scrollWidth).toBeLessThanOrEqual(region.clientWidth)
    await expect(canvas.getByText("20 units")).toBeVisible()
  }
})
export const LongSku = meta.story({
  args: {
    readOnly: true,
    products: products.map((item) => ({
      ...item,
      supplierSku: `${item.supplierSku}-LONG-SUPPLIER-REFERENCE-1234567890`
    }))
  },
  decorators: [
    (Story) => (
      <div style={{ width: 400, maxWidth: "100%" }}>
        <Story />
      </div>
    )
  ],
  play: async ({ canvas }) => {
    const sku = canvas.getAllByText(/LONG-SUPPLIER-REFERENCE/)[0]!
    await expect(sku.scrollWidth).toBeLessThanOrEqual(sku.clientWidth)
  }
})

export const OnlyUnpackedProducts = meta.story({
  args: { value, remainingPieces: { [products[0]!.id]: 0, [products[1]!.id]: 0, [products[2]!.id]: 12 } },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add products to carton 1" }))
    const dialog = await shownDialog("Add products to carton")
    await expect(dialog.queryByText("Waffle bath towel")).toBeNull()
    await expect(dialog.getByText("6 packs")).toBeVisible()
    await expect(dialog.getAllByRole("checkbox")).toHaveLength(1)
    await userEvent.click(dialog.getByRole("checkbox"))
    await expect(dialog.getByRole("button", { name: "Add to carton" })).toBeEnabled()
  }
})

export const PackedUnitsFirst = meta.story({
  args: { readOnly: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("20 units", { exact: true })).toBeVisible()
    await expect(canvas.getByText("10 packs, 2 each", { exact: true })).toBeVisible()
    await expect(canvas.queryByText("2 per pack", { exact: true })).toBeNull()
    await expect(canvas.queryByRole("spinbutton")).toBeNull()
  }
})
