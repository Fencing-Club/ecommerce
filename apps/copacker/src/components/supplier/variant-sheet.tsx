import { orderCurrencies, type OrderCurrency, priceBases, type PriceBasis } from "@repo/copacker-orders"
import { SlidersHorizontal } from "lucide-react"
import { useState } from "react"
import { useTranslations } from "use-intl"
import { useCan } from "@/components/access"
import { RequiredMark } from "@/components/form-controls"
import { OptionSelect } from "@/components/option-select"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useDraft } from "@/hooks/use-draft"
import type { PriceBreak, QuantityRules } from "@/lib/catalog-pricing"
import { variantLabel } from "@/lib/supplier-product"
import { MoneyInput, PricingRulesDialog, useRulesSummary } from "./pricing-controls"

// One variant as the product form holds it. `key` tells new variants apart until they're saved and have an id.
export type EditorVariant = {
  key: string
  id?: string
  supplierSku: string
  options: Record<string, string>
  currency: OrderCurrency
  priceMinor: number | null
  priceBasis: PriceBasis
  piecesPerSellablePack: number
  sellablePacksPerCase: number | null
  trackInventory: boolean
  onHand: number
  continueSelling: boolean
  priceBreaks: PriceBreak[]
  quantityRules: QuantityRules
  notes: string
}

// A typed whole number, or `fallback` for anything else.
function whole(text: string, fallback: number | null) {
  const value = Number(text)
  return text.trim() && Number.isSafeInteger(value) ? value : fallback
}

// The sheet's fields for one variant, from a copy of it that Done hands back.
function VariantForm({
  variant,
  optionNames,
  title,
  onClose,
  onSave
}: {
  variant: EditorVariant
  optionNames: string[]
  title: string
  onClose: () => void
  onSave: (variant: EditorVariant) => void
}) {
  const prices = useCan("prices")
  const { draft, change } = useDraft(variant)
  const [rulesOpen, setRulesOpen] = useState(false)
  const t = useTranslations("supplier.productEditor")
  const shared = useTranslations("supplier.shared")
  const rulesSummary = useRulesSummary()
  const label = variantLabel(draft.options, optionNames)
  const summary = rulesSummary(draft.priceBreaks, draft.quantityRules, draft.priceBasis)
  return (
    <>
      <SheetHeader>
        <SheetTitle>{label ?? t("variant")}</SheetTitle>
        <SheetDescription className="truncate">{title || t("newProduct")}</SheetDescription>
      </SheetHeader>
      <FieldGroup className="gap-5 px-4">
        {optionNames.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {optionNames.map((name) => (
              <Field key={name}>
                <FieldLabel htmlFor={`variant-option-${name}`}>{name}</FieldLabel>
                <Input
                  id={`variant-option-${name}`}
                  value={draft.options[name] ?? ""}
                  onChange={(event) => change({ options: { ...draft.options, [name]: event.target.value } })}
                />
              </Field>
            ))}
          </div>
        )}
        <Field>
          <FieldLabel htmlFor="variant-sku">
            <span>
              {t("sku")}
              <RequiredMark />
            </span>
          </FieldLabel>
          <Input
            id="variant-sku"
            required
            value={draft.supplierSku}
            onChange={(event) => change({ supplierSku: event.target.value })}
          />
        </Field>
        {prices && (
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="variant-price">{t("price")}</FieldLabel>
              <MoneyInput
                label={t("price")}
                currency={draft.currency}
                value={draft.priceMinor}
                onValueChange={(value) => change({ priceMinor: value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="variant-currency">{t("currency")}</FieldLabel>
              <OptionSelect
                id="variant-currency"
                options={orderCurrencies.map((value) => ({ value, label: value }))}
                value={draft.currency}
                onChange={(currency) => change({ currency })}
                className="w-full"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="variant-basis">{t("pricePer")}</FieldLabel>
              <OptionSelect
                id="variant-basis"
                options={priceBases.map((value) => ({ value, label: t(`basis.${value}`) }))}
                value={draft.priceBasis}
                onChange={(priceBasis) => change({ priceBasis })}
                className="w-full"
              />
            </Field>
            <Field>
              <FieldLabel>{t("volumePricing")}</FieldLabel>
              <Button type="button" variant="outline" className="justify-start" onClick={() => setRulesOpen(true)}>
                <SlidersHorizontal data-icon="inline-start" />
                <span className="truncate">{summary || t("addRules")}</span>
              </Button>
            </Field>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="variant-pieces">{t("piecesPerPack")}</FieldLabel>
            <Input
              id="variant-pieces"
              type="number"
              inputMode="numeric"
              min={1}
              value={draft.piecesPerSellablePack}
              onChange={(event) => change({ piecesPerSellablePack: whole(event.target.value, 1) ?? 1 })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="variant-packs">{t("packsPerCase")}</FieldLabel>
            <Input
              id="variant-packs"
              type="number"
              inputMode="numeric"
              min={1}
              placeholder={t("unknown")}
              value={draft.sellablePacksPerCase ?? ""}
              onChange={(event) => change({ sellablePacksPerCase: whole(event.target.value, null) })}
            />
          </Field>
        </div>
        <Field orientation="horizontal">
          <Switch
            id="variant-track"
            aria-labelledby="variant-track-label"
            checked={draft.trackInventory}
            onCheckedChange={(checked) => change({ trackInventory: checked })}
          />
          <FieldLabel id="variant-track-label" htmlFor="variant-track">
            {t("trackInventory")}
          </FieldLabel>
        </Field>
        {draft.trackInventory && (
          <>
            <Field>
              <FieldLabel htmlFor="variant-on-hand">{t("onHand")}</FieldLabel>
              <Input
                id="variant-on-hand"
                type="number"
                value={draft.onHand}
                className="w-32"
                onChange={(event) => change({ onHand: whole(event.target.value, 0) ?? 0 })}
              />
              <FieldDescription>{t("piecesInStock")}</FieldDescription>
            </Field>
            <Field orientation="horizontal">
              <Switch
                id="variant-continue"
                aria-labelledby="variant-continue-label"
                checked={draft.continueSelling}
                onCheckedChange={(checked) => change({ continueSelling: checked })}
              />
              <FieldLabel id="variant-continue-label" htmlFor="variant-continue">
                {t("continueSelling")}
              </FieldLabel>
            </Field>
          </>
        )}
        <Field>
          <FieldLabel htmlFor="variant-notes">{t("notes")}</FieldLabel>
          <Textarea
            id="variant-notes"
            value={draft.notes}
            onChange={(event) => change({ notes: event.target.value })}
          />
        </Field>
      </FieldGroup>
      <SheetFooter>
        <Button type="button" onClick={() => onSave(draft)} disabled={!draft.supplierSku.trim()}>
          {shared("done")}
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          {shared("cancel")}
        </Button>
      </SheetFooter>
      {prices && (
        <PricingRulesDialog
          open={rulesOpen}
          onOpenChange={setRulesOpen}
          title={label ? `${title}, ${label}` : title}
          currency={draft.currency}
          basis={draft.priceBasis}
          priceMinor={draft.priceMinor}
          priceBreaks={draft.priceBreaks}
          quantityRules={draft.quantityRules}
          onSave={(value) => value && change(value)}
        />
      )}
    </>
  )
}

// Everything about one variant, in a side panel: its options, SKU, price, packaging, stock and notes. The fields start
// from the variant each time it opens, and Done hands the changes back; Cancel drops them.
export function VariantSheet({
  variant,
  optionNames,
  title,
  onClose,
  onSave
}: {
  // The variant to edit, or null while the sheet is closed.
  variant: EditorVariant | null
  optionNames: string[]
  // The product's title.
  title: string
  onClose: () => void
  onSave: (variant: EditorVariant) => void
}) {
  const t = useTranslations("supplier.productEditor")
  return (
    <Sheet open={!!variant} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {variant ? (
          // A fresh form for each variant opened.
          <VariantForm
            key={variant.key}
            variant={variant}
            optionNames={optionNames}
            title={title}
            onClose={onClose}
            onSave={onSave}
          />
        ) : (
          <SheetHeader>
            <SheetTitle>{t("variant")}</SheetTitle>
            <SheetDescription className="truncate">{title || t("newProduct")}</SheetDescription>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  )
}
