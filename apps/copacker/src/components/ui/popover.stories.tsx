import { Info } from "lucide-react"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { Button } from "./button"
import { Input } from "./input"
import { Label } from "./label"
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "./popover"

type Args = {
  onOpenChange: (open: boolean, details: unknown) => void
  defaultOpen?: boolean
}

const meta = preview.type<{ args: Args }>().meta({
  title: "Foundations/Popover",
  args: { onOpenChange: fn() },
  render: ({ onOpenChange, defaultOpen }) => (
    <Popover onOpenChange={onOpenChange} defaultOpen={defaultOpen}>
      <PopoverTrigger render={<Button variant="outline" />}>Carton size</PopoverTrigger>
      <PopoverContent>
        <PopoverHeader>
          <PopoverTitle>Carton size</PopoverTitle>
          <PopoverDescription>How many units Lotus Manufacturing packs in a carton.</PopoverDescription>
        </PopoverHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="per-carton">Units per carton</Label>
          <Input id="per-carton" type="number" defaultValue={24} />
        </div>
      </PopoverContent>
    </Popover>
  )
})

export const Default = meta.story({
  play: async ({ canvas, args }) => {
    const trigger = canvas.getByRole("button", { name: "Carton size" })
    await expect(trigger).toHaveAttribute("aria-expanded", "false")
    await userEvent.click(trigger)
    const popover = await screen.findByRole("dialog", { name: "Carton size" })
    await expect(popover).toHaveAccessibleDescription("How many units Lotus Manufacturing packs in a carton.")
    await expect(trigger).toHaveAttribute("aria-expanded", "true")
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(true, expect.anything())

    const input = within(popover).getByRole("spinbutton", { name: "Units per carton" })
    await userEvent.clear(input)
    await userEvent.type(input, "36")
    await expect(input).toHaveValue(36)

    // Clicking the trigger again closes it.
    await userEvent.click(trigger)
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(false, expect.anything())
  }
})

export const OutsideClickCloses = meta.story({
  args: { defaultOpen: true },
  play: async ({ canvasElement }) => {
    await screen.findByRole("dialog", { name: "Carton size" })
    await userEvent.click(canvasElement)
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  }
})

export const EscapeCloses = meta.story({
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("button", { name: "Carton size" })
    await userEvent.click(trigger)
    await screen.findByRole("dialog")
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    await expect(trigger).toHaveFocus()
  }
})

// An info button whose popover opens to one side, with text only.
export const Aligned = meta.story({
  render: () => (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label="About lead time" />}>
        <Info />
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-60">
        <PopoverDescription>Days from purchase order to ready, set for each supplier.</PopoverDescription>
      </PopoverContent>
    </Popover>
  ),
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("button", { name: "About lead time" })
    await userEvent.click(trigger)
    const popover = await screen.findByRole("dialog")
    await expect(popover).toHaveAttribute("data-side", "right")
    await expect(popover).toHaveAttribute("data-align", "start")
    await waitFor(() =>
      expect(popover.getBoundingClientRect().left).toBeGreaterThanOrEqual(trigger.getBoundingClientRect().right)
    )
  }
})
