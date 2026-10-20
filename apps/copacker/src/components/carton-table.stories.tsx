import { validatePacking } from "@repo/aisle"
import { useState } from "react"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { type CartonGroup, expandCartonGroups, groupCartons } from "@/lib/carton-groups"
import {
  awdBagCartons,
  awdBagOrder,
  bagOrder,
  towelOrder,
  towelPacking,
  towelPackingDraft
} from "@/stories/fixtures/packing"
import { shownDialog } from "@/stories/fixtures/purchase-orders"
import { CartonTable } from "./carton-table"

// The table with its rows kept in state, as the packing form keeps them.
function Controlled(props: React.ComponentProps<typeof CartonTable>) {
  const [cartons, setCartons] = useState(props.cartons)
  return (
    <CartonTable
      {...props}
      cartons={cartons}
      onChange={(index, next) => {
        setCartons((current) => current.map((carton, i) => (i === index ? next : carton)))
        props.onChange?.(index, next)
      }}
    />
  )
}
const [natural, sage, teaTowel] = towelOrder.items
const issuesOf = (cartons: CartonGroup[], order = towelOrder) =>
  validatePacking(order, { cartons: expandCartonGroups(cartons).filter((carton) => carton.weight > 0), changes: [] })
    .issues
const draft = groupCartons(towelPackingDraft().cartons)
const meta = preview.meta({
  title: "Components/Shipments/Carton table",
  component: Controlled,
  args: {
    cartons: draft,
    products: towelOrder.items,
    context: "PO38 / Shipment 1",
    showErrors: true,
    onChange: fn(),
    onDuplicate: fn(),
    onDelete: fn()
  }
})

// Board 06.27: a row per carton configuration. Complete rows stay closed; B1–B6, still to be weighed, opens with its
// error under the row and its weight outlined.
export const Editing = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Contents")).toBeVisible()
    await expect(canvas.getByRole("heading", { name: "A1–A10" })).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Products in A1–A10" })).toHaveAttribute("aria-expanded", "false")
    await expect(canvas.getByRole("button", { name: "Products in B1–B6" })).toHaveAttribute("aria-expanded", "true")
    await expect(canvas.getByText("Enter the weight of each carton.")).toBeVisible()
    await expect(canvas.getByRole("spinbutton", { name: "Carton B1: Weight (kg)" })).toHaveAttribute(
      "aria-invalid",
      "true"
    )
    await expect(canvas.getByRole("spinbutton", { name: "Carton B1: Count" })).toHaveValue(6)
    await expect(canvas.getByRole("spinbutton", { name: "Carton B1: Length (cm)" })).toHaveValue(60)
    // A closed row says what it holds.
    const first = within(canvas.getByRole("region", { name: "Carton A1" }))
    await expect(first.getAllByText("240 units").some((element) => element.checkVisibility())).toBe(true)
    await expect(first.getByText("1 product, 24 per carton")).toBeVisible()
    // Captions head the first product only.
    await userEvent.click(canvas.getByRole("button", { name: "Products in A1–A10" }))
    await expect(first.getByText("Product")).toBeVisible()
    await expect(first.getByText("NT-WB-2210")).toBeVisible()
    await expect(first.getByRole("spinbutton", { name: "WB-2210: quantity per carton A1" })).toHaveValue(24)
  }
})

// Quantities are units. A multipack says how many packs they make, and an odd number of units for a 2-pack is an
// error under the product.
export const QuantityInUnits = meta.story({
  args: { cartons: [draft[2]!] },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Products in C1–C2" }))
    await expect(canvas.getByText("30 packs, 2 units each")).toBeVisible()
    const quantity = canvas.getByRole("spinbutton", { name: "CT-3100: quantity per carton C1" })
    await userEvent.clear(quantity)
    await userEvent.type(quantity, "24")
    await expect(canvas.getByText("12 packs, 2 units each")).toBeVisible()
    await expect(args.onChange).toHaveBeenLastCalledWith(
      0,
      expect.objectContaining({ items: [{ itemId: teaTowel!.id, pieces: 24 }] })
    )
    await userEvent.type(quantity, "5")
    await expect(
      canvas.getByText("Quantity: this product comes in packs of 2. Enter a multiple of 2 units.")
    ).toBeVisible()
    await expect(quantity).toHaveAttribute("aria-invalid", "true")
  }
})

// A new carton opens to add its products, from those with units left to pack.
export const AddProduct = meta.story({
  args: {
    cartons: [{ ...draft[0]!, cartonId: "D1", cartonIds: [], count: 1, items: [] }],
    remainingPieces: { [natural!.id]: 0, [sage!.id]: 36, [teaTowel!.id]: 0 }
  },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByText("Add a product to this carton.")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Add products to carton D1" }))
    const dialog = await shownDialog("Add products to carton")
    await expect(dialog.getByText("36 units")).toBeVisible()
    await userEvent.click(dialog.getByRole("checkbox", { name: `${sage!.name} ${sage!.variant}` }))
    await userEvent.click(dialog.getByRole("button", { name: "Add to carton" }))
    const quantity = canvas.getByRole("spinbutton", { name: "WB-2214: quantity per carton D1" })
    await expect(quantity).toHaveAttribute("aria-invalid", "true")
    await expect(canvas.getByText("Enter how many units of this product each carton holds.")).toBeVisible()
    await userEvent.type(quantity, "36")
    await expect(args.onChange).toHaveBeenLastCalledWith(
      0,
      expect.objectContaining({ items: [{ itemId: sage!.id, pieces: 36 }] })
    )
    await userEvent.click(canvas.getByRole("button", { name: "Remove WB-2214 from carton D1" }))
    await expect(canvas.queryByRole("spinbutton", { name: /quantity per carton/ })).toBeNull()
  }
})

export const RowMenu = meta.story({
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Carton B1 actions" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Duplicate carton" }))
    await expect(args.onDuplicate).toHaveBeenCalledWith(1)
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
    await userEvent.click(canvas.getByRole("button", { name: "Carton C1 actions" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete carton" }))
    await expect(args.onDelete).toHaveBeenCalledWith(2)
  }
})

// A row with issues, closed, says how many it has beside its units.
export const ClosedWithIssues = meta.story({
  play: async ({ canvas }) => {
    const row = within(canvas.getByRole("region", { name: "Carton B1" }))
    await userEvent.click(row.getByRole("button", { name: "Products in B1–B6" }))
    await expect(row.queryByText("Enter the weight of each carton.")).toBeNull()
    await expect(row.getAllByText("1 issue").filter((element) => element.checkVisibility())).toHaveLength(1)
  }
})

// Board 06.17 (Carton editor errors), AWD US: the rules a carton breaks, as validatePacking reports them.
const [awdLimits, awdMixed, awdIvory] = awdBagCartons()
const awd = (carton: CartonGroup) => ({
  cartons: [carton],
  products: awdBagOrder.items,
  context: "PO39 / Shipment 1",
  issues: issuesOf([carton], awdBagOrder)
})
const rowErrors = [
  "Dimensions: Length is 70 cm. AWD allows up to 63.5 cm (25 in) on each side.",
  "Weight: 25 kg exceeds the 50 lb limit (22.68 kg). Reduce the weight of each carton."
]
const productError =
  "Quantity: 160 sellable units per carton exceeds AWD’s limit of 150. Split them into smaller cartons."

// Cartons A1–A2 hold too many units and are too long and too heavy: each error shows once for the group, a carton's
// under its row and a product's under the product, and each outlines the field it names.
export const AwdLimits = meta.story({
  name: "AWD limits",
  args: awd(awdLimits!),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "A1–A2" })).toBeVisible()
    for (const error of [...rowErrors, productError]) {
      await expect(canvas.getByText(error)).toBeVisible()
    }
    await expect(canvas.getByText(rowErrors[1]!).getBoundingClientRect().bottom).toBeLessThan(
      canvas.getByText("Cotton drawstring bag").getBoundingClientRect().top
    )
    await expect(canvas.getByText(productError).getBoundingClientRect().top).toBeGreaterThan(
      canvas.getByText("Cotton drawstring bag").getBoundingClientRect().bottom
    )
    await expect(canvas.getByRole("spinbutton", { name: "Carton A1: Length (cm)" })).toHaveAttribute(
      "aria-invalid",
      "true"
    )
    await expect(canvas.getByRole("spinbutton", { name: "Carton A1: Width (cm)" })).not.toHaveAttribute("aria-invalid")
    await expect(canvas.getByRole("spinbutton", { name: "Carton A1: Weight (kg)" })).toHaveAttribute(
      "aria-invalid",
      "true"
    )
    await expect(canvas.getByRole("spinbutton", { name: "DB-2031: quantity per carton A1" })).toHaveAttribute(
      "aria-invalid",
      "true"
    )
  }
})

// Carton B1 mixes two SKUs, which AWD doesn't allow. A products error outlines no field.
export const AwdMixedSkus = meta.story({
  name: "AWD mixed SKUs",
  args: awd(awdMixed!),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Products: AWD requires one SKU per carton. Move these SKUs into separate cartons.")
    ).toBeVisible()
    for (const quantity of canvas.getAllByRole("spinbutton")) {
      await expect(quantity).not.toHaveAttribute("aria-invalid")
    }
  }
})

// On a phone each row is a card, and each error sits under the field it names.
export const AwdLimitsOnAPhone = meta.story({
  ...AwdLimits.input,
  name: "AWD limits on a phone",
  globals: { viewport: { value: "iphone12" } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText("Contents")).not.toBeVisible()
    for (const error of [...rowErrors, productError]) {
      await expect(canvas.getByText(error)).toBeVisible()
    }
    const weight = canvas.getByRole("spinbutton", { name: "Carton A1: Weight (kg)" }).getBoundingClientRect()
    const length = canvas.getByRole("spinbutton", { name: "Carton A1: Length (cm)" }).getBoundingClientRect()
    await expect(canvas.getByText(rowErrors[1]!).getBoundingClientRect().top).toBeGreaterThan(weight.bottom)
    await expect(canvas.getByText(rowErrors[1]!).getBoundingClientRect().bottom).toBeLessThan(length.top)
    const region = canvas.getByRole("region", { name: "Carton A1" })
    await expect(region.scrollWidth).toBeLessThanOrEqual(region.clientWidth)
  }
})

// Board 06.14 (Longer translations, mobile error layout): German's longer errors wrap beneath their fields on a phone.
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
    await expect(canvas.getByRole("heading", { name: "A1–A2" })).toBeVisible()
    for (const error of [
      "Menge: 160 verkaufsfähige Einheiten pro Karton überschreiten die AWD-Obergrenze von 150. Verteilen Sie die Einheiten auf mehrere Kartons.",
      "Abmessungen: Die Länge beträgt 70 cm. Bei AWD darf keine Kartonseite länger als 63,5 cm (25 Zoll) sein.",
      "Gewicht: 25 kg überschreiten das zulässige Höchstgewicht von 50 lb (22,68 kg). Verringern Sie das Gewicht jedes Kartons."
    ]) {
      await expect(canvas.getByText(error)).toBeVisible()
    }
    const region = canvas.getByRole("region", { name: "Karton A1" })
    await expect(region.scrollWidth).toBeLessThanOrEqual(region.clientWidth)
  }
})

// Board 06.15 (Additional validation states and design rules): carton C2 packs 100 Ivory tea towels where the SKU's
// first carton holds 120, so AWD's packing template doesn't match. The error sits under the product and outlines no
// field.
const ivory = { ...awdIvory!, cartonId: "C2", cartonIds: ["C2"], items: [{ ...awdIvory!.items[0]!, pieces: 100 }] }
export const AwdPackingTemplate = meta.story({
  name: "AWD packing template",
  args: {
    ...awd(ivory),
    issues: issuesOf([awdIvory!, ivory], awdBagOrder).filter((issue) => issue.cartonId === "C2")
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(
        "Packing template: This SKU uses 120 units per carton elsewhere in this shipment. Use the same packing template for every carton of this SKU."
      )
    ).toBeVisible()
    await expect(canvas.getByRole("spinbutton", { name: "CT-3101: quantity per carton C2" })).not.toHaveAttribute(
      "aria-invalid"
    )
  }
})

// FBA individual units may mix products, so the carton AWD rejects passes here.
export const FbaCompatibleProducts = meta.story({
  name: "FBA compatible products",
  args: {
    cartons: [
      {
        ...awdMixed!,
        items: [bagOrder.items[0]!, bagOrder.items[2]!].map((item) => ({ itemId: item.id, pieces: 40 }))
      }
    ],
    products: bagOrder.items,
    issues: []
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("80 units")).toBeVisible()
    await expect(canvas.getByText("2 products")).toBeVisible()
    await expect(canvas.queryByText(/issue/)).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "Products in B1" }))
    await expect(canvas.getAllByRole("spinbutton", { name: /quantity per carton B1/ })).toHaveLength(2)
  }
})

const packed = groupCartons(towelPacking().cartons)

// Board 06.28: read-only, the numbers are text, and an open row lists its products and units.
export const ReadOnly = meta.story({
  args: { cartons: packed, readOnly: true },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("spinbutton")).toBeNull()
    await expect(canvas.queryByRole("button", { name: /actions/ })).toBeNull()
    const tea = within(canvas.getByRole("region", { name: "Carton C1" }))
    await expect(tea.getByText("50 × 35 × 30 cm")).toBeVisible()
    await expect(tea.getByText("7.8 kg")).toBeVisible()
    await userEvent.click(tea.getByRole("button", { name: "Products in C1–C2" }))
    await expect(tea.getByText("60 units", { exact: true })).toBeVisible()
    await expect(tea.getByText("30 packs, 2 units each")).toBeVisible()
    await expect(tea.queryByRole("button", { name: /Add products/ })).toBeNull()
  }
})

// Board 06.29: on a phone each row is a card, with its fields under labels and its products below.
export const Phone = meta.story({
  globals: { viewport: { value: "iphone12" } },
  play: async ({ canvas }) => {
    const row = within(canvas.getByRole("region", { name: "Carton B1" }))
    await expect(row.getByText("144 units, 1 product, 24 per carton")).toBeVisible()
    await expect(row.getByText("Count")).toBeVisible()
    await expect(row.getByText("Dimensions")).toBeVisible()
    await expect(row.getByText("Supplier SKU")).toBeVisible()
    const region = canvas.getByRole("region", { name: "Carton B1" })
    await expect(region.scrollWidth).toBeLessThanOrEqual(region.clientWidth)
  }
})

// Board 06.30: read-only on a phone, each carton's count, dimensions and weight share a line.
export const PhoneReadOnly = meta.story({
  args: { cartons: packed, readOnly: true },
  globals: { viewport: { value: "iphone12" } },
  play: async ({ canvas }) => {
    const row = within(canvas.getByRole("region", { name: "Carton A1" }))
    const tops = ["10", "60 × 40 × 40 cm", "12.4 kg"].map((text) => row.getByText(text).getBoundingClientRect().top)
    await expect(new Set(tops).size).toBe(1)
  }
})

// A long supplier SKU wraps inside a narrow table.
export const LongSku = meta.story({
  args: {
    cartons: packed,
    readOnly: true,
    products: towelOrder.items.map((item) => ({
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
    await userEvent.click(canvas.getByRole("button", { name: "Products in A1–A10" }))
    const sku = canvas.getByText(/LONG-SUPPLIER-REFERENCE/)
    await expect(sku.scrollWidth).toBeLessThanOrEqual(sku.clientWidth)
  }
})
