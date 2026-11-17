import { Button } from "@buildkitgg/shadcn"
import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { SelectionBar } from "./selection-bar"

const archive = fn()

// What's ticked in a list, and what to do with it.
const meta = preview.meta({
  title: "Components/Display/Selection bar",
  component: SelectionBar,
  args: {
    count: 3,
    children: (
      <>
        <Button size="sm" variant="outline">
          Set as active
        </Button>
        <Button size="sm" variant="outline" onClick={archive}>
          Archive
        </Button>
      </>
    )
  },
  beforeEach: () => {
    archive.mockClear()
  }
})

export const Selected = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("3 selected")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Archive" }))
    await expect(archive).toHaveBeenCalledOnce()
  }
})

export const ManySelected = meta.story({
  args: { count: 1250 },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("1,250 selected")).toBeVisible()
  }
})

// Nothing ticked, nothing shows.
export const NothingSelected = meta.story({
  args: { count: 0 },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText(/selected/)).toBeNull()
    await expect(canvas.queryByRole("button", { name: "Archive" })).toBeNull()
  }
})
