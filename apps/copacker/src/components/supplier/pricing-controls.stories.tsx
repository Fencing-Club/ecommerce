import { type ComponentProps, useState } from "react"
import { expect, fn, screen, userEvent, within } from "storybook/test"
import preview from "#.storybook/preview"
import { defaultQuantityRules } from "@/lib/catalog-pricing"
import { MoneyInput, PricingRulesDialog, parseMoney } from "./pricing-controls"

const meta = preview.meta({
  title: "Components/Supplier workspace/Pricing controls",
  component: PricingRulesDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    onSave: fn(),
    title: "Canvas tote bag, Natural",
    currency: "USD",
    basis: "piece",
    priceMinor: 1000,
    priceBreaks: [],
    quantityRules: defaultQuantityRules
  } satisfies ComponentProps<typeof PricingRulesDialog>
})

const dialog = async () => within(await screen.findByRole("dialog", { name: "Quantity rules and volume pricing" }))

export const SetRules = meta.story({
  play: async ({ args }) => {
    const rules = await dialog()
    await expect(rules.getByText("Canvas tote bag, Natural")).toBeInTheDocument()
    await expect(rules.getByText("In units, the unit this product is priced in.")).toBeInTheDocument()
    await expect(rules.getByRole("textbox", { name: "Base price" })).toHaveValue("$10")
    await userEvent.clear(rules.getByRole("spinbutton", { name: "Increment" }))
    await userEvent.type(rules.getByRole("spinbutton", { name: "Increment" }), "6")
    await userEvent.clear(rules.getByRole("spinbutton", { name: "Minimum" }))
    await userEvent.type(rules.getByRole("spinbutton", { name: "Minimum" }), "12")
    await userEvent.type(rules.getByRole("spinbutton", { name: "Maximum" }), "120")
    // The base row starts at the minimum.
    await expect(rules.getByRole("textbox", { name: "Base quantity" })).toHaveValue("12+")
    await userEvent.click(rules.getByRole("button", { name: "Add break" }))
    await userEvent.type(rules.getByRole("spinbutton", { name: "Break 1 quantity" }), "24")
    await userEvent.type(rules.getByRole("textbox", { name: "Break 1 price" }), "9.50")
    await expect(rules.queryByRole("alert")).toBeNull()
    await userEvent.click(rules.getByRole("button", { name: "Done" }))
    await expect(args.onSave).toHaveBeenCalledWith({
      priceBreaks: [{ minimum: 24, priceMinor: 950 }],
      quantityRules: { increment: 6, minimum: 12, maximum: 120 }
    })
    await expect(args.onOpenChange).toHaveBeenCalledWith(false)
  }
})

export const Problems = meta.story({
  play: async ({ args }) => {
    const rules = await dialog()
    const alert = () => rules.getByRole("alert")
    await userEvent.clear(rules.getByRole("spinbutton", { name: "Minimum" }))
    await expect(alert()).toHaveTextContent("Quantities must be whole numbers above 0")
    await userEvent.type(rules.getByRole("spinbutton", { name: "Minimum" }), "5")
    await userEvent.clear(rules.getByRole("spinbutton", { name: "Increment" }))
    await userEvent.type(rules.getByRole("spinbutton", { name: "Increment" }), "2")
    await expect(alert()).toHaveTextContent("The minimum must be a multiple of the increment")
    await userEvent.clear(rules.getByRole("spinbutton", { name: "Increment" }))
    await userEvent.type(rules.getByRole("spinbutton", { name: "Increment" }), "1")
    await userEvent.type(rules.getByRole("spinbutton", { name: "Maximum" }), "4")
    await expect(alert()).toHaveTextContent("The maximum can’t be less than the minimum")
    await userEvent.clear(rules.getByRole("spinbutton", { name: "Maximum" }))
    await userEvent.click(rules.getByRole("button", { name: "Add break" }))
    await expect(alert()).toHaveTextContent("Give every break a quantity and a price")
    await userEvent.type(rules.getByRole("spinbutton", { name: "Break 1 quantity" }), "5")
    await userEvent.type(rules.getByRole("textbox", { name: "Break 1 price" }), "9")
    await expect(alert()).toHaveTextContent("Each break’s quantity must be more than the minimum")
    await expect(rules.getByRole("button", { name: "Done" })).toBeDisabled()
    await userEvent.click(rules.getByRole("button", { name: "Delete break 1" }))
    await expect(rules.queryByRole("alert")).toBeNull()
    await expect(args.onSave).not.toHaveBeenCalled()
  }
})

export const ExistingBreaks = meta.story({
  args: {
    basis: "case",
    priceBreaks: [
      { minimum: 10, priceMinor: 900 },
      { minimum: 50, priceMinor: 800 }
    ],
    quantityRules: { increment: 1, minimum: 2, maximum: null }
  },
  play: async ({ args }) => {
    const rules = await dialog()
    await expect(rules.getByText("In cases, the unit this product is priced in.")).toBeInTheDocument()
    await expect(rules.getByText("Price per case")).toBeInTheDocument()
    await expect(rules.getByRole("spinbutton", { name: "Break 2 quantity" })).toHaveValue(50)
    await expect(rules.getByRole("textbox", { name: "Break 2 price" })).toHaveValue("8.00")
    await userEvent.click(rules.getByRole("button", { name: "Delete break 1" }))
    await userEvent.click(rules.getByRole("button", { name: "Done" }))
    await expect(args.onSave).toHaveBeenCalledWith({
      priceBreaks: [{ minimum: 50, priceMinor: 800 }],
      quantityRules: { increment: 1, minimum: 2, maximum: null }
    })
  }
})

export const InheritedFromProduct = meta.story({
  args: {
    quantityRules: { increment: 6, minimum: 12, maximum: null },
    inherited: { priceBreaks: [], quantityRules: defaultQuantityRules }
  },
  play: async ({ args }) => {
    const rules = await dialog()
    await userEvent.click(rules.getByRole("button", { name: "Use product settings" }))
    await expect(args.onSave).toHaveBeenCalledWith(null)
    await expect(args.onOpenChange).toHaveBeenCalledWith(false)
  }
})

export const WithoutPrice = meta.story({
  args: { priceMinor: null },
  play: async () => {
    const rules = await dialog()
    await expect(rules.getByRole("textbox", { name: "Base price" })).toHaveValue("No price")
    // Volume pricing needs a price to start from.
    await expect(rules.getByRole("button", { name: "Add break" })).toBeDisabled()
    await expect(rules.queryByRole("button", { name: "Use product settings" })).toBeNull()
  }
})

export const Cancel = meta.story({
  play: async ({ args }) => {
    const rules = await dialog()
    await userEvent.type(rules.getByRole("spinbutton", { name: "Maximum" }), "50")
    await userEvent.click(rules.getByRole("button", { name: "Cancel" }))
    await expect(args.onOpenChange).toHaveBeenCalledWith(false)
    await expect(args.onSave).not.toHaveBeenCalled()
  }
})

// A price field that reports the amount it holds, as the forms that use it keep it.
function PriceField() {
  const [value, setValue] = useState<number | null>(425)
  return (
    <div className="flex w-64 flex-col gap-2">
      <MoneyInput label="Unit price" currency="EUR" value={value} onValueChange={setValue} />
      <output aria-label="Amount">{value === null ? "blank" : value}</output>
      <button type="button" onClick={() => setValue(890)}>
        Reset
      </button>
    </div>
  )
}

export const Money = meta.story({
  render: () => <PriceField />,
  play: async ({ canvas }) => {
    const field = canvas.getByRole("textbox", { name: "Unit price" })
    await expect(field).toHaveValue("4.25")
    await expect(canvas.getByText("€")).toBeVisible()
    await userEvent.clear(field)
    await userEvent.type(field, "1,234.5")
    await userEvent.tab()
    await expect(field).toHaveValue("1234.50")
    await expect(canvas.getByRole("status", { name: "Amount" })).toHaveTextContent("123450")
    await userEvent.clear(field)
    await userEvent.type(field, "12.345")
    await userEvent.tab()
    // What isn't an amount stays as typed and marked, and isn't reported.
    await expect(field).toHaveAttribute("aria-invalid", "true")
    await expect(canvas.getByRole("status", { name: "Amount" })).toHaveTextContent("123450")
    await userEvent.clear(field)
    await userEvent.tab()
    await expect(canvas.getByRole("status", { name: "Amount" })).toHaveTextContent("blank")
    // A value set from outside replaces what's typed.
    await userEvent.click(canvas.getByRole("button", { name: "Reset" }))
    await expect(field).toHaveValue("8.90")
    await expect(parseMoney("abc")).toBeUndefined()
  }
})
