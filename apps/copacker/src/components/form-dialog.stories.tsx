import { Button, DialogTrigger } from "@buildkitgg/shadcn"
import { useState } from "react"
import { expect, fn, screen, userEvent, waitFor } from "storybook/test"
import { z } from "zod"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { type ActionRequest, recordActions, failWith } from "@/stories/actions"
import { shownDialog } from "@/stories/play"
import { FormInput } from "./form-controls"
import { FormDialog } from "./form-dialog"

const sent: ActionRequest[] = []
const saved = fn()
const schema = z.object({ name: z.string().trim().min(2).max(120) })

// Renaming a supplier from a button on its page.
function Rename({ requireChange = false }: { requireChange?: boolean }) {
  return (
    <FormDialog
      trigger={<DialogTrigger render={<Button variant="outline" />}>Rename</DialogTrigger>}
      title="Rename Lotus Manufacturing"
      description="Purchase orders already sent keep the name they were sent with."
      submitLabel="Save"
      requireChange={requireChange}
      form={{
        schema,
        action: "supplier.update",
        defaultValues: { name: "Lotus Manufacturing" },
        toPayload: (values) => ({ id: "supplier-lotus", ...values }),
        onSuccess: (_, values) => saved(values)
      }}
    >
      <FormInput name="name" required label="Supplier name" autoComplete="off" />
    </FormDialog>
  )
}

// A menu item opens it through state its row holds.
function FromMenu() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Edit Lotus Manufacturing
      </Button>
      <p>{open ? "Open" : "Closed"}</p>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Edit Lotus Manufacturing"
        size="lg"
        submitLabel="Save"
        form={{ schema, action: "supplier.update", defaultValues: { name: "Lotus Manufacturing" } }}
      >
        <FormInput name="name" required label="Supplier name" autoComplete="off" />
      </FormDialog>
    </>
  )
}

const meta = preview.meta({
  title: "Components/Forms/Form dialog",
  component: Rename,
  beforeEach: ({ msw }) => {
    saved.mockClear()
    msw.use(recordActions(sent))
  }
})

// It saves, waits for the page to show the change, then closes.
export const Save = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Rename" }))
    const dialog = await shownDialog("Rename Lotus Manufacturing")
    await expect(dialog.element).toHaveAccessibleDescription(
      "Purchase orders already sent keep the name they were sent with."
    )
    const name = dialog.getByRole("textbox", { name: "Supplier name" })
    await userEvent.clear(name)
    await userEvent.type(name, "Lotus Textiles")
    await userEvent.click(dialog.getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(sent).toEqual([{ action: "supplier.update", data: { id: "supplier-lotus", name: "Lotus Textiles" } }])
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await expect(getStoryRouter().invalidate).toHaveBeenCalledWith({ sync: true })
    await expect(saved).toHaveBeenCalledWith({ name: "Lotus Textiles" })
  }
})

// A failure shows in the dialog, which stays open to try again.
export const Fails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, failWith("Another supplier is already named Lotus Textiles.")))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Rename" }))
    const dialog = await shownDialog()
    await userEvent.click(dialog.getByRole("button", { name: "Save" }))
    await expect(await dialog.findByRole("alert")).toHaveTextContent(
      "Another supplier is already named Lotus Textiles."
    )
    await expect(saved).not.toHaveBeenCalled()
  }
})

// Each opening starts from the saved name, without the last one's typing, error or checks.
export const StartsFresh = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Rename" }))
    let dialog = await shownDialog()
    await userEvent.clear(dialog.getByRole("textbox", { name: "Supplier name" }))
    await userEvent.click(dialog.getByRole("button", { name: "Save" }))
    await expect(await dialog.findByText("Fill in this field")).toBeVisible()
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await userEvent.click(canvas.getByRole("button", { name: "Rename" }))
    dialog = await shownDialog()
    await expect(dialog.getByRole("textbox", { name: "Supplier name" })).toHaveValue("Lotus Manufacturing")
    await expect(dialog.queryByText("Fill in this field")).toBeNull()
    await expect(sent).toHaveLength(0)
  }
})

// Save can wait for a change.
export const RequireChange = meta.story({
  args: { requireChange: true },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Rename" }))
    const dialog = await shownDialog()
    const save = dialog.getByRole("button", { name: "Save" })
    await expect(save).toBeDisabled()
    await userEvent.type(dialog.getByRole("textbox", { name: "Supplier name" }), " Co.")
    await expect(save).toBeEnabled()
  }
})

// Opened and closed through `open`, as from a row's menu, and wide enough for an address.
export const Controlled = meta.story({
  render: () => <FromMenu />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Edit Lotus Manufacturing" }))
    const dialog = await shownDialog("Edit Lotus Manufacturing")
    await expect(canvas.getByText("Open")).toBeVisible()
    await userEvent.click(dialog.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await expect(canvas.getByText("Closed")).toBeVisible()
  }
})
