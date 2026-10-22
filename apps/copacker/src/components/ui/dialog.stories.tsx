import { expect, fn, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { shownDialog } from "@/stories/play"
import { Button } from "./button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "./dialog"
import { Field, FieldGroup, FieldLabel } from "./field"
import { Input } from "./input"

type Args = {
  onOpenChange: (open: boolean, details: unknown) => void
  onSave: (name: string) => void
  defaultOpen?: boolean
}

const meta = preview.type<{ args: Args }>().meta({
  title: "Foundations/Dialog",
  args: { onOpenChange: fn(), onSave: fn() },
  // A dialog with a form, as the add-partner and rename dialogs build one.
  render: ({ onOpenChange, onSave, defaultOpen }) => (
    <Dialog onOpenChange={onOpenChange} defaultOpen={defaultOpen}>
      <DialogTrigger render={<Button variant="outline" />}>Rename product</DialogTrigger>
      <DialogContent>
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault()
            onSave(String(new FormData(event.currentTarget).get("name")))
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename product</DialogTitle>
            <DialogDescription>Suppliers see the new name on their next purchase order.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="product-name">Name</FieldLabel>
              <Input id="product-name" name="name" defaultValue="Harbor Tote" />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
})

export const Default = meta.story({
  play: async ({ canvas, args }) => {
    const trigger = canvas.getByRole("button", { name: "Rename product" })
    await userEvent.click(trigger)
    const dialog = await shownDialog("Rename product")
    await expect(dialog.element).toHaveAccessibleDescription("Suppliers see the new name on their next purchase order.")
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(true, expect.anything())

    const input = dialog.getByRole("textbox", { name: "Name" })
    await userEvent.clear(input)
    await userEvent.type(input, "Harbor Tote Large")
    await userEvent.click(dialog.getByRole("button", { name: "Save" }))
    await expect(args.onSave).toHaveBeenCalledWith("Harbor Tote Large")

    // Cancel closes it and hands focus back to the trigger.
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(false, expect.anything())
    await expect(trigger).toHaveFocus()
  }
})

export const CloseButton = meta.story({
  args: { defaultOpen: true },
  play: async ({ args }) => {
    const dialog = await shownDialog("Rename product")
    await userEvent.click(dialog.getByRole("button", { name: "Close" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    await expect(args.onOpenChange).toHaveBeenCalledWith(false, expect.anything())
  }
})

export const EscapeCloses = meta.story({
  args: { defaultOpen: true },
  play: async ({ args }) => {
    await shownDialog("Rename product")
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    await expect(args.onSave).not.toHaveBeenCalled()
  }
})

// Details with only a footer close button, and no corner close button.
export const FooterClose = meta.story({
  render: ({ onOpenChange }) => (
    <Dialog defaultOpen onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Carton sizes</DialogTitle>
          <DialogDescription>Lotus Manufacturing packs 24 units to a carton.</DialogDescription>
        </DialogHeader>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  ),
  play: async ({ args }) => {
    const dialog = await shownDialog("Carton sizes")
    // getByRole finds exactly one: the footer's.
    await userEvent.click(dialog.getByRole("button", { name: "Close" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(false, expect.anything())
  }
})
