import { useState } from "react"
import { expect, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { MoneyInput } from "./money-input"

// A price field beside the amount it reports, as the pages that use it keep it.
function PriceField({ currency }: { currency: string }) {
  const [value, setValue] = useState<number | null>(425)
  return (
    <div className="flex w-64 flex-col gap-2">
      <MoneyInput label="Unit price" currency={currency} value={value} onValueChange={setValue} />
      <output aria-label="Amount">{value === null ? "blank" : value}</output>
      <button type="button" onClick={() => setValue(890)}>
        Reset
      </button>
    </div>
  )
}

const meta = preview.meta({
  title: "Components/Forms/Money input",
  component: MoneyInput,
  render: (args) => <PriceField currency={args.currency} />,
  args: { label: "Unit price", currency: "EUR", value: 425, onValueChange: () => undefined }
})

// Each amount reports as it's typed, so a total beside it follows along, and the field reads with its cents once left.
export const Typing = meta.story({
  play: async ({ canvas }) => {
    const field = canvas.getByRole("textbox", { name: "Unit price" })
    const amount = canvas.getByRole("status", { name: "Amount" })
    await expect(field).toHaveValue("4.25")
    await expect(canvas.getByText("€")).toBeVisible()
    await userEvent.clear(field)
    await expect(amount).toHaveTextContent("blank")
    await userEvent.type(field, "1,234.5")
    await expect(amount).toHaveTextContent("123450")
    // What's typed stays as typed until the field is left.
    await expect(field).toHaveValue("1,234.5")
    await userEvent.tab()
    await expect(field).toHaveValue("1234.50")
    await expect(field).not.toHaveAttribute("aria-invalid")
  }
})

// Text that isn't an amount stays as typed and marked, and the last amount stays reported. A value set from outside
// replaces it.
export const NotAnAmount = meta.story({
  play: async ({ canvas }) => {
    const field = canvas.getByRole("textbox", { name: "Unit price" })
    const amount = canvas.getByRole("status", { name: "Amount" })
    await userEvent.clear(field)
    await userEvent.type(field, "12.345")
    await expect(field).toHaveAttribute("aria-invalid", "true")
    await expect(amount).toHaveTextContent("1234")
    await userEvent.tab()
    await expect(field).toHaveValue("12.345")
    await expect(field).toHaveAttribute("aria-invalid", "true")
    await userEvent.click(canvas.getByRole("button", { name: "Reset" }))
    await expect(field).toHaveValue("8.90")
    await expect(field).not.toHaveAttribute("aria-invalid")
    await expect(amount).toHaveTextContent("890")
  }
})

// The symbol is the reader's own for the currency, such as $ for dollars in English, and describes the field.
export const Dollars = meta.story({
  args: { currency: "USD" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("$")).toBeVisible()
    await expect(canvas.getByRole("textbox", { name: "Unit price" })).toHaveAccessibleDescription("$")
  }
})

// In German a comma is the decimal mark and a dot groups thousands, so 12,50 is twelve and a half, not 1250.
export const DecimalComma = meta.story({
  globals: { locale: "de" },
  play: async ({ canvas }) => {
    const field = canvas.getByRole("textbox", { name: "Unit price" })
    const amount = canvas.getByRole("status", { name: "Amount" })
    await expect(field).toHaveValue("4,25")
    await userEvent.clear(field)
    await userEvent.type(field, "12,50")
    await expect(amount).toHaveTextContent("1250")
    await userEvent.tab()
    await expect(field).toHaveValue("12,50")
    await userEvent.clear(field)
    await userEvent.type(field, "1.234,5")
    await expect(amount).toHaveTextContent("123450")
    await userEvent.tab()
    await expect(field).toHaveValue("1234,50")
    // A dot that can't be grouping, such as a decimal mark typed by habit, is marked rather than read as hundreds: the
    // last amount reported is the 12 typed before it.
    await userEvent.clear(field)
    await userEvent.type(field, "12.50")
    await expect(field).toHaveAttribute("aria-invalid", "true")
    await expect(amount).toHaveTextContent("1200")
  }
})
