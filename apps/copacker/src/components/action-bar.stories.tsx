import { Button } from "@buildkitgg/shadcn-baseui-kit"
import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { ActionBar } from "./action-bar"

const meta = preview.meta({
  title: "Unused/Display/Action bar",
  component: ActionBar,
  args: {
    tone: "warning",
    title: "2 unsaved changes",
    detail: "Payment terms and the ready date",
    onDiscard: fn(),
    primary: <Button>Save</Button>
  },
  // The bar sticks to the bottom of the page's column, so give it one.
  decorators: [
    (Story) => (
      <div className="flex min-h-80 flex-col justify-end">
        <Story />
      </div>
    )
  ]
})

export const UnsavedChanges = meta.story({
  play: async ({ args, canvas }) => {
    const bar = canvas.getByRole("region", { name: "Actions" })
    await expect(bar).toHaveAttribute("data-tone", "warning")
    await expect(canvas.getByText("2 unsaved changes")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Discard" }))
    await expect(args.onDiscard).toHaveBeenCalledOnce()
  }
})

// Packing's running summary, the problems still in the way, and its commit.
export const TaskFlow = meta.story({
  args: {
    tone: "neutral",
    title: "12 cartons, 420 units",
    detail: "Draft saved 2 minutes ago",
    problems: 2,
    onProblems: fn(),
    onDiscard: undefined,
    secondary: (
      <>
        <Button variant="outline">Save draft</Button>
        <Button variant="outline">Check</Button>
      </>
    ),
    primary: <Button>Submit packing list</Button>
  },
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "2 problems" }))
    await expect(args.onProblems).toHaveBeenCalledOnce()
    await expect(canvas.getByRole("button", { name: "Submit packing list" })).toBeVisible()
  }
})

export const ProposalReview = meta.story({
  args: {
    tone: "info",
    title: "Lotus Manufacturing proposed changes",
    detail: "480 units, $3,258.00",
    onDiscard: undefined,
    secondary: <Button variant="outline">Decline</Button>,
    primary: <Button>Approve changes</Button>
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("region", { name: "Actions" })).toHaveAttribute("data-tone", "info")
    await expect(canvas.getByRole("button", { name: "Approve changes" })).toBeVisible()
  }
})

export const BulkSelection = meta.story({
  args: {
    tone: "neutral",
    title: "3 selected",
    detail: undefined,
    onDiscard: undefined,
    onClose: fn(),
    secondary: (
      <>
        <Button variant="outline">Set supplier</Button>
        <Button variant="outline">Print labels</Button>
      </>
    ),
    primary: <Button>Reorder</Button>
  },
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Clear selection" }))
    await expect(args.onClose).toHaveBeenCalledOnce()
  }
})

export const Blocked = meta.story({
  args: {
    tone: "destructive",
    title: "Fix 1 problem to submit",
    detail: "Carton 9 mixes SKUs for AWD US",
    problems: 1,
    onDiscard: undefined,
    primary: <Button disabled>Submit packing list</Button>
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Submit packing list" })).toBeDisabled()
  }
})

// Docked to the bottom edge, the message above the actions and the primary taking the width that's left.
export const OnAPhone = meta.story({
  globals: { viewport: { value: "iphone12", isRotated: false } },
  play: async ({ canvas }) => {
    const bar = canvas.getByRole("region", { name: "Actions" })
    await expect(getComputedStyle(bar).position).toBe("fixed")
    const save = canvas.getByRole("button", { name: "Save" }).getBoundingClientRect()
    const discard = canvas.getByRole("button", { name: "Discard" }).getBoundingClientRect()
    await expect(save.width).toBeGreaterThan(discard.width)
  }
})

// A record page on a phone: only the next step's actions, with no message.
export const NextStepOnAPhone = meta.story({
  globals: { viewport: { value: "iphone12", isRotated: false } },
  args: {
    title: undefined,
    detail: undefined,
    onDiscard: undefined,
    secondary: <Button variant="outline">Request correction</Button>,
    primary: <Button>Approve invoice</Button>
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Approve invoice" })).toBeVisible()
    await expect(canvas.queryByText("2 unsaved changes")).not.toBeInTheDocument()
  }
})
