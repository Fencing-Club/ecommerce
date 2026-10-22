import { useState } from "react"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { Button } from "@/components/ui/button"
import { toteProduct } from "@/stories/fixtures/supplier"
import { member } from "@/stories/workspace"
import { type EditorVariant, VariantSheet } from "./variant-sheet"

const [natural, black] = toteProduct.variants

// A sheet opened from a button, as the product editor opens one from a variant's menu.
function Sheet({ onClose, onSave, ...props }: React.ComponentProps<typeof VariantSheet>) {
  const [variant, setVariant] = useState<EditorVariant | null>(props.variant)
  const [last, setLast] = useState(props.variant)
  return (
    <>
      <Button onClick={() => setVariant(last)}>Edit {last?.supplierSku}</Button>
      <VariantSheet
        {...props}
        variant={variant}
        onClose={() => {
          setVariant(null)
          onClose()
        }}
        onSave={(saved) => {
          setLast(saved)
          setVariant(null)
          onSave(saved)
        }}
      />
    </>
  )
}

// Everything about one variant, in a side panel.
const meta = preview.meta({
  title: "Components/Supplier workspace/Variant sheet",
  component: VariantSheet,
  args: { variant: black!, optionNames: ["Color"], title: "Canvas tote bag", onClose: fn(), onSave: fn() },
  render: (args) => <Sheet {...args} />
})

export const Edit = meta.story({
  play: async ({ args }) => {
    const sheet = within(await screen.findByRole("dialog", { name: "Black" }))
    await expect(sheet.getByText("Canvas tote bag")).toBeInTheDocument()
    await expect(sheet.getByRole("button", { name: "1 price break" })).toBeInTheDocument()
    await userEvent.clear(sheet.getByRole("textbox", { name: "Color" }))
    await userEvent.type(sheet.getByRole("textbox", { name: "Color" }), "Charcoal")
    // The title follows the options as they're typed.
    await expect(await screen.findByRole("dialog", { name: "Charcoal" })).toBeInTheDocument()
    await userEvent.click(sheet.getByRole("combobox", { name: "Currency" }))
    await userEvent.click(await screen.findByRole("option", { name: "EUR" }))
    await userEvent.click(sheet.getByRole("switch", { name: "Continue selling when out of stock" }))
    await userEvent.click(sheet.getByRole("button", { name: "Done" }))
    await expect(args.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        key: black!.key,
        options: { Color: "Charcoal" },
        currency: "EUR",
        continueSelling: true
      })
    )
  }
})

// Cancel drops the changes: opened again, the sheet starts from the variant.
export const CancelThenReopen = meta.story({
  play: async ({ args, canvas }) => {
    let sheet = within(await screen.findByRole("dialog", { name: "Black" }))
    await userEvent.clear(sheet.getByRole("textbox", { name: "SKU" }))
    // A variant needs its SKU.
    await expect(sheet.getByRole("button", { name: "Done" })).toBeDisabled()
    await userEvent.click(sheet.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await expect(args.onClose).toHaveBeenCalledOnce()
    await userEvent.click(canvas.getByRole("button", { name: "Edit LM-TOTE-BLK" }))
    sheet = within(await screen.findByRole("dialog", { name: "Black" }))
    await expect(sheet.getByRole("textbox", { name: "SKU" })).toHaveValue("LM-TOTE-BLK")
  }
})

// Tracking stock shows on hand and selling when out; without it, neither.
export const Tracking = meta.story({
  args: { variant: natural! },
  play: async () => {
    const sheet = within(await screen.findByRole("dialog", { name: "Natural" }))
    await expect(sheet.getByRole("spinbutton", { name: "On hand" })).toHaveValue(120)
    await userEvent.click(sheet.getByRole("switch", { name: "Track inventory" }))
    await expect(sheet.queryByRole("spinbutton", { name: "On hand" })).toBeNull()
  }
})

// A new variant has no options yet, so it's called a variant.
export const NewVariant = meta.story({
  args: { variant: { ...natural!, key: "new-1", id: undefined, supplierSku: "", options: {} } },
  play: async () => {
    const sheet = within(await screen.findByRole("dialog", { name: "Variant" }))
    await expect(sheet.getByRole("button", { name: "Done" })).toBeDisabled()
    await userEvent.type(sheet.getByRole("textbox", { name: "SKU" }), "LM-TOTE-OLV")
    await expect(sheet.getByRole("button", { name: "Done" })).toBeEnabled()
  }
})

// Without prices, the price fields are left out.
export const WithoutPrices = meta.story({
  parameters: { permissions: member },
  play: async () => {
    const sheet = within(await screen.findByRole("dialog", { name: "Black" }))
    await expect(sheet.queryByRole("textbox", { name: "Price" })).toBeNull()
    await expect(sheet.queryByRole("combobox", { name: "Currency" })).toBeNull()
  }
})
