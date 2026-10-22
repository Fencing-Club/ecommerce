import type { ValidationIssue } from "@repo/copacker-packing-rules"
import { expect, fn, within } from "storybook/test"
import preview from "#.storybook/preview"
import { Button } from "@/components/ui/button"
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
    await expect(section.getByText("18 of 18 cartons on pallets")).toHaveClass("text-success")
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
    actions: (
      <Button type="button" variant="outline">
        Add pallet
      </Button>
    )
  },
  play: async ({ canvas }) => {
    const section = within(canvas.getByRole("region", { name: "Pallets" }))
    await expect(section.getByRole("button", { name: "Add pallet" })).toBeVisible()
    await expect(section.getByText("10 of 18 cartons on pallets")).not.toHaveClass("text-success")
    await expect(section.getByText(/^Cartons: 8 cartons aren’t on a pallet: B1–B6, C1–C2\./)).toBeVisible()
  }
})

export const Empty = meta.story({
  args: { readOnly: false, pallets: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No pallets yet")).toBeVisible()
    await expect(canvas.getByText("0 of 18 cartons on pallets")).toBeVisible()
  }
})

export const Mobile = meta.story({
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("18 of 18 cartons on pallets")).toBeVisible()
    await expect(canvas.getByRole("region", { name: "Pallet 1" })).toBeVisible()
  }
})
