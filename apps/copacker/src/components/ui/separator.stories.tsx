import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { Separator } from "./separator"

const meta = preview.meta({
  title: "Foundations/Separator",
  component: Separator,
  render: () => (
    <div className="max-w-sm text-sm">
      <p>Harbor Tote</p>
      <Separator className="my-3" />
      <div className="flex h-5 items-center gap-3">
        <span>48 units</span>
        <Separator orientation="vertical" />
        <span>2 cartons</span>
      </div>
    </div>
  )
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    const [horizontal, vertical] = canvas.getAllByRole("separator")
    await expect(horizontal).toHaveAttribute("aria-orientation", "horizontal")
    await expect(vertical).toHaveAttribute("aria-orientation", "vertical")
    // A horizontal line is wide and thin, a vertical one tall and thin.
    const across = horizontal?.getBoundingClientRect()
    const down = vertical?.getBoundingClientRect()
    await expect(across?.height).toBe(1)
    await expect(across?.width).toBeGreaterThan(100)
    await expect(down?.width).toBe(1)
    await expect(down?.height).toBeGreaterThan(10)
  }
})
