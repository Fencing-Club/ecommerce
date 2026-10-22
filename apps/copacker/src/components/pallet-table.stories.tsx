import { validatePallets } from "@repo/copacker-packing-rules"
import { useState } from "react"
import { expect, fn, screen, userEvent, within } from "storybook/test"
import preview from "#.storybook/preview"
import { expandCartonGroups, groupCartons, palletCartons, type PalletValue } from "@/lib/carton-groups"
import { towelOrder, towelPacking } from "@/stories/fixtures/packing"
import { shownDialog, chooseOption } from "@/stories/play"
import { PalletTable } from "./pallet-table"

// The table with its pallets kept in state, as the packing form keeps them, and their issues worked out from them.
function Controlled(props: React.ComponentProps<typeof PalletTable>) {
  const [pallets, setPallets] = useState(props.pallets)
  return (
    <PalletTable
      {...props}
      pallets={pallets}
      issues={props.issues ?? validatePallets({ cartons: cartons.map((carton) => ({ cartonId: carton.id })), pallets })}
      onChange={(next) => {
        setPallets(next)
        props.onChange?.(next)
      }}
    />
  )
}
const groups = groupCartons(towelPacking().cartons)
const cartons = palletCartons(groups, towelOrder.items)
const ids = expandCartonGroups(groups).map((carton) => carton.cartonId)
const pallet = (palletId: string, cartonIds: string[], weight: number, stackable = true): PalletValue => ({
  palletId,
  length: 120,
  width: 100,
  height: 175,
  weight,
  stackable,
  cartonIds
})
// Pallet 1 holds A1–A10, pallet 2 the B cartons but B4 and B6, and pallet 3 is new.
const editing = [
  pallet("1", ids.slice(0, 10), 152),
  pallet("2", ["B1", "B2", "B3", "B5", "C1"], 430, false),
  { ...pallet("3", [], Number.NaN), height: Number.NaN }
]
const meta = preview.meta({
  title: "Components/Shipments/Pallet table",
  component: Controlled,
  args: { pallets: editing, cartons, context: "PO38 / Shipment 1", onChange: fn() }
})

// Board 06.27, Pallets: a row per pallet with its size, gross weight and stacking. A closed pallet says how many
// cartons and units it holds; an open one lists its cartons as runs, each removable.
export const Editing = meta.story({
  play: async ({ canvas, args }) => {
    const first = within(canvas.getByRole("region", { name: "Pallet 1" }))
    await expect(first.getByRole("button", { name: "Cartons on Pallet 1" })).toHaveAttribute("aria-expanded", "false")
    await expect(first.getAllByText("10 cartons").some((element) => element.checkVisibility())).toBe(true)
    await expect(first.getByRole("spinbutton", { name: "Pallet 1: Weight (kg)" })).toHaveValue(152)
    await expect(first.getByRole("combobox", { name: "Pallet 1: Stacking" })).toHaveTextContent("Stackable")

    const second = within(canvas.getByRole("region", { name: "Pallet 2" }))
    await userEvent.click(second.getByRole("button", { name: "Cartons on Pallet 2" }))
    await expect(second.getByRole("combobox", { name: "Pallet 2: Stacking" })).toHaveTextContent("Not stackable")
    await expect(second.getAllByRole("listitem").map((tag) => tag.textContent)).toEqual(["B1–B3", "B5", "C1"])
    await userEvent.click(second.getByRole("button", { name: "Remove B5 from Pallet 2" }))
    await expect(args.onChange).toHaveBeenLastCalledWith([
      editing[0],
      expect.objectContaining({ palletId: "2", cartonIds: ["B1", "B2", "B3", "C1"] }),
      editing[2]
    ])

    // A new pallet opens to choose its cartons; its blank fields wait for them.
    const third = within(canvas.getByRole("region", { name: "Pallet 3" }))
    await expect(third.getByText("No cartons on this pallet yet")).toBeVisible()
    await expect(third.getByRole("spinbutton", { name: "Pallet 3: Height (cm)" })).not.toHaveAttribute("aria-invalid")
    await chooseOption(third.getByRole("combobox", { name: "Pallet 3: Stacking" }), "Not stackable")
    await expect(args.onChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ palletId: "3", stackable: false })])
    )
  }
})

// On a tablet, or beside Shipment details on a laptop, the pallets stay a table, with room for Not stackable.
export const Tablet = meta.story({
  globals: { viewport: { value: "ipad" } },
  play: async ({ canvas }) => {
    const row = canvas.getByRole("region", { name: "Pallet 2" })
    await expect(getComputedStyle(row).display).toBe("grid")
    await expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth)
    const stacking = within(row).getByText("Not stackable")
    await expect(stacking.scrollWidth).toBeLessThanOrEqual(stacking.clientWidth)
  }
})

// Choosing cartons for a pallet moves them off any other pallet.
export const ChooseCartons = meta.story({
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Choose cartons for Pallet 3" }))
    const dialog = await shownDialog("Choose cartons for Pallet 3")
    // B1–B6, split across pallets, opens onto its cartons.
    await expect(dialog.getByRole("button", { name: "Show cartons B1–B6" })).toHaveAttribute("aria-expanded", "true")
    await userEvent.click(dialog.getByRole("checkbox", { name: "B4" }))
    await userEvent.click(dialog.getByRole("checkbox", { name: "B5" }))
    await userEvent.click(dialog.getByRole("button", { name: "Save cartons" }))
    await expect(args.onChange).toHaveBeenLastCalledWith([
      editing[0],
      expect.objectContaining({ palletId: "2", cartonIds: ["B1", "B2", "B3", "C1"] }),
      expect.objectContaining({ palletId: "3", cartonIds: ["B4", "B5"] })
    ])
  }
})

// After submitting, blank fields and a pallet without cartons are errors, and the row opens onto them.
export const Errors = meta.story({
  args: { showErrors: true },
  play: async ({ canvas }) => {
    const third = within(canvas.getByRole("region", { name: "Pallet 3" }))
    await expect(third.getByText("Enter the pallet’s length, width and height.")).toBeVisible()
    await expect(third.getByText("Enter the pallet’s gross weight, with the pallet itself.")).toBeVisible()
    await expect(
      third.getByText("Cartons: this pallet has no cartons yet. Choose its cartons, or delete the pallet.")
    ).toBeVisible()
    await expect(third.getByRole("spinbutton", { name: "Pallet 3: Height (cm)" })).toHaveAttribute(
      "aria-invalid",
      "true"
    )
    await expect(third.getByRole("spinbutton", { name: "Pallet 3: Length (cm)" })).not.toHaveAttribute("aria-invalid")
    await userEvent.click(third.getByRole("button", { name: "Cartons on Pallet 3" }))
    await expect(third.getAllByText("3 issues").some((element) => element.checkVisibility())).toBe(true)
  }
})

export const RowMenu = meta.story({
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Pallet 1 actions" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Duplicate pallet" }))
    await expect(args.onChange).toHaveBeenLastCalledWith([
      ...editing,
      expect.objectContaining({ palletId: "4", weight: 152, cartonIds: [] })
    ])
    await userEvent.click(canvas.getByRole("button", { name: "Pallet 2 actions" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete pallet" }))
    await expect(args.onChange).toHaveBeenLastCalledWith([
      editing[0],
      editing[2],
      expect.objectContaining({ palletId: "4" })
    ])
  }
})

const packed = [
  pallet("1", ids.slice(0, 10), 240),
  pallet("2", ["C1", ...ids.slice(10, 16)], 281),
  pallet("3", ["C2"], 285, false)
]

// Board 06.28, Pallets: read-only, the values are text and an open pallet lists its cartons.
export const ReadOnly = meta.story({
  args: { pallets: packed, readOnly: true },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("spinbutton")).toBeNull()
    await expect(canvas.queryByRole("button", { name: /actions|Choose cartons/ })).toBeNull()
    const second = within(canvas.getByRole("region", { name: "Pallet 2" }))
    await expect(second.getByText("120 × 100 × 175 cm")).toBeVisible()
    await expect(second.getByText("281 kg")).toBeVisible()
    await userEvent.click(second.getByRole("button", { name: "Cartons on Pallet 2" }))
    await expect(second.getByText("B1–B6, C1")).toBeVisible()
    await expect(within(canvas.getByRole("region", { name: "Pallet 3" })).getByText("Not stackable")).toBeVisible()
  }
})

// Board 06.29, Pallets: on a phone each pallet is a card, its dimensions over its weight and stacking.
export const Phone = meta.story({
  globals: { viewport: { value: "iphone12" } },
  play: async ({ canvas }) => {
    const first = within(canvas.getByRole("region", { name: "Pallet 1" }))
    await expect(first.getByText("10 cartons, 240 units")).toBeVisible()
    const dimensions = first.getByRole("spinbutton", { name: "Pallet 1: Length (cm)" }).getBoundingClientRect()
    const weight = first.getByRole("spinbutton", { name: "Pallet 1: Weight (kg)" }).getBoundingClientRect()
    await expect(weight.top).toBeGreaterThan(dimensions.bottom)
    const region = canvas.getByRole("region", { name: "Pallet 1" })
    await expect(region.scrollWidth).toBeLessThanOrEqual(region.clientWidth)
  }
})

// Board 06.30, Pallets: read-only on a phone, each pallet's dimensions, weight and stacking share a line, which wraps
// for longer words.
export const PhoneReadOnly = meta.story({
  args: { pallets: packed, readOnly: true },
  globals: { viewport: { value: "iphone12" } },
  play: async ({ canvas }) => {
    const first = within(canvas.getByRole("region", { name: "Pallet 1" }))
    const tops = ["120 × 100 × 175 cm", "240 kg", "Stackable"].map(
      (text) => first.getByText(text).getBoundingClientRect().top
    )
    await expect(new Set(tops).size).toBe(1)
  }
})

export const PhoneReadOnlyInGerman = meta.story({
  args: { pallets: packed, readOnly: true },
  globals: { locale: "de", viewport: { value: "iphone12" } },
  play: async ({ canvas }) => {
    const third = canvas.getByRole("region", { name: "Palette 3" })
    await expect(within(third).getByText("Nicht stapelbar")).toBeVisible()
    await expect(third.scrollWidth).toBeLessThanOrEqual(third.clientWidth)
  }
})
