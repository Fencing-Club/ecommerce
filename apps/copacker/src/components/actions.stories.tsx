import { http, HttpResponse } from "msw"
import { expect, fn, screen, userEvent, waitFor } from "storybook/test"
import { z } from "zod"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { useActionForm } from "@/hooks/useActionForm"
import { held, recordActions } from "@/stories/fixtures/shared"
import { ActionForm } from "./action-form"
import { ActionButton } from "./actions"
import { FormInput } from "./form-controls"

const meta = preview.meta({
  title: "Components/Forms/Actions",
  component: ActionButton,
  args: {
    action: "order.remind",
    data: { orderId: "order-1045" },
    children: "Send reminder",
    successMessage: "Reminder sent"
  }
})

export const Succeeds = meta.story({
  play: async ({ canvas, msw }) => {
    const posted = recordActions(msw)
    await userEvent.click(canvas.getByRole("button", { name: "Send reminder" }))
    // The outcome shows as a toast, outside the button's row.
    await expect(await screen.findByText("Reminder sent")).toBeVisible()
    await expect(posted).toEqual([{ action: "order.remind", data: { orderId: "order-1045" } }])
    await expect(getStoryRouter().invalidate).toHaveBeenCalled()
    await expect(getStoryRouter().navigate).not.toHaveBeenCalled()
  }
})

export const Redirects = meta.story({
  args: { action: "order.duplicate", children: "Duplicate", variant: "outline", size: "sm", successMessage: undefined },
  play: async ({ canvas, msw }) => {
    recordActions(msw, () => HttpResponse.json({ ok: true, redirect: "/orders/order-1047" }))
    await userEvent.click(canvas.getByRole("button", { name: "Duplicate" }))
    await waitFor(() => expect(getStoryRouter().navigate).toHaveBeenCalledWith({ href: "/orders/order-1047" }))
  }
})

export const Fails = meta.story({
  args: { variant: "destructive" },
  play: async ({ canvas, msw }) => {
    recordActions(msw, () => HttpResponse.json({ error: "The supplier has no email address" }, { status: 400 }))
    await userEvent.click(canvas.getByRole("button", { name: "Send reminder" }))
    await expect(await screen.findByText("The supplier has no email address")).toBeVisible()
    await expect(screen.queryByText("Reminder sent")).toBeNull()
    // Nothing is added beside the button.
    await expect(canvas.queryByRole("alert")).toBeNull()
  }
})

export const Pending = meta.story({
  play: async ({ canvas, msw }) => {
    // The server doesn't answer, so the button stays busy.
    msw.use(http.post("/api/action", held))
    const button = canvas.getByRole("button", { name: "Send reminder" })
    await userEvent.click(button)
    await waitFor(() => expect(button).toBeDisabled())
    await expect(button).toHaveAttribute("aria-busy", "true")
  }
})

export const WaitsForRefresh = meta.story({
  play: async ({ canvas, msw }) => {
    recordActions(msw)
    const refresh = Promise.withResolvers<void>()
    getStoryRouter().invalidate.mockImplementationOnce(() => refresh.promise)
    const button = canvas.getByRole("button", { name: "Send reminder" })
    try {
      await userEvent.click(button)
      await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalledWith({ sync: true }))
      await expect(button).toBeDisabled()
      await expect(screen.queryByText("Reminder sent")).toBeNull()
      refresh.resolve()
      await expect(await screen.findByText("Reminder sent")).toBeVisible()
      await expect(button).toBeEnabled()
    } finally {
      refresh.resolve()
    }
  }
})

const supplierSchema = z.object({ name: z.string().trim().min(1) })

// A form as pages build them with useActionForm: a supplier's name, saved with supplier.rename.
function SupplierForm({ dialog = false, onSuccess }: { dialog?: boolean; onSuccess?: () => void }) {
  const { form, submit } = useActionForm({
    schema: supplierSchema,
    action: "supplier.rename",
    defaultValues: { name: "Lotus Manufacturing" },
    toPayload: (values) => ({ id: "supplier-lotus", name: values.name }),
    keepSaved: true,
    onSuccess
  })
  return (
    <ActionForm form={form} onSubmit={submit} label="Save" dialog={dialog}>
      <FormInput name="name" label="Supplier name" required />
    </ActionForm>
  )
}

export const Form = meta.story({
  render: () => <SupplierForm />,
  play: async ({ canvas, msw }) => {
    const posted = recordActions(msw)
    const save = canvas.getByRole("button", { name: "Save" })
    // Nothing to save until the form changes.
    await expect(save).toBeDisabled()
    const input = canvas.getByLabelText(/Supplier name/)
    await userEvent.clear(input)
    await expect(save).toBeEnabled()
    await userEvent.click(save)
    await expect(await canvas.findByText("Fill in this field")).toBeVisible()
    await expect(input).toHaveAttribute("aria-invalid", "true")
    await expect(posted).toEqual([])
    await userEvent.type(input, "Lotus Manufacturing Co.")
    await userEvent.click(save)
    await waitFor(() =>
      expect(posted).toEqual([
        { action: "supplier.rename", data: { id: "supplier-lotus", name: "Lotus Manufacturing Co." } }
      ])
    )
    await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalled())
  }
})

export const FormServerError = meta.story({
  render: () => <SupplierForm />,
  play: async ({ canvas, msw }) => {
    recordActions(msw, () => HttpResponse.json({ error: "A supplier with this name exists" }, { status: 409 }))
    await userEvent.type(canvas.getByLabelText(/Supplier name/), " Ltd")
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await expect(await canvas.findByRole("alert")).toHaveTextContent("A supplier with this name exists")
  }
})

const formSucceeded = fn()
export const FormWaitsForRefresh = meta.story({
  render: () => <SupplierForm onSuccess={formSucceeded} />,
  play: async ({ canvas, msw }) => {
    recordActions(msw)
    formSucceeded.mockClear()
    const refresh = Promise.withResolvers<void>()
    getStoryRouter().invalidate.mockImplementationOnce(() => refresh.promise)
    const save = canvas.getByRole("button", { name: "Save" })
    try {
      await userEvent.type(canvas.getByLabelText(/Supplier name/), " Ltd")
      await userEvent.click(save)
      await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalledWith({ sync: true }))
      await expect(save).toBeDisabled()
      await expect(save).toHaveAttribute("aria-busy", "true")
      await expect(formSucceeded).not.toHaveBeenCalled()
      refresh.resolve()
      await waitFor(() => expect(formSucceeded).toHaveBeenCalledOnce())
      await expect(save).not.toHaveAttribute("aria-busy", "true")
    } finally {
      refresh.resolve()
    }
  }
})

export const FormInDialog = meta.story({
  render: () => (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>Rename supplier</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename supplier</DialogTitle>
        </DialogHeader>
        <SupplierForm dialog />
      </DialogContent>
    </Dialog>
  ),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Rename supplier" }))
    const dialog = await screen.findByRole("dialog")
    // In a dialog, Save is ready at once and Cancel closes it.
    await expect(screen.getByRole("button", { name: "Save" })).toBeEnabled()
    await expect(dialog).toContainElement(screen.getByLabelText(/Supplier name/))
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  }
})
