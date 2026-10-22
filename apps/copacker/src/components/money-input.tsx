import { useState } from "react"
import { useLocale } from "use-intl"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { currencySymbol } from "@/lib/currency"

// Typed money as minor units: null for blank, undefined for something that isn't an amount, such as "12.345".
export function parseMoney(text: string) {
  const value = text.trim().replace(/,/g, "")
  if (!value) {
    return null
  }
  if (!/^\d{1,8}(?:\.\d{0,2})?$/.test(value)) {
    return undefined
  }
  const [whole, fraction = ""] = value.split(".")
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"))
}

// Minor units as an amount to type over, such as "78.50"; blank for none.
export function moneyText(minor: number | null | undefined) {
  return minor === null || minor === undefined ? "" : (minor / 100).toFixed(2)
}

// A money field in minor units, with its currency's symbol in front: the one input for an amount outside a form's
// FormMoney. Each amount is reported as it's typed, and a blank field as null, so totals beside it follow along; the
// field reads with its cents, such as 78.50, once it's left. Text that isn't an amount stays as typed and marked, and
// isn't reported. A value set from outside, such as a supplier's quote or Discard, replaces the text unless it's being
// typed.
export function MoneyInput({
  value,
  onValueChange,
  currency,
  label,
  invalid,
  className,
  onBlur,
  ...props
}: {
  value: number | null
  onValueChange: (value: number | null) => void
  currency: string
  label: string
  // Marks the field from outside, such as for a form's error about it.
  invalid?: boolean
  className?: string
} & Pick<React.ComponentProps<typeof InputGroupInput>, "ref" | "name" | "placeholder" | "disabled" | "onBlur">) {
  const locale = useLocale()
  // The text in the field while it's being typed, or while it isn't an amount; `edited` until the field is left.
  const [typed, setTyped] = useState<{ text: string; edited: boolean } | null>(null)
  const [synced, setSynced] = useState(value)
  if (synced !== value) {
    setSynced(value)
    if (!typed?.edited) {
      setTyped(null)
    }
  }
  const shown = typed?.text ?? moneyText(value)
  const unreadable = typed !== null && parseMoney(typed.text) === undefined
  return (
    <InputGroup className={className} data-disabled={props.disabled || undefined}>
      <InputGroupAddon>
        <InputGroupText>{currencySymbol(currency, locale)}</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput
        {...props}
        inputMode="decimal"
        autoComplete="off"
        value={shown}
        aria-label={label}
        aria-invalid={invalid || unreadable || undefined}
        className="text-end tabular-nums"
        onFocus={() => setTyped({ text: shown, edited: false })}
        onChange={(event) => {
          const text = event.target.value
          setTyped({ text, edited: true })
          const amount = parseMoney(text)
          if (amount !== undefined && amount !== value) {
            onValueChange(amount)
          }
        }}
        onBlur={(event) => {
          setTyped(unreadable && typed ? { text: typed.text, edited: false } : null)
          onBlur?.(event)
        }}
      />
    </InputGroup>
  )
}
