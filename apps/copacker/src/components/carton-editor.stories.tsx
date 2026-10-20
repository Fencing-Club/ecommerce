import { validatePacking } from "@repo/aisle"
import { useState } from "react"
import { expect, fn, screen, userEvent, within } from "storybook/test"
import preview from "#.storybook/preview"
import { type CartonGroup, expandCartonGroups, groupCartons } from "@/lib/carton-groups"
import { awdBagOrder, bagOrder, errorCartons, fbaBagOrder } from "@/stories/fixtures/packing"
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
      {
        cartonId: "1",
        code: "cartonSize",
        values: {
          receiver: "AWD",
          shape: "cube",
          lengthCm: 63.5,
          widthCm: 63.5,
          heightCm: 63.5,
          lengthIn: 25,
          widthIn: 25,
          heightIn: 25
        },
        fields: ["length"]
      }
    ]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("spinbutton", { name: "Carton 1: Weight (kg)" })).toHaveAttribute(
      "aria-invalid",
      "true"
    )
    await expect(canvas.getByText(/^Dimensions: Length is 70 cm\./)).toBeVisible()
    await expect(
      within(canvas.getByRole("region", { name: "Carton 1" })).getByText(/Enter a positive number for Weight/)
    ).toBeVisible()
  }
})

// Board 06.17 (Carton editor errors): the rules a carton breaks, as validatePacking reports them.
const checked = (order: typeof awdBagOrder) => (carton: CartonGroup) => ({
  value: carton,
  products: order.items,
  context: "PO39 / Shipment 1",
  issues: validatePacking(order, { cartons: expandCartonGroups([carton]), changes: [] }).issues
})
const awd = checked(awdBagOrder)
const [awdLimits, awdMixed, awdIvory] = errorCartons(awdBagOrder, 70)
const limitErrors = [
  "Quantity: 160 sellable units per carton exceeds AWD’s limit of 150. Split them into smaller cartons.",
  "Dimensions: Length is 70 cm. AWD allows up to 63.5 cm (25 in) on each side.",
  "Weight: 25 kg exceeds the 50 lb limit (22.67 kg). Reduce the weight of each carton."
]

// Cartons 1–2 hold too many units and are too long and too heavy: each error shows once for the group, and outlines
// the field it names.
export const AwdLimits = meta.story({
  name: "AWD limits",
  args: awd(awdLimits!),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Cartons 1–2" })).toBeVisible()
    await expect(canvas.getAllByRole("listitem").map((item) => item.textContent)).toEqual(limitErrors)
    await expect(canvas.getByRole("spinbutton", { name: "Carton 1: Length (cm)" })).toHaveAttribute(
      "aria-invalid",
      "true"
    )
    await expect(canvas.getByRole("spinbutton", { name: "Carton 1: Width (cm)" })).not.toHaveAttribute("aria-invalid")
    await expect(canvas.getByRole("spinbutton", { name: "Carton 1: Weight (kg)" })).toHaveAttribute(
      "aria-invalid",
      "true"
    )
    await expect(canvas.getByRole("spinbutton", { name: "DB-2031: quantity per carton 1" })).toHaveAttribute(
      "aria-invalid",
      "true"
    )
  }
})

// Carton 3 mixes two SKUs, which AWD doesn't allow. A products error outlines no field.
export const AwdMixedSkus = meta.story({
  name: "AWD mixed SKUs",
  args: awd(awdMixed!),
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Products: AWD requires one SKU per carton. Move these SKUs into separate cartons."
    ])
    for (const quantity of canvas.getAllByRole("spinbutton")) {
      await expect(quantity).not.toHaveAttribute("aria-invalid")
    }
  }
})

export const AwdLimitsOnAPhone = meta.story({
  ...AwdLimits.input,
  name: "AWD limits on a phone",
  globals: { viewport: { value: "iphone12" } },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole("listitem").map((item) => item.textContent)).toEqual(limitErrors)
    const region = canvas.getByRole("region", { name: "Carton 1" })
    await expect(region.scrollWidth).toBeLessThanOrEqual(region.clientWidth)
  }
})

// Board 06.14 (Longer translations, mobile error layout): German's longer errors wrap beneath the carton on a phone.
export const AwdLimitsInGerman = meta.story({
  ...AwdLimitsOnAPhone.input,
  name: "AWD limits in German",
  args: {
    ...awd(awdLimits!),
    products: awdBagOrder.items.map((item, index) =>
      index ? item : { ...item, name: "Baumwollbeutel mit Kordelzug", variant: "Natur / Mittel / 20 × 30 cm" }
    )
  },
  globals: { locale: "de", viewport: { value: "iphone12" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Kartons 1–2" })).toBeVisible()
    await expect(canvas.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Menge: 160 verkaufsfähige Einheiten pro Karton überschreiten die AWD-Obergrenze von 150. Verteilen Sie die Einheiten auf mehrere Kartons.",
      "Abmessungen: Die Länge beträgt 70 cm. Bei AWD darf keine Kartonseite länger als 63,5 cm (25 Zoll) sein.",
      "Gewicht: 25 kg überschreiten das zulässige Höchstgewicht von 50 lb (22,67 kg). Verringern Sie das Gewicht jedes Kartons."
    ])
    const region = canvas.getByRole("region", { name: "Karton 1" })
    await expect(region.scrollWidth).toBeLessThanOrEqual(region.clientWidth)
  }
})
// Board 06.15 (Additional validation states and design rules): carton 4 packs 100 Ivory tea towels where the SKU's
// first carton holds 120, so AWD's packing template doesn't match. The error outlines no field.
const ivory = { ...awdIvory!, items: [{ ...awdIvory!.items[0]!, pieces: 100 }] }
export const AwdPackingTemplate = meta.story({
  name: "AWD packing template",
  args: {
    ...awd(ivory),
    issues: validatePacking(awdBagOrder, {
      cartons: expandCartonGroups([{ ...awdIvory!, cartonId: "3", cartonIds: ["3"] }, ivory]),
      changes: []
    }).issues.filter((issue) => issue.cartonId === "4")
  },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Packing template: This SKU uses 120 units per carton elsewhere in this shipment. Use the same packing template for every carton of this SKU."
    ])
    await expect(canvas.getByRole("spinbutton", { name: "CT-3101: quantity per carton 4" })).not.toHaveAttribute(
      "aria-invalid"
    )
  }
})

// FBA cartons are individual units: they may mix SKUs and hold any number of units, and be up to 36 × 25 × 25 in.
const fba = checked(fbaBagOrder)
const [fbaLimits, fbaMixed] = errorCartons(fbaBagOrder, 100)

// Cartons 1–2 are too long and too heavy for FBA, but may hold 160 units.
export const FbaLimits = meta.story({
  name: "FBA limits",
  args: fba(fbaLimits!),
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Dimensions: Length is 100 cm. FBA allows up to 91.44 × 63.5 × 63.5 cm (36 × 25 × 25 in) for this carton.",
      "Weight: 25 kg exceeds the 50 lb limit (22.67 kg). Reduce the weight of each carton."
    ])
    await expect(canvas.getByRole("spinbutton", { name: "Carton 1: Length (cm)" })).toHaveAttribute(
      "aria-invalid",
      "true"
    )
    await expect(canvas.getByRole("spinbutton", { name: "Carton 1: Width (cm)" })).not.toHaveAttribute("aria-invalid")
    await expect(canvas.getByRole("spinbutton", { name: "Carton 1: Weight (kg)" })).toHaveAttribute(
      "aria-invalid",
      "true"
    )
    await expect(canvas.getByRole("spinbutton", { name: "DB-2031: quantity per carton 1" })).not.toHaveAttribute(
      "aria-invalid"
    )
  }
})

// FBA individual units may mix products, so the carton AWD rejects passes here.
export const FbaCompatibleProducts = meta.story({
  name: "FBA compatible products",
  args: {
    value: {
      ...awdMixed!,
      items: [bagOrder.items[0]!, bagOrder.items[2]!].map((item) => ({ itemId: item.id, pieces: 40 }))
    },
    products: bagOrder.items,
    context: "PO39 / Shipment 1",
    issues: []
  },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole("spinbutton", { name: /quantity per carton 3/ })).toHaveLength(2)
    await expect(canvas.queryByRole("listitem")).toBeNull()
  }
})

// Carton 3 mixes two SKUs, which FBA allows.
export const FbaMixedSkus = meta.story({
  name: "FBA mixed SKUs",
  args: fba(fbaMixed!),
  play: async ({ canvas }) => {
    await expect(canvas.queryAllByRole("listitem")).toEqual([])
    await expect(canvas.getByRole("heading", { name: "Carton 3" })).toBeVisible()
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
