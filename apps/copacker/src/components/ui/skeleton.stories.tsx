import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { Skeleton } from "./skeleton"

const meta = preview.meta({
  title: "Foundations/Skeleton",
  component: Skeleton,
  args: { className: "h-4 w-48" }
})

export const Default = meta.story({
  play: async ({ canvasElement }) => {
    const skeleton = canvasElement.querySelector("[data-slot=skeleton]")
    await expect(skeleton).toHaveClass("animate-pulse")
    await expect(skeleton?.getBoundingClientRect().width).toBe(192)
  }
})

// A row's shape while it loads: a thumbnail and two lines.
export const Row = meta.story({
  render: () => (
    <div className="flex items-center gap-3" aria-busy="true" aria-label="Loading products">
      <Skeleton className="size-10 rounded-lg" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  ),
  play: async ({ canvas }) => {
    const row = canvas.getByLabelText("Loading products")
    await expect(row).toHaveAttribute("aria-busy", "true")
    await expect(row.querySelectorAll("[data-slot=skeleton]")).toHaveLength(3)
  }
})
