import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { http, HttpResponse } from "msw"
import { expect, screen, userEvent, waitFor } from "storybook/test"
import { z } from "zod"
import preview from "#.storybook/preview"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { useActionForm } from "@/hooks/useActionForm"
import { held, recordActions } from "@/stories/fixtures/shared"
import { ActionButton, ActionForm, FormError, SubmitButton } from "./actions"
import { FormInput } from "./form-controls"

const meta = preview.meta({
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
    await expect(await canvas.findByText("Reminder sent")).toBeVisible()
    await expect(posted).toEqual([{ action: "order.remind", data: { orderId: "order-1045" } }])
    await expect(getRouter().refresh).toHaveBeenCalled()
    await expect(getRouter().push).not.toHaveBeenCalled()
  }
})

export const Redirects = meta.story({
  args: { action: "order.duplicate", children: "Duplicate", variant: "outline", size: "sm", successMessage: undefined },
  play: async ({ canvas, msw }) => {
    recordActions(msw, () => HttpResponse.json({ ok: true, redirect: "/orders/order-1047" }))
    await userEvent.click(canvas.getByRole("button", { name: "Duplicate" }))
    await waitFor(() => expect(getRouter().push).toHaveBeenCalledWith("/orders/order-1047"))
  }
})

export const Fails = meta.story({
  args: { variant: "destructive" },
  play: async ({ canvas, msw }) => {
    recordActions(msw, () => HttpResponse.json({ error: "The supplier has no email address" }, { status: 400 }))
    await userEvent.click(canvas.getByRole("button", { name: "Send reminder" }))
    await expect(await canvas.findByRole("alert")).toHaveTextContent("The supplier has no email address")
    await expect(canvas.queryByText("Reminder sent")).toBeNull()
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

export const Errors = meta.story({
  render: () => (
    <div className="flex flex-col gap-3">
      {/* A full message key shows in the person's language; other text shows as it is. */}
      <FormError message="orders.timeline.comment.required" />
      <FormError message={"Line 2 has no SKU\nLine 3 has no quantity"} />
      <FormError />
    </div>
  ),
  play: async ({ canvas }) => {
    const alerts = canvas.getAllByRole("alert")
    await expect(alerts).toHaveLength(2)
    await expect(alerts[0]).toHaveTextContent("Write a comment")
    await expect(alerts[1]).toHaveTextContent("Line 2 has no SKU")
  }
})

export const SubmitButtons = meta.story({
  render: () => (
    <div className="flex gap-2">
      <SubmitButton pending={false}>Save</SubmitButton>
      <SubmitButton pending>Saving</SubmitButton>
      <SubmitButton pending={false} disabled>
        Nothing to save
      </SubmitButton>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Save" })).toBeEnabled()
    await expect(canvas.getByRole("button", { name: "Saving" })).toBeDisabled()
    await expect(canvas.getByRole("button", { name: "Saving" })).toHaveAttribute("aria-busy", "true")
    await expect(canvas.getByRole("button", { name: "Nothing to save" })).toBeDisabled()
  }
})

const supplierSchema = z.object({ name: z.string().trim().min(1) })

// A form as pages build them with useActionForm: a supplier's name, saved with supplier.rename.
function SupplierForm({ dialog = false }: { dialog?: boolean }) {
  const { form, submit } = useActionForm({
    schema: supplierSchema,
    action: "supplier.rename",
    defaultValues: { name: "Lotus Manufacturing" },
    toPayload: (values) => ({ id: "supplier-lotus", name: values.name }),
    keepSaved: true
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
    await waitFor(() => expect(getRouter().refresh).toHaveBeenCalled())
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
