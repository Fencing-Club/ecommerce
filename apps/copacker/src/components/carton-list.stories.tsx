import { expect, fn, userEvent, within } from "storybook/test"
import preview from "#.storybook/preview"
import { groupCartons } from "@/lib/carton-groups"
import { towelOrder, towelPacking, towelPackingDraft } from "@/stories/fixtures/packing"
import { CartonList } from "./carton-list"

const packed = groupCartons(towelPacking().cartons)
const actions = () => ({ onAdd: fn(), onImport: fn(), onExport: fn() })

const meta = preview.meta({
  title: "Components/Shipments/Carton list",
  component: CartonList,
  args: { order: towelOrder, cartons: packed, reserved: {}, readOnly: true },
  argTypes: { order: { control: false }, cartons: { control: false }, actions: { control: false } }
})

// A packed shipment's cartons as they are: a row per configuration, and every unit packed.
export const Packed = meta.story({
  play: async ({ canvas }) => {
    const section = within(canvas.getByRole("region", { name: "Cartons" }))
    await expect(section.getByText("540 of 540 units")).toBeVisible()
    await expect(section.getByRole("heading", { name: "A1–A10" })).toBeVisible()
    await expect(section.queryByRole("spinbutton")).toBeNull()
    await expect(section.queryByRole("note")).toBeNull()
  }
})

// While packing: the section's actions, the rows' fields, and the units still to pack.
export const Packing = meta.story({
  args: {
    readOnly: false,
    cartons: groupCartons(towelPackingDraft().cartons),
    showErrors: true,
    onChange: fn(),
    actions: actions()
  },
  play: async ({ canvas, args }) => {
    const section = within(canvas.getByRole("region", { name: "Cartons" }))
    await expect(section.getByRole("button", { name: "Export cartons" })).toBeVisible()
    await userEvent.click(section.getByRole("button", { name: "Import cartons" }))
    await expect(args.actions?.onImport).toHaveBeenCalled()
    await userEvent.click(section.getByRole("button", { name: "Add carton" }))
    await expect(args.actions?.onAdd).toHaveBeenCalled()
    await expect(section.getByText(/^\d+ of 540 units$/)).toBeVisible()
    const weight = section.getByRole("spinbutton", { name: "Carton B1: Weight (kg)" })
    await expect(weight).toHaveAttribute("aria-invalid", "true")
    await userEvent.type(weight, "9")
    await expect(args.onChange).toHaveBeenCalled()
  }
})

// Other shipments of the PO hold some of its units, so this one packs fewer.
export const OtherShipments = meta.story({
  args: { reserved: { [towelOrder.items[0]!.id]: 40 } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/^540 of 500 units$/)).toBeVisible()
  }
})

// Board 06.15: an FBA packing Amazon hasn't planned can't be checked against its packing groups yet.
export const GroupsUnchecked = meta.story({
  args: { readOnly: false, groupsUnchecked: true },
  play: async ({ canvas }) => {
    const notice = within(canvas.getByRole("region", { name: "Cartons" })).getByRole("note")
    await expect(within(notice).getByText("Products that can share a carton aren’t checked yet")).toBeVisible()
  }
})

// The cartons as a whole break a rule, and past 1,000 cartons the packing can't save.
export const Errors = meta.story({
  args: {
    readOnly: false,
    error: "Add at least one carton.",
    cartons: [{ ...packed[0]!, count: 1001 }]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Add at least one carton.")).toBeVisible()
    await expect(canvas.getByText("A shipment can contain up to 1,000 cartons.")).toBeVisible()
  }
})

// With no cartons, Add carton and Import cartons sit in the empty box, and the section's line has no actions until the
// first carton is added.
export const Empty = meta.story({
  args: { readOnly: false, cartons: [], actions: actions() },
  play: async ({ canvas, args }) => {
    const section = within(canvas.getByRole("region", { name: "Cartons" }))
    await expect(section.getByText("No cartons yet")).toBeVisible()
    await expect(
      section.getByText("Add a carton and set Count for identical ones, or import a spreadsheet.")
    ).toBeVisible()
    await expect(section.getByText("0 of 540 units")).toBeVisible()
    await expect(section.queryByRole("button", { name: "Export cartons" })).toBeNull()
    await userEvent.click(section.getByRole("button", { name: "Add carton" }))
    await expect(args.actions?.onAdd).toHaveBeenCalled()
    await userEvent.click(section.getByRole("button", { name: "Import cartons" }))
    await expect(args.actions?.onImport).toHaveBeenCalled()
  }
})

// Someone who can't change the packing sees that there are no cartons, and nothing to do about it.
export const EmptyReadOnly = meta.story({
  args: { cartons: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No cartons yet")).toBeVisible()
    await expect(canvas.queryByText(/import a spreadsheet/)).toBeNull()
    await expect(canvas.queryByRole("button", { name: "Add carton" })).toBeNull()
  }
})

// The chevron before the title closes the list, and opens it again; the units stay beside the title.
export const Collapsed = meta.story({
  play: async ({ canvas }) => {
    const toggle = canvas.getByRole("button", { name: "Cartons" })
    await expect(toggle).toHaveAttribute("aria-expanded", "true")
    await userEvent.click(toggle)
    await expect(toggle).toHaveAttribute("aria-expanded", "false")
    await expect(canvas.queryByRole("heading", { name: "A1–A10" })).toBeNull()
    await expect(canvas.getByText("540 of 540 units")).toBeVisible()
    await userEvent.click(toggle)
    await expect(canvas.getByRole("heading", { name: "A1–A10" })).toBeVisible()
  }
})
