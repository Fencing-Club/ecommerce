"use client"

import { money } from "@repo/aisle"
import { Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import {
  countOf,
  type PriceBasis,
  type PriceBreak,
  pricingProblem,
  type QuantityRules,
  unitName
} from "@/lib/catalog-pricing"

export function currencySymbol(currency: string) {
  return (
    new Intl.NumberFormat("en-US", { style: "currency", currency })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value ?? currency
  )
}

// Typed money as minor units: null for blank, undefined for something that isn't an amount.
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

export function moneyText(minor: number | null | undefined) {
  return minor === null || minor === undefined ? "" : (minor / 100).toFixed(2)
}

// A price field with its currency's symbol in front, which keeps what's typed and reports the amount on blur.
export function MoneyInput({
  value,
  onValueChange,
  currency,
  placeholder,
  label,
  disabled,
  className
}: {
  value: number | null
  onValueChange: (value: number | null) => void
  currency: string
  placeholder?: string
  label: string
  disabled?: boolean
  className?: string
}) {
  const [text, setText] = useState(moneyText(value))
  const [invalid, setInvalid] = useState(false)
  const [synced, setSynced] = useState(value)
  // A new value from outside, such as Discard, replaces what's typed.
  if (synced !== value) {
    setSynced(value)
    setText(moneyText(value))
    setInvalid(false)
  }
  return (
    <InputGroup className={className} data-disabled={disabled || undefined}>
      <InputGroupAddon>
        <InputGroupText>{currencySymbol(currency)}</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        aria-label={label}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        className="text-right tabular-nums"
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          const parsed = parseMoney(text)
          if (parsed === undefined) {
            setInvalid(true)
            return
          }
          setInvalid(false)
          setText(moneyText(parsed))
          if (parsed !== value) {
            setSynced(parsed)
            onValueChange(parsed)
          }
        }}
      />
    </InputGroup>
  )
}

// A short description of volume pricing and quantity rules, such as "3 price breaks, minimum 10 cases".
export function rulesSummary(breaks: PriceBreak[], rules: QuantityRules, basis: PriceBasis) {
  const parts: string[] = []
  if (breaks.length) {
    parts.push(`${breaks.length} price break${breaks.length === 1 ? "" : "s"}`)
  }
  if (rules.minimum !== 1) {
    parts.push(`min ${countOf(rules.minimum, basis)}`)
  }
  if (rules.maximum !== null) {
    parts.push(`max ${countOf(rules.maximum, basis)}`)
  }
  if (rules.increment !== 1) {
    parts.push(`steps of ${rules.increment}`)
  }
  return parts.join(", ")
}

type Draft = { increment: string; minimum: string; maximum: string; breaks: Array<{ minimum: string; price: string }> }

function draftOf(breaks: PriceBreak[], rules: QuantityRules): Draft {
  return {
    increment: String(rules.increment),
    minimum: String(rules.minimum),
    maximum: rules.maximum === null ? "" : String(rules.maximum),
    breaks: breaks.map((row) => ({ minimum: String(row.minimum), price: moneyText(row.priceMinor) }))
  }
}

function whole(text: string) {
  const value = Number(text.trim())
  return text.trim() && Number.isSafeInteger(value) && value > 0 ? value : undefined
}

// Quantity rules and volume pricing for one price, laid out like Shopify's catalog dialog: increment, minimum and
// maximum, then each price break from its quantity up.
export function PricingRulesDialog({
  open,
  onOpenChange,
  title,
  currency,
  basis,
  priceMinor,
  priceBreaks,
  quantityRules,
  onSave,
  inherited
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  currency: string
  basis: PriceBasis
  // The price below the first break.
  priceMinor: number | null
  priceBreaks: PriceBreak[]
  quantityRules: QuantityRules
  onSave: (value: { priceBreaks: PriceBreak[]; quantityRules: QuantityRules } | null) => void
  // What the product sets, when these are a catalog's own: saving null goes back to them.
  inherited?: { priceBreaks: PriceBreak[]; quantityRules: QuantityRules }
}) {
  const [draft, setDraft] = useState(() => draftOf(priceBreaks, quantityRules))
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setDraft(draftOf(priceBreaks, quantityRules))
    }
  }
  const unit = unitName(basis)
  const rules = {
    increment: whole(draft.increment),
    minimum: whole(draft.minimum),
    maximum: draft.maximum.trim() ? whole(draft.maximum) : null
  }
  const breaks = draft.breaks.map((row) => ({ minimum: whole(row.minimum), priceMinor: parseMoney(row.price) }))
  let problem: string | null = null
  if (!rules.increment || !rules.minimum || rules.maximum === undefined) {
    problem = "Quantities must be whole numbers above 0"
  } else if (breaks.some((row) => !row.minimum || row.priceMinor === undefined || row.priceMinor === null)) {
    problem = "Give every break a quantity and a price"
  } else {
    problem = pricingProblem(priceMinor, breaks as PriceBreak[], rules as QuantityRules)
  }

  function update(change: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...change }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Quantity rules and volume pricing</DialogTitle>
          <DialogDescription className="truncate">{title}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Quantity rules</h3>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["increment", "Increment"],
                  ["minimum", "Minimum"],
                  ["maximum", "Maximum"]
                ] as const
              ).map(([key, label]) => (
                <Field key={key} className="gap-1.5">
                  <FieldLabel htmlFor={`rules-${key}`} className="text-xs text-muted-foreground">
                    {label}
                  </FieldLabel>
                  <Input
                    id={`rules-${key}`}
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    value={draft[key]}
                    placeholder={key === "maximum" ? "None" : "1"}
                    onChange={(event) => update({ [key]: event.target.value })}
                    className="tabular-nums"
                  />
                </Field>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">In {unit}s, the unit this product is priced in.</p>
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Volume pricing</h3>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] items-center gap-2">
              <span className="text-xs text-muted-foreground">Quantity</span>
              <span className="text-xs text-muted-foreground">Price per {unit}</span>
              <span />
              <Input value={`${draft.minimum || 1}+`} disabled aria-label="Base quantity" className="tabular-nums" />
              <Input
                value={priceMinor === null ? "No price" : money(priceMinor, currency)}
                disabled
                aria-label="Base price"
                className="text-right tabular-nums"
              />
              <span />
              {draft.breaks.map((row, index) => (
                <div key={index} className="contents">
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    value={row.minimum}
                    placeholder="Quantity"
                    aria-label={`Break ${index + 1} quantity`}
                    className="tabular-nums"
                    onChange={(event) =>
                      update({
                        breaks: draft.breaks.map((candidate, position) =>
                          position === index ? { ...candidate, minimum: event.target.value } : candidate
                        )
                      })
                    }
                  />
                  <InputGroup>
                    <InputGroupAddon>
                      <InputGroupText>{currencySymbol(currency)}</InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput
                      inputMode="decimal"
                      value={row.price}
                      placeholder="0.00"
                      aria-label={`Break ${index + 1} price`}
                      className="text-right tabular-nums"
                      onChange={(event) =>
                        update({
                          breaks: draft.breaks.map((candidate, position) =>
                            position === index ? { ...candidate, price: event.target.value } : candidate
                          )
                        })
                      }
                    />
                  </InputGroup>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Delete break ${index + 1}`}
                    onClick={() => update({ breaks: draft.breaks.filter((_, position) => position !== index) })}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              disabled={priceMinor === null || draft.breaks.length >= 25}
              onClick={() => update({ breaks: [...draft.breaks, { minimum: "", price: "" }] })}
            >
              <Plus data-icon="inline-start" />
              Add break
            </Button>
          </section>
          {problem && (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          )}
        </div>
        <DialogFooter className="sm:justify-between">
          {inherited ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                onSave(null)
                onOpenChange(false)
              }}
            >
              Use product settings
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!!problem}
              onClick={() => {
                onSave({ priceBreaks: breaks as PriceBreak[], quantityRules: rules as QuantityRules })
                onOpenChange(false)
              }}
            >
              Done
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
