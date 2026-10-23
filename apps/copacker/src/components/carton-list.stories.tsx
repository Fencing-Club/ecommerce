import { expect, fn, userEvent, within } from "storybook/test"
import preview from "#.storybook/preview"
import { Button } from "@/components/ui/button"
import { groupCartons } from "@/lib/carton-groups"
import { towelOrder, towelPacking, towelPackingDraft } from "@/stories/fixtures/packing"
import { CartonList } from "./carton-list"

const packed = groupCartons(towelPacking().cartons)

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
    actions: (
      <Button type="button" variant="outline">
        Add carton
      </Button>
    )
  },
  play: async ({ canvas, args }) => {
    const section = within(canvas.getByRole("region", { name: "Cartons" }))
    await expect(section.getByRole("button", { name: "Add carton" })).toBeVisible()
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

export const Empty = meta.story({
  args: { readOnly: false, cartons: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No cartons yet")).toBeVisible()
    await expect(canvas.getByText("0 of 540 units")).toBeVisible()
  }
})

// On a phone the units leave the header for the bar below the cartons, and each row is a card.
export const Mobile = meta.story({
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("540 of 540 units")).not.toBeVisible()
    await expect(canvas.getByRole("region", { name: "Carton A1" })).toBeVisible()
  }
})
