import { Button, Dialog, DialogContent, DialogTrigger } from "@buildkitgg/shadcn-baseui-kit"
import { useForm } from "react-hook-form"
import { expect, fn, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { shownDialog } from "@/stories/play"
import { ActionForm, keepEnterFromSubmitting } from "./action-form"
import { FormInput } from "./form-controls"

const submitted = fn()

// A form the way useActionForm runs one: it saves, keeps what was saved, or shows the server's error.
function Form({
  layout,
  requireChange = false,
  fails = false
}: {
  layout?: "inline" | "dialog" | "card" | "auth"
  requireChange?: boolean
  fails?: boolean
}) {
  const form = useForm({ defaultValues: { name: "" } })
  const submit = form.handleSubmit((values) => {
    submitted(values)
    if (fails) {
      form.setError("root.server", { message: "Harbor Goods is already one of your suppliers." })
    } else if (layout !== "auth") {
      form.reset(values)
    }
  })
  return (
    <ActionForm form={form} onSubmit={submit} layout={layout} requireChange={requireChange}>
      <FormInput name="name" label="Name" />
    </ActionForm>
  )
}

const meta = preview.meta({
  title: "Components/Forms/Action form",
  component: Form,
  beforeEach: () => {
    submitted.mockClear()
  }
})

// On a page, Save is under the fields; this one waits for a change.
export const Inline = meta.story({
  args: { requireChange: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled()
    await userEvent.type(canvas.getByRole("textbox", { name: "Name" }), "Harbor Goods")
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await expect(submitted).toHaveBeenCalledWith({ name: "Harbor Goods" })
  }
})

// Without requireChange, the button is ready at once, as approving needs no change.
export const InlineReady = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Save" })).toBeEnabled()
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await expect(submitted).toHaveBeenCalledWith({ name: "" })
  }
})

// The server's error shows above the button, from the form's own state.
export const ServerError = meta.story({
  args: { fails: true },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole("textbox", { name: "Name" }), "Harbor Goods")
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Harbor Goods is already one of your suppliers.")
  }
})

// A settings card: Save is outlined until something changes, then says Saved.
export const Card = meta.story({
  args: { layout: "card", requireChange: true },
  play: async ({ canvas }) => {
    const save = canvas.getByRole("button", { name: "Save" })
    await expect(save).toBeDisabled()
    await userEvent.type(canvas.getByRole("textbox", { name: "Name" }), "Harbor Goods")
    await expect(save).toBeEnabled()
    await userEvent.click(save)
    await expect(await canvas.findByRole("status")).toHaveTextContent("Saved")
    await expect(save).toBeDisabled()
  }
})

// The sign-in pages' button spins until the next page replaces this one.
export const Auth = meta.story({
  args: { layout: "auth" },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole("textbox", { name: "Name" }), "Harbor Goods")
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(submitted).toHaveBeenCalledOnce())
    await expect(canvas.getByRole("button", { name: "Save" })).toHaveAttribute("aria-busy", "true")
  }
})

const outerSubmitted = fn()

// In a dialog, Cancel and the button sit in the footer. A dialog opened from inside another form, such as a shipment's
// packing, submits only its own form.
export const InDialog = meta.story({
  render: () => (
    <form
      aria-label="Packing"
      onSubmit={(event) => {
        event.preventDefault()
        outerSubmitted()
      }}
    >
      <Dialog>
        <DialogTrigger render={<Button variant="outline" />}>Rename</DialogTrigger>
        <DialogContent>
          <Form layout="dialog" />
        </DialogContent>
      </Dialog>
    </form>
  ),
  play: async ({ canvas }) => {
    outerSubmitted.mockClear()
    await userEvent.click(canvas.getByRole("button", { name: "Rename" }))
    const dialog = await shownDialog()
    await userEvent.type(dialog.getByRole("textbox", { name: "Name" }), "Harbor Goods")
    await userEvent.click(dialog.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(submitted).toHaveBeenCalledWith({ name: "Harbor Goods" }))
    await expect(outerSubmitted).not.toHaveBeenCalled()
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  }
})

const enterSubmitted = fn()

// Enter in a text field doesn't submit a form only its button should; the button still does.
export const EnterKeptFromSubmitting = meta.story({
  render: () => (
    // The key handler is delegated from the fields and only keeps Enter from submitting.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <form
      onKeyDown={keepEnterFromSubmitting}
      onSubmit={(event) => {
        event.preventDefault()
        enterSubmitted()
      }}
      className="flex gap-2"
    >
      <input aria-label="Reference" className="rounded-md border px-2" />
      <Button type="submit">Finish packing</Button>
    </form>
  ),
  play: async ({ canvas }) => {
    enterSubmitted.mockClear()
    await userEvent.type(canvas.getByRole("textbox", { name: "Reference" }), "PO-1047{Enter}")
    await expect(enterSubmitted).not.toHaveBeenCalled()
    await userEvent.click(canvas.getByRole("button", { name: "Finish packing" }))
    await expect(enterSubmitted).toHaveBeenCalledOnce()
  }
})
