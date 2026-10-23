import { HttpResponse } from "msw/http"
import { useState } from "react"
import { expect, fn, screen, userEvent, waitFor } from "storybook/test"
import { finishSignIn } from "#.storybook/mocks/auth-navigation"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { type ActionRequest, recordActions, failWith, redirectTo } from "@/stories/actions"
import { shownAlertDialog } from "@/stories/play"
import { ConfirmDialog } from "./confirm-dialog"

const sent: ActionRequest[] = []
const done = fn()

// A row's menu item opens the dialog by setting `open`.
function FromMenu(props: Partial<React.ComponentProps<typeof ConfirmDialog>>) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Close PO-1042
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Close PO-1042?"
        description="Nothing more is expected for it. You can still see it and its shipments."
        confirmLabel="Close purchase order"
        tone="default"
        action="order.close"
        data={{ id: "order-1042" }}
        fallback="Couldn’t close PO-1042"
        onDone={done}
        {...props}
      />
    </>
  )
}

// Deleting a workspace asks for its name, and a full load follows.
function TypeToConfirm() {
  const [open, setOpen] = useState(false)
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={<AlertDialogTrigger render={<Button variant="destructive" />}>Delete workspace</AlertDialogTrigger>}
      title="Delete Harbor Goods?"
      description="Its purchase orders, products, connections, and team are deleted for everyone."
      confirmLabel="Delete workspace"
      tone="destructive"
      action="workspace.delete"
      data={{}}
      navigation="document"
      confirmText={{ name: "name", label: "Workspace name", expected: "Harbor Goods" }}
    />
  )
}

const meta = preview.meta({
  title: "Components/Forms/Confirm dialog",
  render: () => <FromMenu />,
  beforeEach: ({ msw }) => {
    done.mockClear()
    msw.use(recordActions(sent))
  }
})

export const Confirms = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Close PO-1042" }))
    const dialog = await shownAlertDialog("Close PO-1042?")
    await expect(dialog.element).toHaveTextContent("Nothing more is expected for it.")
    await userEvent.click(dialog.getByRole("button", { name: "Close purchase order" }))
    await waitFor(() => expect(sent).toEqual([{ action: "order.close", data: { id: "order-1042" } }]))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    await expect(getStoryRouter().invalidate).toHaveBeenCalledWith({ sync: true })
    await expect(done).toHaveBeenCalledOnce()
  }
})

// The button spins until the page shows the result, then the dialog closes onto it.
export const WaitsForRefresh = meta.story({
  play: async ({ canvas }) => {
    const refresh = Promise.withResolvers<void>()
    getStoryRouter().invalidate.mockImplementationOnce(() => refresh.promise)
    try {
      await userEvent.click(canvas.getByRole("button", { name: "Close PO-1042" }))
      const dialog = await shownAlertDialog()
      const confirm = dialog.getByRole("button", { name: "Close purchase order" })
      await userEvent.click(confirm)
      await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalledWith({ sync: true }))
      await expect(confirm).toHaveAttribute("aria-busy", "true")
      await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled()
      await expect(done).not.toHaveBeenCalled()
      refresh.resolve()
      await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
      await expect(done).toHaveBeenCalledOnce()
    } finally {
      refresh.resolve()
    }
  }
})

// A failure stays in the dialog to try again, and opening it again starts without it.
export const Fails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, failWith("PO-1042 has a shipment on its way.")))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Close PO-1042" }))
    const dialog = await shownAlertDialog()
    await userEvent.click(dialog.getByRole("button", { name: "Close purchase order" }))
    await expect(await dialog.findByRole("alert")).toHaveTextContent("PO-1042 has a shipment on its way.")
    await expect(dialog.getByRole("button", { name: "Close purchase order" })).toBeEnabled()
    await expect(getStoryRouter().invalidate).not.toHaveBeenCalled()
    await expect(done).not.toHaveBeenCalled()
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    await userEvent.click(canvas.getByRole("button", { name: "Close PO-1042" }))
    const reopened = await shownAlertDialog()
    await expect(reopened.queryByRole("alert")).toBeNull()
  }
})

// Without the server's reason, the dialog's own message names what failed.
export const FailsWithoutReason = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, () => HttpResponse.json({}, { status: 500 })))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Close PO-1042" }))
    const dialog = await shownAlertDialog()
    await userEvent.click(dialog.getByRole("button", { name: "Close purchase order" }))
    await expect(await dialog.findByRole("alert")).toHaveTextContent("Couldn’t close PO-1042")
  }
})

// A destructive confirmation has a red button.
export const Destructive = meta.story({
  render: () => (
    <FromMenu
      title="Remove Sam Okafor?"
      description="They lose access to Harbor Goods right away."
      confirmLabel="Remove"
      tone="destructive"
      action="team.remove"
      data={{ userId: "user_sam" }}
    />
  ),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Close PO-1042" }))
    const dialog = await shownAlertDialog("Remove Sam Okafor?")
    const remove = dialog.getByRole("button", { name: "Remove" })
    await expect(remove).toBeVisible()
    await userEvent.click(remove)
    await waitFor(() => expect(sent).toEqual([{ action: "team.remove", data: { userId: "user_sam" } }]))
  }
})

// Typing what's deleted enables the button, without regard to case or the spaces around it.
export const TypeToConfirmDeletes = meta.story({
  render: () => <TypeToConfirm />,
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, redirectTo("/")))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Delete workspace" }))
    const dialog = await shownAlertDialog("Delete Harbor Goods?")
    const field = dialog.getByLabelText("Workspace name")
    const confirm = dialog.getByRole("button", { name: "Delete workspace" })
    await expect(field).toHaveAttribute("placeholder", "Harbor Goods")
    await expect(confirm).toBeDisabled()
    await userEvent.type(field, " harbor goods ")
    await expect(confirm).toBeEnabled()
    await userEvent.click(confirm)
    await waitFor(() => expect(sent).toEqual([{ action: "workspace.delete", data: { name: "harbor goods" } }]))
    // A new document loads, so the dialog stays busy until it replaces the page.
    await waitFor(() => expect(finishSignIn).toHaveBeenCalledWith("/"))
    await expect(confirm).toHaveAttribute("aria-busy", "true")
    await expect(screen.getByRole("alertdialog")).toBeVisible()
    await expect(getStoryRouter().invalidate).not.toHaveBeenCalled()
  }
})

// Cancelling drops what was typed.
export const TypeToConfirmCancels = meta.story({
  render: () => <TypeToConfirm />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Delete workspace" }))
    const dialog = await shownAlertDialog()
    await userEvent.type(dialog.getByLabelText("Workspace name"), "Harbor Goods")
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    await userEvent.click(canvas.getByRole("button", { name: "Delete workspace" }))
    await expect((await shownAlertDialog()).getByLabelText("Workspace name")).toHaveValue("")
    await expect(sent).toEqual([])
  }
})
