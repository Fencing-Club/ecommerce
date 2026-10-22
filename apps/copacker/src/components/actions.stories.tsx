import { http } from "msw/http"
import { expect, fn, screen, userEvent, waitFor } from "storybook/test"
import { z } from "zod"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { useActionForm } from "@/hooks/use-action-form"
import { held, type ActionRequest, recordActions, failWith, redirectTo } from "@/stories/actions"
import { shownDialog } from "@/stories/play"
import { ActionForm } from "./action-form"
import { ActionButton } from "./actions"
import { FormInput } from "./form-controls"

const sent: ActionRequest[] = []

const meta = preview.meta({
  title: "Components/Forms/Actions",
  component: ActionButton,
  args: {
    action: "shipment.ship" as const,
    data: { id: "shipment-1" },
    children: "Mark shipped"
  }
})

export const Succeeds = meta.story({
  play: async ({ canvas, msw }) => {
    msw.use(recordActions(sent))
    const button = canvas.getByRole("button", { name: "Mark shipped" })
    await userEvent.click(button)
    await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalledWith({ sync: true }))
    await expect(sent).toEqual([{ action: "shipment.ship", data: { id: "shipment-1" } }])
    await expect(getStoryRouter().navigate).not.toHaveBeenCalled()
    await waitFor(() => expect(button).toBeEnabled())
  }
})

// A redirect opens the next page, which loads its data fresh, so the page isn't refreshed as well.
export const Redirects = meta.story({
  args: { action: "shipment.create", data: { id: "order-1045" }, children: "Prepare shipment", variant: "outline" },
  play: async ({ canvas, msw }) => {
    msw.use(recordActions(sent, redirectTo("/shipments/shipment-2")))
    await userEvent.click(canvas.getByRole("button", { name: "Prepare shipment" }))
    await waitFor(() => expect(getStoryRouter().navigate).toHaveBeenCalledWith({ href: "/shipments/shipment-2" }))
    await expect(getStoryRouter().invalidate).not.toHaveBeenCalled()
  }
})

export const Fails = meta.story({
  args: { variant: "destructive" },
  play: async ({ canvas, msw }) => {
    msw.use(recordActions(sent, failWith("Pack the shipment first")))
    await userEvent.click(canvas.getByRole("button", { name: "Mark shipped" }))
    // The failure shows as a toast, outside the button's row.
    await expect(await screen.findByText("Pack the shipment first")).toBeVisible()
    await expect(canvas.queryByRole("alert")).toBeNull()
    await expect(getStoryRouter().invalidate).not.toHaveBeenCalled()
    await expect(canvas.getByRole("button", { name: "Mark shipped" })).toBeEnabled()
  }
})

export const Pending = meta.story({
  play: async ({ canvas, msw }) => {
    // The server doesn't answer, so the button stays busy.
    msw.use(http.post("/api/action", held))
    const button = canvas.getByRole("button", { name: "Mark shipped" })
    await userEvent.click(button)
    await waitFor(() => expect(button).toBeDisabled())
    await expect(button).toHaveAttribute("aria-busy", "true")
  }
})

export const WaitsForRefresh = meta.story({
  play: async ({ canvas, msw }) => {
    msw.use(recordActions(sent))
    const refresh = Promise.withResolvers<void>()
    getStoryRouter().invalidate.mockImplementationOnce(() => refresh.promise)
    const button = canvas.getByRole("button", { name: "Mark shipped" })
    try {
      await userEvent.click(button)
      await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalledWith({ sync: true }))
      // It stays busy until the page shows the result.
      await expect(button).toBeDisabled()
      await expect(button).toHaveAttribute("aria-busy", "true")
      refresh.resolve()
      await waitFor(() => expect(button).toBeEnabled())
    } finally {
      refresh.resolve()
    }
  }
})

const supplierSchema = z.object({ name: z.string().trim().min(1) })

// A form as pages build them with useActionForm: a supplier's name, saved with supplier.update.
function SupplierForm({ dialog = false, onSuccess }: { dialog?: boolean; onSuccess?: () => void }) {
  const { form, submit } = useActionForm({
    schema: supplierSchema,
    action: "supplier.update",
    defaultValues: { name: "Lotus Manufacturing" },
    toPayload: (values) => ({ id: "supplier-lotus", name: values.name }),
    keepSaved: true,
    onSuccess
  })
  return (
    <ActionForm
      form={form}
      onSubmit={submit}
      label="Save"
      layout={dialog ? "dialog" : "inline"}
      requireChange={!dialog}
    >
      <FormInput name="name" label="Supplier name" required />
    </ActionForm>
  )
}

export const Form = meta.story({
  render: () => <SupplierForm />,
  play: async ({ canvas, msw }) => {
    msw.use(recordActions(sent))
    const save = canvas.getByRole("button", { name: "Save" })
    // Nothing to save until the form changes.
    await expect(save).toBeDisabled()
    const input = canvas.getByLabelText(/Supplier name/)
    await userEvent.clear(input)
    await expect(save).toBeEnabled()
    await userEvent.click(save)
    await expect(await canvas.findByText("Fill in this field")).toBeVisible()
    await expect(input).toHaveAttribute("aria-invalid", "true")
    await expect(sent).toEqual([])
    await userEvent.type(input, "Lotus Manufacturing Co.")
    await userEvent.click(save)
    await waitFor(() =>
      expect(sent).toEqual([
        { action: "supplier.update", data: { id: "supplier-lotus", name: "Lotus Manufacturing Co." } }
      ])
    )
    await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalled())
  }
})

export const FormServerError = meta.story({
  render: () => <SupplierForm />,
  play: async ({ canvas, msw }) => {
    msw.use(recordActions(sent, failWith("A supplier with this name exists", 409)))
    await userEvent.type(canvas.getByLabelText(/Supplier name/), " Ltd")
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await expect(await canvas.findByRole("alert")).toHaveTextContent("A supplier with this name exists")
  }
})

const formSucceeded = fn()
export const FormWaitsForRefresh = meta.story({
  render: () => <SupplierForm onSuccess={formSucceeded} />,
  play: async ({ canvas, msw }) => {
    msw.use(recordActions(sent))
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

// A form whose action redirects opens the next page, which loads fresh, and then finishes.
export const FormRedirects = meta.story({
  render: () => <SupplierForm onSuccess={formSucceeded} />,
  play: async ({ canvas, msw }) => {
    msw.use(recordActions(sent, redirectTo("/partners")))
    formSucceeded.mockClear()
    await userEvent.type(canvas.getByLabelText(/Supplier name/), " Ltd")
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(formSucceeded).toHaveBeenCalledOnce())
    await expect(getStoryRouter().navigate).toHaveBeenCalledWith({ href: "/partners" })
    await expect(getStoryRouter().invalidate).not.toHaveBeenCalled()
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
    const dialog = await shownDialog()
    // In a dialog, Save is ready at once and Cancel closes it.
    await expect(screen.getByRole("button", { name: "Save" })).toBeEnabled()
    await expect(dialog.element).toContainElement(screen.getByLabelText(/Supplier name/))
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  }
})
