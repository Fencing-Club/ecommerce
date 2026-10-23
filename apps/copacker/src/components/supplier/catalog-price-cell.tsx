import {
  Button,
  Field,
  FieldDescription,
  FieldLabel,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import { Pencil } from "lucide-react"
import { useId, useState } from "react"
import { useLocale, useTranslations } from "use-intl"
import { moneyText, parseMoney } from "@/components/money-input"
import { useMoney } from "@/hooks/use-money"
import { adjustPrice, type CatalogEntry, catalogPricing } from "@/lib/catalog-pricing"
import { currencySymbol } from "@/lib/currency"
import type { CatalogEditorData } from "@/server/catalogs"

export type CatalogVariant = CatalogEditorData["products"][number]["variants"][number]

// Prices as one amount or a range, or null for none.
function usePriceText() {
  const shared = useTranslations("supplier.shared")
  const money = useMoney()
  return (prices: number[], currency: string) => {
    if (!prices.length) {
      return null
    }
    const low = Math.min(...prices)
    const high = Math.max(...prices)
    return low === high
      ? money(low, currency)
      : shared("range", { low: money(low, currency), high: money(high, currency) })
  }
}

// What a fixed price replaces, the product's own price or the catalog's adjusted one, for one variant or several.
const basisText = {
  adjusted: {
    one: "adjustedPrice",
    several: "adjustedPrices",
    useOne: "useAdjustedPrice",
    useSeveral: "useAdjustedPrices"
  },
  product: { one: "productPrice", several: "productPrices", useOne: "useProductPrice", useSeveral: "useProductPrices" }
} as const

// Catalog prices as text: each variant's fixed price, or its own price moved by the catalog's adjustment. The button
// opens a field to fix the price of the row's variants, one or all of a product's, or to go back to adjusted prices. A
// product the catalog leaves out shows what its prices would be.
export function CatalogPriceCell({
  name,
  variants,
  entries,
  adjustment,
  readOnly,
  onChange
}: {
  // The product, with the variant on a variant's row.
  name: string
  variants: CatalogVariant[]
  entries: ReadonlyMap<string, CatalogEntry>
  adjustment: number
  // Shows the price without the button that changes it.
  readOnly: boolean
  onChange: (variantIds: string[], priceMinor: number | null) => void
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const t = useTranslations("supplier.catalogEditor")
  const shared = useTranslations("supplier.shared")
  const locale = useLocale()
  const priceText = usePriceText()
  const currency = variants[0]!.currency
  if (variants.some((variant) => variant.currency !== currency)) {
    return <span className="text-muted-foreground">{t("severalCurrencies")}</span>
  }
  const included = variants.filter((variant) => entries.has(variant.id))
  const shown = priceText(
    (included.length ? included : variants).flatMap(
      (variant) => catalogPricing(variant, adjustment, entries.get(variant.id) ?? null).priceMinor ?? []
    ),
    currency
  )
  const fixed = included.flatMap((variant) => entries.get(variant.id)?.priceMinor ?? [])
  const allFixed = included.length > 0 && fixed.length === included.length
  const several = included.length > 1
  const basis = adjustment ? basisText.adjusted : basisText.product
  const adjusted = priceText(
    included.flatMap((variant) => (variant.priceMinor === null ? [] : [adjustPrice(variant.priceMinor, adjustment)])),
    currency
  )
  const typed = parseMoney(text, locale)
  if (readOnly) {
    return (
      <span className="tabular-nums">
        {allFixed && <span className="me-1.5 text-xs text-muted-foreground">{t("fixed")}</span>}
        {shown ?? <span className="text-muted-foreground">{shared("noPrice")}</span>}
      </span>
    )
  }

  function commit(priceMinor: number | null) {
    onChange(
      included.map((variant) => variant.id),
      priceMinor
    )
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          // A fixed price every variant here shares fills the field; mixed or no fixed prices leave it blank.
          setText(allFixed && new Set(fixed).size === 1 ? moneyText(fixed[0], locale) : "")
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            disabled={!included.length}
            aria-label={t(allFixed ? "fixedPriceFor" : "priceFor", { name, price: shown ?? t("noPriceLower") })}
            className="-me-2 font-normal tabular-nums"
          />
        }
      >
        {allFixed && <span className="text-xs text-muted-foreground">{t("fixed")}</span>}
        {shown ?? <span className="text-muted-foreground">{shared("noPrice")}</span>}
        <Pencil data-icon="inline-end" className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (typed !== undefined) {
              commit(typed)
            }
          }}
        >
          <Field>
            <FieldLabel htmlFor={id}>{t("fixedPrice", { count: included.length })}</FieldLabel>
            <InputGroup>
              <InputGroupAddon>
                <InputGroupText>{currencySymbol(currency, locale)}</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                id={id}
                inputMode="decimal"
                autoComplete="off"
                value={text}
                aria-invalid={typed === undefined || undefined}
                className="text-end tabular-nums"
                onChange={(event) => setText(event.target.value)}
              />
            </InputGroup>
            <FieldDescription>
              {adjusted ? t(several ? basis.several : basis.one, { prices: adjusted }) : t("noProductPrice")}
            </FieldDescription>
          </Field>
          <div className="flex flex-wrap justify-end gap-2">
            {fixed.length > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => commit(null)}>
                {t(several ? basis.useSeveral : basis.useOne)}
              </Button>
            )}
            <Button type="submit" size="sm" disabled={typed === undefined}>
              {shared("done")}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
