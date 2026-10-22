import { useState } from "react"
import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { type Dimensions, DimensionsField, FieldError, IssueBadge, NumberField } from "./packing-fields"

// The carton and pallet tables' fields: a weight, the three sides in one field, and how they show problems.
function Fields({ onChange }: { onChange: (value: unknown) => void }) {
  const [weight, setWeight] = useState(Number.NaN)
  const [sides, setSides] = useState<Dimensions>({ length: 60, width: 40, height: Number.NaN })
  return (
    <div className="flex max-w-80 flex-col gap-4">
      <NumberField
        label="Carton A1: Weight (kg)"
        suffix="kg"
        value={weight}
        invalid={!Number.isFinite(weight)}
        errorId="weight-error"
        onChange={(value) => {
          setWeight(value)
          onChange({ weight: value })
        }}
      />
      <DimensionsField
        label={(side) => `Carton A1: ${side}`}
        value={sides}
        invalid={(["length", "width", "height"] as const).filter((side) => !Number.isFinite(sides[side]))}
        onChange={(patch) => {
          setSides((current) => ({ ...current, ...patch }))
          onChange(patch)
        }}
      />
      {!Number.isFinite(weight) && <FieldError id="weight-error">Enter the weight of each carton.</FieldError>}
      <IssueBadge count={2} className="self-start" />
    </div>
  )
}

const meta = preview.meta({
  title: "Components/Shipments/Packing fields",
  component: Fields,
  args: { onChange: fn() }
})

export const Default = meta.story({
  play: async ({ canvas, args }) => {
    const weight = canvas.getByRole("spinbutton", { name: "Carton A1: Weight (kg)" })
    await expect(weight).toHaveAttribute("aria-invalid", "true")
    await expect(weight).toHaveAccessibleDescription("Enter the weight of each carton.")
    await expect(canvas.getByText("kg")).toBeVisible()
    await expect(canvas.getByText("L × W × H")).toBeVisible()
    await expect(canvas.getByText("2 issues")).toBeVisible()
    await userEvent.type(weight, "12.4")
    await expect(weight).not.toHaveAttribute("aria-invalid")
    await expect(args.onChange).toHaveBeenLastCalledWith({ weight: 12.4 })
    const height = canvas.getByRole("spinbutton", { name: "Carton A1: height" })
    await expect(height).toHaveAttribute("aria-invalid", "true")
    await expect(canvas.getByRole("spinbutton", { name: "Carton A1: length" })).not.toHaveAttribute("aria-invalid")
    await userEvent.type(height, "40")
    await expect(args.onChange).toHaveBeenLastCalledWith({ height: 40 })
  }
})
