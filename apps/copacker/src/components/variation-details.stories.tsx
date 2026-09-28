import { zodResolver } from "@hookform/resolvers/zod"
import { FormProvider, useForm } from "react-hook-form"
import { expect, fn, userEvent, waitFor } from "storybook/test"
import { z } from "zod"
import preview from "#.storybook/preview"
import { Button } from "@/components/ui/button"
import { useFormErrorMap } from "@/hooks/use-error-text"
import { VariationDetails, type VariationFields, variationSchema, variationValues } from "./variation-details"

type Variation = { variantId: string; title: string | null } & VariationFields

const variations: Variation[] = [
  {
    variantId: "gid://shopify/ProductVariant/1001",
    title: "Natural",
    supplierSku: "LM-TOTE-001",
    asin: "B0TOTE0001",
    amazonStockTarget: 50,
    storeStockTarget: null
  },
  {
    variantId: "gid://shopify/ProductVariant/1002",
    title: "Black",
    supplierSku: null,
    asin: null,
    amazonStockTarget: null,
    storeStockTarget: 12
  }
]

const schema = z.object({ variations: z.array(variationSchema) })
const submitted = fn()

// The product form's part that the fields bind to, as the product details panel holds it.
function ProductForm({ productTitle, variations: list }: { productTitle: string; variations: Variation[] }) {
  const form = useForm({
    resolver: zodResolver(schema, { error: useFormErrorMap() }),
    defaultValues: { variations: list.map(variationValues) }
  })
  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit((values) => submitted(values))} noValidate className="flex flex-col gap-4">
        <VariationDetails productTitle={productTitle} variations={list} />
        <Button type="submit" className="self-end">
          Save
        </Button>
      </form>
    </FormProvider>
  )
}

const meta = preview.meta({
  component: VariationDetails,
  args: { productTitle: "Canvas tote bag", variations },
  render: (args) => <ProductForm productTitle={args.productTitle} variations={variations} />,
  beforeEach: () => {
    submitted.mockClear()
  }
})

export const Edit = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("textbox", { name: "Supplier SKU for Natural" })).toHaveValue("LM-TOTE-001")
    await expect(canvas.getByRole("spinbutton", { name: "Amazon minimum for Natural" })).toHaveValue(50)
    await expect(canvas.getByRole("spinbutton", { name: "Amazon minimum for Black" })).toHaveValue(null)

    await userEvent.type(canvas.getByRole("textbox", { name: "Supplier SKU for Black" }), "LM-TOTE-002")
    await userEvent.type(canvas.getByRole("spinbutton", { name: "Amazon minimum for Black" }), "0")
    await userEvent.clear(canvas.getByRole("spinbutton", { name: "Warehouse minimum for Black" }))
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(submitted).toHaveBeenCalledWith({
        variations: [
          {
            variantId: variations[0]!.variantId,
            supplierSku: "LM-TOTE-001",
            asin: "B0TOTE0001",
            amazonStockTarget: 50,
            storeStockTarget: undefined
          },
          {
            variantId: variations[1]!.variantId,
            supplierSku: "LM-TOTE-002",
            asin: "",
            amazonStockTarget: 0,
            storeStockTarget: undefined
          }
        ]
      })
    )
  }
})

// Stock minimums are whole units.
export const WholeUnits = meta.story({
  play: async ({ canvas }) => {
    const minimum = canvas.getByRole("spinbutton", { name: "Warehouse minimum for Natural" })
    await userEvent.type(minimum, "2.5")
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await expect(await canvas.findByText("Enter a whole number")).toBeVisible()
    await expect(minimum).toHaveAttribute("aria-invalid", "true")
    await expect(submitted).not.toHaveBeenCalled()
  }
})

// A product's only variation goes by the product's name.
export const Untitled = meta.story({
  render: (args) => <ProductForm productTitle={args.productTitle} variations={[{ ...variations[0]!, title: null }]} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Canvas tote bag")).toBeVisible()
    await expect(canvas.getByRole("textbox", { name: "ASIN for Canvas tote bag" })).toHaveValue("B0TOTE0001")
  }
})
