import { Trash2 } from "lucide-react"
import { useState } from "react"
import { expect, fn, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { shownAlertDialog } from "@/stories/play"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger
} from "./alert-dialog"
import { Button } from "./button"

// A confirmation as the app's delete buttons build one: the action does its work, then closes the dialog.
function DeleteDraft({ onAction, onOpenChange }: { onAction: () => void; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false)
  const change = (next: boolean) => {
    setOpen(next)
    onOpenChange?.(next)
  }
  return (
    <AlertDialog open={open} onOpenChange={change}>
      <AlertDialogTrigger render={<Button variant="destructive" />}>Delete draft</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
          <AlertDialogDescription>
            The purchase order for Lotus Manufacturing goes away for good.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              onAction()
              change(false)
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

const meta = preview.type<{ args: { onAction: () => void; onToggle: (open: boolean) => void } }>().meta({
  title: "Foundations/Alert dialog",
  args: { onAction: fn(), onToggle: fn() },
  render: ({ onAction, onToggle }) => <DeleteDraft onAction={onAction} onOpenChange={onToggle} />
})

export const Default = meta.story({
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Delete draft" }))
    const dialog = await shownAlertDialog("Delete this draft?")
    await expect(dialog.element).toHaveAccessibleDescription(
      "The purchase order for Lotus Manufacturing goes away for good."
    )
    await expect(dialog.element).toHaveAttribute("data-size", "default")
    await expect(args.onToggle).toHaveBeenLastCalledWith(true)

    // Cancel closes it without deleting.
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
    await expect(args.onToggle).toHaveBeenLastCalledWith(false)
    await expect(args.onAction).not.toHaveBeenCalled()
  }
})

export const Confirm = meta.story({
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Delete draft" }))
    await userEvent.click(await screen.findByRole("button", { name: "Delete" }))
    await expect(args.onAction).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
  }
})

export const EscapeCloses = meta.story({
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Delete draft" }))
    await shownAlertDialog()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
    await expect(canvas.getByRole("button", { name: "Delete draft" })).toHaveFocus()
    await expect(args.onAction).not.toHaveBeenCalled()
  }
})

// A small confirmation with an icon, as disconnecting a store asks.
export const SmallWithMedia = meta.story({
  render: ({ onAction }) => (
    <AlertDialog defaultOpen>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Trash2 />
          </AlertDialogMedia>
          <AlertDialogTitle>Disconnect Shopify?</AlertDialogTitle>
          <AlertDialogDescription>New orders stop copying to Copacker.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onAction}>
            Disconnect
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ),
  play: async ({ args }) => {
    const dialog = await shownAlertDialog("Disconnect Shopify?")
    await expect(dialog.element).toHaveAttribute("data-size", "sm")
    await expect(dialog.element.querySelector("[data-slot=alert-dialog-media] svg")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Disconnect" }))
    await expect(args.onAction).toHaveBeenCalledOnce()
  }
})
