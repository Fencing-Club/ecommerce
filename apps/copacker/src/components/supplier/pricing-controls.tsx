import { Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { useLocale, useTranslations } from "use-intl"
import { moneyText, parseMoney } from "@/components/money-input"
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
import { useMoney } from "@/hooks/use-money"
import type { PriceBasis } from "@/lib/catalog-pricing"
import { countOf, type PriceBreak, pricingProblem, type QuantityRules } from "@/lib/catalog-pricing"
import { currencySymbol } from "@/lib/currency"

// A short description of volume pricing and quantity rules, such as "3 price breaks, minimum 10 cases".
export function useRulesSummary() {
  const t = useTranslations("supplier.pricingControls")
  const pricing = useTranslations("supplier.pricing")
  return (breaks: PriceBreak[], rules: QuantityRules, basis: PriceBasis) => {
    const parts: string[] = []
    if (breaks.length) {
      parts.push(t("priceBreaks", { count: breaks.length }))
    }
    if (rules.minimum !== 1) {
      parts.push(t("min", { quantity: countOf(rules.minimum, basis, pricing) }))
    }
    if (rules.maximum !== null) {
      parts.push(t("max", { quantity: countOf(rules.maximum, basis, pricing) }))
    }
    if (rules.increment !== 1) {
      parts.push(t("steps", { count: rules.increment }))
    }
    return parts.join(", ")
  }
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
  const t = useTranslations("supplier.pricingControls")
  const shared = useTranslations("supplier.shared")
  const pricing = useTranslations("supplier.pricing")
  const locale = useLocale()
  const money = useMoney()
  const rules = {
    increment: whole(draft.increment),
    minimum: whole(draft.minimum),
    maximum: draft.maximum.trim() ? whole(draft.maximum) : null
  }
  const breaks = draft.breaks.map((row) => ({ minimum: whole(row.minimum), priceMinor: parseMoney(row.price) }))
  let problem: string | null = null
  if (!rules.increment || !rules.minimum || rules.maximum === undefined) {
    problem = t("wholeQuantities")
  } else if (breaks.some((row) => !row.minimum || row.priceMinor === undefined || row.priceMinor === null)) {
    problem = t("breakFields")
  } else {
    problem = pricingProblem(priceMinor, breaks as PriceBreak[], rules as QuantityRules, pricing)
  }

  function update(change: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...change }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription className="truncate">{title}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t("quantityRules")}</h3>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["increment", t("increment")],
                  ["minimum", t("minimum")],
                  ["maximum", t("maximum")]
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
                    placeholder={key === "maximum" ? shared("none") : "1"}
                    onChange={(event) => update({ [key]: event.target.value })}
                    className="tabular-nums"
                  />
                </Field>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t("unitHint", { basis })}</p>
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t("volumePricing")}</h3>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] items-center gap-2">
              <span className="text-xs text-muted-foreground">{t("quantity")}</span>
              <span className="text-xs text-muted-foreground">{t("pricePer", { basis })}</span>
              <span />
              <Input
                value={`${draft.minimum || 1}+`}
                disabled
                aria-label={t("baseQuantity")}
                className="tabular-nums"
              />
              <Input
                value={priceMinor === null ? shared("noPrice") : money(priceMinor, currency)}
                disabled
                aria-label={t("basePrice")}
                className="text-end tabular-nums"
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
                    placeholder={t("quantity")}
                    aria-label={t("breakQuantity", { number: index + 1 })}
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
                      <InputGroupText>{currencySymbol(currency, locale)}</InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput
                      inputMode="decimal"
                      value={row.price}
                      placeholder="0.00"
                      aria-label={t("breakPrice", { number: index + 1 })}
                      className="text-end tabular-nums"
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
                    aria-label={t("deleteBreak", { number: index + 1 })}
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
              {t("addBreak")}
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
              {t("useProduct")}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {shared("cancel")}
            </Button>
            <Button
              type="button"
              disabled={!!problem}
              onClick={() => {
                onSave({ priceBreaks: breaks as PriceBreak[], quantityRules: rules as QuantityRules })
                onOpenChange(false)
              }}
            >
              {shared("done")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
