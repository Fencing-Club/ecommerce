import { zodResolver } from "@hookform/resolvers/zod"
import { FormProvider, useForm } from "react-hook-form"
import { expect, fn, screen, userEvent, waitFor } from "storybook/test"
import { z } from "zod"
import preview from "#.storybook/preview"
import { Button } from "@/components/ui/button"
import { useFormErrorMap } from "@/hooks/use-error-text"
import { FormSelect, SelectControl } from "./form-select"

const suppliers = [
  { value: "lotus", label: "Lotus Manufacturing" },
  { value: "northwind", label: "Northwind Textiles" },
  { value: "archived", label: "Juniper Goods (archived)", disabled: true }
]

const schema = z.object({ supplier: z.string().min(1), forwarder: z.string() })

// A purchase order's supplier, which it needs, and its forwarder, which it doesn't.
function SupplierForm({
  values,
  onSubmit
}: {
  values: { supplier?: string; forwarder?: string }
  onSubmit: (values: unknown) => void
}) {
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema, { error: useFormErrorMap() }),
    defaultValues: { forwarder: "", ...values },
    mode: "onTouched"
  })
  return (
    <FormProvider {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex max-w-xs flex-col gap-4">
        <FormSelect name="supplier" label="Supplier" options={suppliers} placeholder="Choose a supplier" required />
        <FormSelect
          name="forwarder"
          label="Forwarder"
          options={[{ value: "bayline", label: "Bayline Freight" }]}
          placeholder="No forwarder"
          description="Ships the goods on from the supplier"
        />
        <div>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </FormProvider>
  )
}

const meta = preview.meta({
  title: "Components/Forms/Form select",
  component: SupplierForm,
  args: { values: {}, onSubmit: fn() }
})

export const Choose = meta.story({
  play: async ({ canvas, args }) => {
    const supplier = canvas.getByRole("combobox", { name: /Supplier/ })
    await expect(supplier).toHaveTextContent("Choose a supplier")
    await userEvent.click(supplier)
    await expect(await screen.findByRole("option", { name: "Juniper Goods (archived)" })).toHaveAttribute(
      "aria-disabled",
      "true"
    )
    // A required field has no empty choice.
    await expect(screen.queryByRole("option", { name: "Choose a supplier" })).toBeNull()
    await userEvent.click(screen.getByRole("option", { name: "Northwind Textiles" }))
    await expect(supplier).toHaveTextContent("Northwind Textiles")
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith({ supplier: "northwind", forwarder: "" }, expect.anything())
    )
  }
})

export const Required = meta.story({
  play: async ({ canvas, args }) => {
    const supplier = canvas.getByRole("combobox", { name: /Supplier/ })
    // Opening the menu isn't leaving the field, so no error shows while it's open.
    await userEvent.click(supplier)
    await screen.findByRole("option", { name: "Lotus Manufacturing" })
    await expect(canvas.queryByText("Fill in this field")).toBeNull()
    // Closing it without a choice is.
    await userEvent.keyboard("{Escape}")
    await expect(await canvas.findByText("Fill in this field")).toBeVisible()
    await expect(supplier).toHaveAttribute("aria-invalid", "true")
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await expect(args.onSubmit).not.toHaveBeenCalled()
  }
})

// An optional field's placeholder is a choice that empties it.
export const ClearOptional = meta.story({
  args: { values: { supplier: "lotus", forwarder: "bayline" } },
  play: async ({ canvas, args }) => {
    const forwarder = canvas.getByRole("combobox", { name: "Forwarder" })
    await expect(forwarder).toHaveTextContent("Bayline Freight")
    // Its hint describes it.
    await expect(forwarder).toHaveAccessibleDescription("Ships the goods on from the supplier")
    await userEvent.click(forwarder)
    await userEvent.click(await screen.findByRole("option", { name: "No forwarder" }))
    await waitFor(() => expect(forwarder).toHaveTextContent("No forwarder"))
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith({ supplier: "lotus", forwarder: "" }, expect.anything())
    )
  }
})

// The control on its own, uncontrolled with a default.
export const Control = meta.story({
  render: () => (
    <div className="max-w-xs">
      <label htmlFor="currency">Currency</label>
      <SelectControl
        id="currency"
        options={[
          { value: "USD", label: "US dollar" },
          { value: "EUR", label: "Euro" }
        ]}
        defaultValue="USD"
      />
    </div>
  ),
  play: async ({ canvas }) => {
    const currency = canvas.getByRole("combobox", { name: "Currency" })
    await expect(currency).toHaveTextContent("US dollar")
    await userEvent.click(currency)
    await userEvent.click(await screen.findByRole("option", { name: "Euro" }))
    await expect(currency).toHaveTextContent("Euro")
  }
})
