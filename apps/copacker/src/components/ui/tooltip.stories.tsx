import { Info } from "lucide-react"
import { expect, fn, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { Button } from "./button"
import { Kbd } from "./kbd"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip"

const sides = ["top", "right", "bottom", "left"] as const

type Args = {
  side?: (typeof sides)[number]
  onOpenChange: (open: boolean, details: unknown) => void
}

const meta = preview.type<{ args: Args }>().meta({
  args: { onOpenChange: fn() },
  render: ({ side, ...args }) => (
    <div className="p-16">
      <Tooltip {...args}>
        <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label="About available units" />}>
          <Info />
        </TooltipTrigger>
        <TooltipContent side={side}>On hand, less what open orders need</TooltipContent>
      </Tooltip>
    </div>
  )
})

export const Default = meta.story({
  play: async ({ canvas, args }) => {
    const trigger = canvas.getByRole("button", { name: "About available units" })
    await expect(screen.queryByText("On hand, less what open orders need")).not.toBeInTheDocument()

    await userEvent.hover(trigger)
    const tip = await screen.findByText("On hand, less what open orders need")
    await expect(tip).toHaveAttribute("data-side", "top")
    await waitFor(() =>
      expect(tip.getBoundingClientRect().bottom).toBeLessThanOrEqual(trigger.getBoundingClientRect().top)
    )
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(true, expect.anything())

    await userEvent.unhover(trigger)
    await waitFor(() => expect(screen.queryByText("On hand, less what open orders need")).not.toBeInTheDocument())
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(false, expect.anything())
  }
})

export const KeyboardFocus = meta.story({
  play: async ({ canvas }) => {
    await userEvent.tab()
    await expect(canvas.getByRole("button", { name: "About available units" })).toHaveFocus()
    await waitFor(() => expect(screen.getByText("On hand, less what open orders need")).toBeVisible())
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByText("On hand, less what open orders need")).not.toBeInTheDocument())
  }
})

export const Sides = meta.story({
  render: () => (
    <div className="flex gap-4 p-16">
      {sides.map((side) => (
        <Tooltip key={side}>
          <TooltipTrigger render={<Button variant="outline" />}>{side}</TooltipTrigger>
          <TooltipContent side={side}>Shown on the {side}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  ),
  play: async ({ canvas }) => {
    for (const side of sides) {
      const trigger = canvas.getByRole("button", { name: side })
      await userEvent.hover(trigger)
      const tip = await screen.findByText(`Shown on the ${side}`)
      await expect(tip).toHaveAttribute("data-side", side)
      // Once it has slid into place, it sits clear of the trigger on that side.
      await waitFor(() => {
        const box = tip.getBoundingClientRect()
        const anchor = trigger.getBoundingClientRect()
        const clear = {
          top: box.bottom <= anchor.top,
          bottom: box.top >= anchor.bottom,
          left: box.right <= anchor.left,
          right: box.left >= anchor.right
        }
        expect(clear[side]).toBe(true)
      })
      await userEvent.unhover(trigger)
      await waitFor(() => expect(screen.queryByText(`Shown on the ${side}`)).not.toBeInTheDocument())
    }
  }
})

// A shortcut in the tooltip, and a provider that waits before the first one opens.
export const WithShortcutAndDelay = meta.story({
  render: () => (
    <div className="p-16">
      <TooltipProvider delay={300}>
        <Tooltip>
          <TooltipTrigger render={<Button variant="outline" />}>Search</TooltipTrigger>
          <TooltipContent>
            Search everything <Kbd>/</Kbd>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  ),
  play: async ({ canvas }) => {
    await userEvent.hover(canvas.getByRole("button", { name: "Search" }))
    await expect(screen.queryByText("Search everything")).not.toBeInTheDocument()
    const tip = await screen.findByText("Search everything", { exact: false })
    await expect(tip.querySelector("[data-slot=kbd]")).toHaveTextContent("/")
  }
})
