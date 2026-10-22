import { zodResolver } from "@hookform/resolvers/zod"
import { FormProvider, useForm } from "react-hook-form"
import { expect, fn, userEvent, waitFor } from "storybook/test"
import { z } from "zod"
import preview from "#.storybook/preview"
import { Button } from "@/components/ui/button"
import { useFormErrorMap } from "@/hooks/use-error-text"
import { DateInput, FormCheckbox, FormInput, FormMoney, FormNumber, FormTextarea } from "./form-controls"

const schema = z.object({
  reference: z.string().trim().min(1),
  pieces: z.number().int().positive(),
  unitPrice: z.number().int().nonnegative(),
  shipBy: z.iso.date(),
  notes: z.string().max(40),
  suffocationWarning: z.boolean()
})

type Values = z.input<typeof schema>

// A purchase order line's fields, each bound to the form by name, as the order builder lays them out.
function LineForm({ values, onSubmit }: { values: Partial<Values>; onSubmit: (values: unknown) => void }) {
  const form = useForm<Values>({
    resolver: zodResolver(schema, { error: useFormErrorMap() }),
    defaultValues: { reference: "", notes: "", shipBy: "", suffocationWarning: false, ...values }
  })
  return (
    <FormProvider {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="grid max-w-xl gap-4 sm:grid-cols-2">
        <FormInput name="reference" label="Reference" required description="As your supplier knows it" />
        <FormInput name="shipBy" label="Ship by" type="date" required />
        <FormNumber name="pieces" label="Units" step="1" min="1" required />
        <FormMoney name="unitPrice" label="Unit price" currency="USD" required />
        <FormTextarea name="notes" label="Notes" className="sm:col-span-2" />
        <FormCheckbox
          name="suffocationWarning"
          label="Suffocation warning"
          description="Printed on each polybag"
          className="sm:col-span-2"
        />
        <div>
          <Button type="submit">Save line</Button>
        </div>
      </form>
    </FormProvider>
  )
}

const meta = preview.meta({
  title: "Components/Forms/Form controls",
  component: LineForm,
  args: { values: {}, onSubmit: fn() }
})

export const Required = meta.story({
  play: async ({ canvas, args }) => {
    // Required fields end in a star.
    await expect(canvas.getByText("Reference").parentElement).toHaveTextContent("Reference*")
    await expect(canvas.getByText("Notes").parentElement).toHaveTextContent(/^Notes$/)
    await userEvent.click(canvas.getByRole("button", { name: "Save line" }))
    await waitFor(() => expect(canvas.getByLabelText(/Reference/)).toHaveAttribute("aria-invalid", "true"))
    await expect(canvas.getAllByText("Fill in this field")).toHaveLength(2)
    await expect(canvas.getAllByText("Enter a number")).toHaveLength(2)
    // A field's hint and its error both describe it.
    await expect(canvas.getByLabelText(/Reference/)).toHaveAccessibleDescription(
      "As your supplier knows it Fill in this field"
    )
    await expect(canvas.getByLabelText(/Ship by/)).toHaveAccessibleDescription("Fill in this field")
    await expect(canvas.getByRole("checkbox", { name: "Suffocation warning" })).toHaveAccessibleDescription(
      "Printed on each polybag"
    )
    await expect(args.onSubmit).not.toHaveBeenCalled()
  }
})

export const FillIn = meta.story({
  play: async ({ canvas, args }) => {
    await userEvent.type(canvas.getByLabelText(/Reference/), "PO-1047")
    await userEvent.type(canvas.getByLabelText(/Ship by/), "2026-11-02")
    const units = canvas.getByLabelText(/Units/)
    await expect(units).toHaveAttribute("inputmode", "numeric")
    await userEvent.type(units, "240")
    const price = canvas.getByLabelText(/Unit price/)
    await expect(price).toHaveAccessibleDescription("$")
    await userEvent.type(price, "1,250.5")
    await userEvent.tab()
    // Money shows with its cents once it's typed.
    await expect(price).toHaveValue("1250.50")
    await userEvent.type(canvas.getByLabelText("Notes"), "Pack in cartons of 24")
    await userEvent.click(canvas.getByRole("checkbox", { name: "Suffocation warning" }))
    await userEvent.click(canvas.getByRole("button", { name: "Save line" }))
    await waitFor(() => expect(args.onSubmit).toHaveBeenCalledOnce())
    await expect(args.onSubmit).toHaveBeenCalledWith(
      {
        reference: "PO-1047",
        shipBy: "2026-11-02",
        pieces: 240,
        unitPrice: 125050,
        notes: "Pack in cartons of 24",
        suffocationWarning: true
      },
      expect.anything()
    )
  }
})

export const Saved = meta.story({
  args: {
    values: {
      reference: "PO-1045",
      shipBy: "2026-10-15",
      pieces: 120,
      unitPrice: 890,
      notes: "Charcoal only",
      suffocationWarning: true
    }
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText(/Reference/)).toHaveValue("PO-1045")
    await expect(canvas.getByLabelText(/Units/)).toHaveValue(120)
    await expect(canvas.getByLabelText(/Unit price/)).toHaveValue("8.90")
    await expect(canvas.getByLabelText(/Ship by/)).toHaveValue("2026-10-15")
    await expect(canvas.getByRole("checkbox", { name: "Suffocation warning" })).toBeChecked()
  }
})

// Emptied, a saved number or amount stays empty instead of showing the saved value again.
export const ClearSaved = meta.story({
  args: { values: { reference: "PO-1045", shipBy: "2026-10-15", pieces: 120, unitPrice: 890 } },
  play: async ({ canvas, args }) => {
    const units = canvas.getByLabelText(/Units/)
    const price = canvas.getByLabelText(/Unit price/)
    await userEvent.clear(units)
    await userEvent.clear(price)
    await userEvent.tab()
    await expect(units).toHaveValue(null)
    await expect(price).toHaveValue("")
    await userEvent.click(canvas.getByRole("button", { name: "Save line" }))
    await waitFor(() => expect(units).toHaveAccessibleDescription("Enter a number"))
    await expect(price).toHaveAccessibleDescription("$ Enter a number")
    await expect(args.onSubmit).not.toHaveBeenCalled()
  }
})

// Money reads in the page's language: in German a comma is the decimal mark and a dot groups thousands. Text that isn't
// an amount stays in view to fix.
export const MoneyTyping = meta.story({
  globals: { locale: "de" },
  play: async ({ canvas, args }) => {
    const price = canvas.getByLabelText(/Unit price/)
    await userEvent.type(price, "78,5")
    await userEvent.tab()
    await expect(price).toHaveValue("78,50")
    await userEvent.clear(price)
    await userEvent.type(price, "1.250,5")
    await userEvent.tab()
    await expect(price).toHaveValue("1250,50")
    await userEvent.clear(price)
    await userEvent.type(price, "about 8")
    await userEvent.tab()
    await expect(price).toHaveValue("about 8")
    await userEvent.click(canvas.getByRole("button", { name: "Save line" }))
    await waitFor(() => expect(price).toHaveAttribute("aria-invalid", "true"))
    await expect(price).toHaveAccessibleDescription("$ Geben Sie eine Zahl ein")
    await expect(args.onSubmit).not.toHaveBeenCalled()
  }
})

export const TooLong = meta.story({
  args: { values: { reference: "PO-1047", shipBy: "2026-11-02", pieces: 10, unitPrice: 100 } },
  play: async ({ canvas, args }) => {
    await userEvent.type(canvas.getByLabelText("Notes"), "Leave every carton unsealed for the inspection")
    await userEvent.click(canvas.getByRole("button", { name: "Save line" }))
    await expect(await canvas.findByText("Use 40 characters or fewer")).toBeVisible()
    await expect(args.onSubmit).not.toHaveBeenCalled()
  }
})

export const DateField = meta.story({
  render: () => <DateInput aria-label="Delivery date" value="" readOnly />,
  play: async ({ canvas }) => {
    const input = canvas.getByLabelText("Delivery date")
    await expect(input).toHaveAttribute("type", "date")
    // An empty date reads as a placeholder.
    await expect(input).toHaveAttribute("data-empty", "true")
    await userEvent.click(input)
  }
})
