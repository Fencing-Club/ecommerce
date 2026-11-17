import { Dialog, DialogHeader, DialogTitle, Sheet, SheetHeader, SheetTitle } from "@buildkitgg/shadcn"
import { expect, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { DialogContent, SheetContent } from "./overlay-content"

const meta = preview.meta({ title: "Components/Forms/Overlay content" })

function OpenDialog({ showCloseButton }: { showCloseButton?: boolean }) {
  return (
    <Dialog defaultOpen>
      <DialogContent showCloseButton={showCloseButton}>
        <DialogHeader>
          <DialogTitle>Rename supplier</DialogTitle>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  )
}

// The dialog's close button is labelled in the person's language and closes it.
export const DialogClose = meta.story({
  render: () => <OpenDialog />,
  play: async () => {
    await userEvent.click(await screen.findByRole("button", { name: "Close" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  }
})

// In Urdu the close button reads in Urdu and sits at the dialog's start corner, the left.
export const DialogCloseInUrdu = meta.story({
  globals: { locale: "ur" },
  render: () => <OpenDialog />,
  play: async () => {
    const dialog = await screen.findByRole("dialog")
    const close = await screen.findByRole("button", { name: "بند کریں" })
    await expect(close.getBoundingClientRect().left - dialog.getBoundingClientRect().left).toBeLessThan(
      dialog.getBoundingClientRect().width / 2
    )
  }
})

// A dialog that closes some other way leaves the button out.
export const DialogWithoutClose = meta.story({
  render: () => <OpenDialog showCloseButton={false} />,
  play: async () => {
    await screen.findByRole("dialog")
    await expect(screen.queryByRole("button", { name: "Close" })).toBeNull()
  }
})

// The sheet's close button is labelled in the person's language and closes it.
export const SheetClose = meta.story({
  render: () => (
    <Sheet defaultOpen>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Product details</SheetTitle>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  ),
  play: async () => {
    await userEvent.click(await screen.findByRole("button", { name: "Close" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  }
})
