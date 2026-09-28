import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { BrandMark, Stage } from "./stage"

const meta = preview.meta({
  component: Stage,
  args: {
    className: "h-[32rem]",
    children: (
      <div className="relative p-12">
        <BrandMark />
        <p className="mt-10 text-4xl font-semibold">Restocking, handled.</p>
      </div>
    )
  }
})

export const Default = meta.story({
  play: async ({ canvas, canvasElement }) => {
    const stage = canvasElement.querySelector("aside")
    await expect(stage).toBeVisible()
    await expect(stage).toHaveClass("h-[32rem]")
    await expect(canvas.getByText("Restocking, handled.")).toBeVisible()
    await expect(canvas.getByText("Copacker")).toBeVisible()
  }
})

// Phones don't show the stage.
export const Phone = meta.story({
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("aside")).not.toBeVisible()
  }
})

export const Brand = meta.story({
  render: () => <BrandMark />,
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText("Copacker")).toBeVisible()
    // The box icon is decoration beside the name.
    await expect(canvasElement.querySelector("[aria-hidden] svg")).not.toBeNull()
  }
})

// In a header with a border under it, the box drops its glow.
export const FlatBrand = meta.story({
  render: () => <BrandMark flat />,
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText("Copacker")).toBeVisible()
    const box = canvasElement.querySelector("[aria-hidden]")
    await expect(box && getComputedStyle(box).boxShadow).toBe("none")
  }
})
