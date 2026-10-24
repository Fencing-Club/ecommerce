import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { groupCartons, palletCartons, type PalletValue } from "@/lib/carton-groups"
import { bagOrder, bagPacking, towelOrder, towelPacking } from "@/stories/fixtures/packing"
import { shownDialog } from "@/stories/play"
import { PalletCartonsDialog } from "./pallet-cartons-dialog"

const cartons = palletCartons(groupCartons(towelPacking().cartons), towelOrder.items)
const pallet = (palletId: string, cartonIds: string[]): PalletValue => ({
  palletId,
  length: 120,
  width: 100,
  height: 175,
  weight: 240,
  stackable: true,
  cartonIds
})
// Pallet 1 holds A1–A10; A configuration B is split between pallets 2 and 3; C is on none.
const pallets = [
  pallet("1", ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10"]),
  pallet("2", ["B1", "B2", "B3"]),
  pallet("3", ["B4", "B5", "B6"])
]
const meta = preview.meta({
  title: "Components/Shipments/Pallet cartons dialog",
  component: PalletCartonsDialog,
  args: { pallet: pallets[1]!, pallets, cartons, context: "PO38 / Shipment 1", onSave: fn() }
})

// Board 06.10 B1: a row per carton configuration with the pallet it's on. One split across pallets opens onto its
// cartons; choosing a carton on another pallet moves it here.
export const ChooseCartons = meta.story({
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole("button", { name: "Choose cartons for Pallet 2" })).toHaveTextContent(
      "Choose cartons"
    )
    await userEvent.click(canvas.getByRole("button", { name: "Choose cartons for Pallet 2" }))
    const dialog = await shownDialog("Choose cartons for Pallet 2")
    await expect(dialog.getByText("PO38 / Shipment 1")).toBeVisible()
    await expect(dialog.getByText("Pallet 1")).toBeVisible()
    await expect(dialog.getByText("2 pallets")).toBeVisible()
    await expect(dialog.getByText("10 cartons / NT-WB-2210, 24 units each")).toBeVisible()
    await expect(dialog.getByText("6 cartons / NT-WB-2214, 30 units each / 3 on this pallet")).toBeVisible()
    await expect(dialog.getByRole("checkbox", { name: "B1–B6" })).toHaveAttribute("data-indeterminate")
    await expect(dialog.getAllByText("This pallet")).toHaveLength(3)
    await expect(dialog.getAllByText("Pallet 3")).toHaveLength(3)
    await expect(dialog.getByText("3 cartons, 45.6 kg")).toBeVisible()

    await userEvent.click(dialog.getByRole("checkbox", { name: "B4" }))
    await userEvent.click(dialog.getByRole("checkbox", { name: "C1–C2" }))
    await expect(dialog.getByText("6 cartons, 76.4 kg")).toBeVisible()
    await userEvent.click(dialog.getByRole("button", { name: "Save cartons" }))
    await expect(args.onSave).toHaveBeenCalledWith(["B1", "B2", "B3", "B4", "C1", "C2"])
  }
})

// Search finds cartons by ID or by their products.
export const Search = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Choose cartons for Pallet 2" }))
    const dialog = await shownDialog("Choose cartons for Pallet 2")
    const search = dialog.getByRole("textbox", { name: "Search cartons or products" })
    await userEvent.type(search, "NT-CT")
    await expect(dialog.getAllByRole("checkbox")).toHaveLength(1)
    await userEvent.clear(search)
    await userEvent.type(search, "Z9")
    await expect(dialog.getByText("No cartons found")).toBeVisible()
  }
})

// Mixed cartons list each product's units, and a single carton has no count.
export const MixedCartons = meta.story({
  args: {
    pallet: pallet("1", []),
    pallets: [pallet("1", [])],
    cartons: palletCartons(groupCartons(bagPacking().cartons), bagOrder.items)
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Choose cartons for Pallet 1" }))
    const dialog = await shownDialog("Choose cartons for Pallet 1")
    await expect(dialog.getByText("DB-2030, 40 units / NT-CT-3100, 40 units")).toBeVisible()
    await expect(dialog.getAllByText("—")).toHaveLength(3)
  }
})
