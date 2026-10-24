import type { ValidationIssue } from "@repo/copacker-packing-rules"
import { expect, fn, userEvent, within } from "storybook/test"
import preview from "#.storybook/preview"
import { groupCartons, type PalletValue } from "@/lib/carton-groups"
import { towelOrder, towelPacking } from "@/stories/fixtures/packing"
import { PalletList } from "./pallet-list"

const cartons = groupCartons(towelPacking().cartons)
const pallet = (palletId: string, cartonIds: string[], stackable = true): PalletValue => ({
  palletId,
  length: 120,
  width: 100,
  height: 150,
  weight: 180,
  stackable,
  cartonIds
})
const aCartons = Array.from({ length: 10 }, (_, index) => `A${index + 1}`)
const rest = ["B1", "B2", "B3", "B4", "B5", "B6", "C1", "C2"]
const actions = () => ({ onAdd: fn(), onImport: fn(), onExport: fn() })

const meta = preview.meta({
  title: "Components/Shipments/Pallet list",
  component: PalletList,
  args: {
    order: towelOrder,
    cartons,
    pallets: [pallet("1", aCartons), pallet("2", rest, false)],
    readOnly: true
  },
  argTypes: { order: { control: false }, cartons: { control: false }, actions: { control: false } }
})

// A packed shipment's pallets as they are, every carton on one.
export const Packed = meta.story({
  play: async ({ canvas }) => {
    const section = within(canvas.getByRole("region", { name: "Pallets" }))
    await expect(section.getByText("18 of 18 cartons on pallets")).toBeVisible()
    await expect(section.getByRole("region", { name: "Pallet 2" })).toBeVisible()
    await expect(section.queryByRole("spinbutton")).toBeNull()
  }
})

// While packing: the section's actions, and the cartons left off every pallet listed below them. A pallet that names a
// carton the packing no longer has holds only the rest.
const offPallets: ValidationIssue = { code: "cartonsOffPallets", values: { count: 8, cartons: "B1–B6, C1–C2" } }
export const Packing = meta.story({
  args: {
    readOnly: false,
    pallets: [pallet("1", [...aCartons, "Z9"])],
    issues: [offPallets],
    onChange: fn(),
    actions: actions()
  },
  play: async ({ canvas, args }) => {
    const section = within(canvas.getByRole("region", { name: "Pallets" }))
    await expect(section.getByRole("button", { name: "Export pallets" })).toBeVisible()
    await expect(section.getByRole("button", { name: "Import pallets" })).toBeVisible()
    await userEvent.click(section.getByRole("button", { name: "Add pallet" }))
    await expect(args.actions?.onAdd).toHaveBeenCalled()
    await expect(section.getByText("10 of 18 cartons on pallets")).toBeVisible()
    await expect(section.getByText(/^Cartons: 8 cartons aren’t on a pallet: B1–B6, C1–C2\./)).toBeVisible()
  }
})

// As with cartons, Add pallet and Import pallets sit in the empty box until the first pallet is added.
export const Empty = meta.story({
  args: { readOnly: false, pallets: [], actions: actions() },
  play: async ({ canvas, args }) => {
    const section = within(canvas.getByRole("region", { name: "Pallets" }))
    await expect(section.getByText("No pallets yet")).toBeVisible()
    await expect(section.getByText("Add a pallet and choose the cartons on it, or import a spreadsheet.")).toBeVisible()
    await expect(section.getByText("0 of 18 cartons on pallets")).toBeVisible()
    await expect(section.queryByRole("button", { name: "Export pallets" })).toBeNull()
    await userEvent.click(section.getByRole("button", { name: "Import pallets" }))
    await expect(args.actions?.onImport).toHaveBeenCalled()
  }
})

// The chevron before the title closes the list, and the count stays beside it.
export const Collapsed = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Pallets" }))
    await expect(canvas.queryByRole("region", { name: "Pallet 1" })).toBeNull()
    await expect(canvas.getByText("18 of 18 cartons on pallets")).toBeVisible()
  }
})
