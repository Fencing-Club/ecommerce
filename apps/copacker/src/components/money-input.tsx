import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@buildkitgg/shadcn"
import { useId, useState } from "react"
import { useLocale } from "use-intl"
import { currencySymbol } from "@/lib/currency"

// The marks a locale writes amounts with: "." and "," in English, "," and "." in German, "," and a space in French.
function separators(locale: string) {
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6)
  return {
    decimal: parts.find((part) => part.type === "decimal")?.value ?? ".",
    group: parts.find((part) => part.type === "group")?.value ?? ","
  }
}

// Typed money as minor units, read with the locale's decimal mark and digit grouping: "1,234.5" in English and
// "1.234,5" in German are both 123450. Null for blank, undefined for something that isn't an amount, such as
// "12.345". Grouping goes between whole groups of digits, so "12.50" in German is a mistyped decimal, not 1250.
export function parseMoney(text: string, locale: string) {
  const value = text.trim()
  if (!value) {
    return null
  }
  const { decimal, group } = separators(locale)
  const [whole = "", fraction = "", ...rest] = value.split(decimal)
  // A locale that groups with a space, such as French, takes any space, since keyboards type a plain one.
  const groups = /\s/.test(group) ? whole.split(/\s+/) : whole.split(group)
  const [first = "", ...later] = groups
  const grouped =
    later.length === 0 ||
    (/^\d{1,3}$/.test(first) &&
      later.every((digits, index) => (index === later.length - 1 ? /^\d{3}$/ : /^\d{2,3}$/).test(digits)))
  const digits = groups.join("")
  if (rest.length > 0 || !grouped || !/^\d{1,8}$/.test(digits) || !/^\d{0,2}$/.test(fraction)) {
    return undefined
  }
  return Number(digits) * 100 + Number(fraction.padEnd(2, "0"))
}

// Minor units as an amount to type over, in the locale's digits without grouping, such as "1234.50" in English and
// "1234,50" in German; blank for none.
export function moneyText(minor: number | null | undefined, locale: string) {
  if (minor === null || minor === undefined) {
    return ""
  }
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false
  }).format(minor / 100)
}

// A money field in minor units, with its currency's symbol in front: the one input for an amount, which a form's
// FormMoney wraps. It reads what's typed in the page's language, so "12,50" is 12.50 in German. Each amount is reported
// as it's typed, and a blank field as null, so totals beside it follow along; the field reads with its cents, such as
// 78.50, once it's left. Text that isn't an amount stays as typed and marked, and goes to `onUnreadable` instead of
// being reported. A value set from outside, such as a supplier's quote or Discard, replaces the text unless it's being
// typed.
export function MoneyInput({
  value,
  onValueChange,
  onUnreadable,
  currency,
  label,
  invalid,
  className,
  onBlur,
  "aria-describedby": describedBy,
  ...props
}: {
  value: number | null
  onValueChange: (value: number | null) => void
  // Called while what's typed isn't an amount, such as for a form to fail its check.
  onUnreadable?: () => void
  currency: string
  // Names the field for screen readers when no label points at it.
  label?: string
  // Marks the field from outside, such as for a form's error about it.
  invalid?: boolean
  className?: string
} & Pick<
  React.ComponentProps<typeof InputGroupInput>,
  "ref" | "id" | "name" | "placeholder" | "disabled" | "required" | "onBlur" | "aria-describedby"
>) {
  const locale = useLocale()
  const currencyId = useId()
  // The text in the field while it's being typed, or while it isn't an amount; `edited` until the field is left.
  const [typed, setTyped] = useState<{ text: string; edited: boolean } | null>(null)
  const [synced, setSynced] = useState(value)
  if (synced !== value) {
    setSynced(value)
    if (!typed?.edited) {
      setTyped(null)
    }
  }
  const shown = typed?.text ?? moneyText(value, locale)
  const unreadable = typed !== null && parseMoney(typed.text, locale) === undefined
  return (
    <InputGroup className={className} data-disabled={props.disabled || undefined}>
      <InputGroupAddon>
        <InputGroupText id={currencyId}>{currencySymbol(currency, locale)}</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput
        {...props}
        inputMode="decimal"
        autoComplete="off"
        value={shown}
        aria-label={label}
        aria-describedby={describedBy ? `${currencyId} ${describedBy}` : currencyId}
        aria-invalid={invalid || unreadable || undefined}
        className="text-end tabular-nums"
        onFocus={() => setTyped({ text: shown, edited: false })}
        onChange={(event) => {
          const text = event.target.value
          setTyped({ text, edited: true })
          const amount = parseMoney(text, locale)
          if (amount === undefined) {
            onUnreadable?.()
          } else if (amount !== value || unreadable) {
            // After text that wasn't an amount, even the last amount is reported again, as its owner may have set it
            // aside.
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
