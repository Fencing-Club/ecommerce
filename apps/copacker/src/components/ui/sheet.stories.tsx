import { expect, fn, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { shownDialog } from "@/stories/play"
import { Button } from "./button"
import { Field, FieldLabel } from "./field"
import { Input } from "./input"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "./sheet"

const sides = ["top", "right", "bottom", "left"] as const

type Args = {
  onOpenChange: (open: boolean, details: unknown) => void
  defaultOpen?: boolean
  side?: (typeof sides)[number]
  showCloseButton?: boolean
  onSave: () => void
}

const meta = preview.type<{ args: Args }>().meta({
  title: "Foundations/Sheet",
  args: { onOpenChange: fn(), onSave: fn() },
  // A side panel with a form, as product details and partner addresses open in one.
  render: ({ side, showCloseButton, onOpenChange, onSave, defaultOpen }) => (
    <Sheet onOpenChange={onOpenChange} defaultOpen={defaultOpen}>
      <SheetTrigger render={<Button variant="outline" />}>Edit address</SheetTrigger>
      <SheetContent side={side} showCloseButton={showCloseButton}>
        <SheetHeader>
          <SheetTitle>Lotus Manufacturing</SheetTitle>
          <SheetDescription>Where purchase orders ship from.</SheetDescription>
        </SheetHeader>
        <Field className="px-4">
          <FieldLabel htmlFor="city">City</FieldLabel>
          <Input id="city" defaultValue="Dongguan" />
        </Field>
        <SheetFooter>
          <Button onClick={onSave}>Save</Button>
          <SheetClose render={<Button variant="outline" />}>Cancel</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
})

export const Default = meta.story({
  play: async ({ canvas, args }) => {
    const trigger = canvas.getByRole("button", { name: "Edit address" })
    await userEvent.click(trigger)
    const sheet = await shownDialog("Lotus Manufacturing")
    await expect(sheet.element).toHaveAccessibleDescription("Where purchase orders ship from.")
    await expect(sheet.element).toHaveAttribute("data-side", "right")
    // A side sheet casts the dialog's shadow.
    await expect(getComputedStyle(sheet.element).boxShadow).toContain("0px 16px 40px")
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(true, expect.anything())

    const city = sheet.getByRole("textbox", { name: "City" })
    await userEvent.clear(city)
    await userEvent.type(city, "Shenzhen")
    await userEvent.click(sheet.getByRole("button", { name: "Save" }))
    await expect(args.onSave).toHaveBeenCalledOnce()

    await userEvent.click(sheet.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(false, expect.anything())
    await expect(trigger).toHaveFocus()
  }
})

export const CloseButton = meta.story({
  args: { defaultOpen: true },
  play: async () => {
    const sheet = await shownDialog("Lotus Manufacturing")
    await userEvent.click(sheet.getByRole("button", { name: "Close" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  }
})

export const WithoutCloseButton = meta.story({
  args: { defaultOpen: true, showCloseButton: false },
  play: async () => {
    const sheet = await shownDialog("Lotus Manufacturing")
    await expect(sheet.queryByRole("button", { name: "Close" })).not.toBeInTheDocument()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  }
})

// Each side the sheet slides in from, placed against that edge of the window.
export const Sides = meta.story({
  render: (args) => (
    <div className="flex gap-2">
      {sides.map((side) => (
        <Sheet key={side}>
          <SheetTrigger render={<Button variant="outline" />}>{side}</SheetTrigger>
          <SheetContent side={side}>
            <SheetHeader>
              <SheetTitle>Opens from the {side}</SheetTitle>
              <SheetDescription>Harbor Goods</SheetDescription>
            </SheetHeader>
            <SheetFooter>
              <Button onClick={args.onSave}>Save</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      ))}
    </div>
  ),
  play: async ({ canvas }) => {
    for (const side of sides) {
      await userEvent.click(canvas.getByRole("button", { name: side }))
      const sheet = await shownDialog(`Opens from the ${side}`)
      await expect(sheet.element).toHaveAttribute("data-side", side)
      // A bottom sheet, as phones show one, casts its shadow upward.
      await expect(getComputedStyle(sheet.element).boxShadow).toContain(
        side === "bottom" ? "0px -8px 24px" : "0px 16px 40px"
      )
      await waitFor(() => {
        const box = sheet.element.getBoundingClientRect()
        const edges = {
          top: box.top,
          left: box.left,
          right: window.innerWidth - box.right,
          bottom: window.innerHeight - box.bottom
        }
        expect(Math.round(edges[side])).toBe(0)
      })
      await userEvent.keyboard("{Escape}")
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    }
  }
})
