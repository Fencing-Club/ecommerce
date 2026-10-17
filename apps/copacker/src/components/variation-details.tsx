import { useId } from "react"
import { useController } from "react-hook-form"
import { useTranslations } from "use-intl"
import { z } from "zod"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useMessageText } from "@/hooks/use-error-text"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

// What Copacker keeps for a variation: its supplier SKU, ASIN, and the least stock to keep at Amazon and at the buyer's
// own locations. No minimum means none; an Amazon minimum of 0 means the variation isn't stocked there.
export type VariationFields = {
  supplierSku: string | null
  asin: string | null
  amazonStockTarget: number | null
  storeStockTarget: number | null
}
// What's sent to save them. Empty text clears a value.
type VariationInput = {
  supplierSku: string
  asin: string
  amazonStockTarget: number | null
  storeStockTarget: number | null
}

const variationDetailsApi = api.injectEndpoints({
  overrideExisting: true,
  endpoints: (build) => ({
    saveVariationDetails: build.mutation<VariationFields, VariationInput & { variantId: string }>({
      query: (body) => ({ url: "inventory/variant-fields", method: "PATCH", body }),
      // Restock matches supplier catalogs on the supplier SKU and aims for the stock minimums.
      invalidatesTags: ["Restock"]
    })
  })
})

export const { useSaveVariationDetailsMutation } = variationDetailsApi

const text = z.string().trim().max(255)
const wholeNumber = "products.details.enterWholeNumber"
const minimum = z.number(wholeNumber).int(wholeNumber).min(0).max(1000000).nullable()
export const variationSchema = z.object({
  variantId: z.string(),
  supplierSku: text,
  asin: text,
  amazonStockTarget: minimum,
  storeStockTarget: minimum
})
type VariationValues = z.output<typeof variationSchema>

// A variation's saved fields as the product form's values.
export function variationValues(variation: VariationFields & { variantId: string }): VariationValues {
  return {
    variantId: variation.variantId,
    supplierSku: variation.supplierSku ?? "",
    asin: variation.asin ?? "",
    amazonStockTarget: variation.amazonStockTarget,
    storeStockTarget: variation.storeStockTarget
  }
}

export function variationInput(values: VariationValues): VariationInput {
  return {
    supplierSku: values.supplierSku,
    asin: values.asin,
    amazonStockTarget: values.amazonStockTarget,
    storeStockTarget: values.storeStockTarget
  }
}

export function sameVariation(a: VariationInput, b: VariationInput) {
  return (
    a.supplierSku === b.supplierSku &&
    a.asin === b.asin &&
    a.amazonStockTarget === b.amazonStockTarget &&
    a.storeStockTarget === b.storeStockTarget
  )
}

// Wide enough, each variation's fields share its row under one set of column headings; narrower, every field keeps
// its own label.
const columns = "@lg:grid-cols-[minmax(0,1fr)_repeat(4,6.5rem)]"

// The part of a field's label only screen readers read.
function hidden(chunks: React.ReactNode) {
  return <span className="sr-only">{chunks}</span>
}

// Whole units from a number field, or null while it's empty, as in FormNumber, so the saved value doesn't come back.
function units(input: HTMLInputElement) {
  return input.value === "" ? null : input.valueAsNumber
}

function Cell({
  name,
  label,
  variation,
  numeric = false
}: {
  name: string
  label: string
  variation: string
  numeric?: boolean
}) {
  const t = useTranslations("products.variations")
  const messageText = useMessageText()
  const id = useId()
  const {
    field: { ref, value: fieldValue, onChange, onBlur, name: fieldName },
    fieldState
  } = useController({ name })
  let value: string | number = typeof fieldValue === "string" ? fieldValue : ""
  if (numeric) {
    value = typeof fieldValue === "number" && Number.isFinite(fieldValue) ? fieldValue : ""
  }
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground @lg:sr-only">
        {t.rich("fieldFor", {
          label,
          variation,
          hidden
        })}
      </Label>
      <Input
        id={id}
        ref={ref}
        name={fieldName}
        value={value}
        onBlur={onBlur}
        onChange={(event) => onChange(numeric ? units(event.target) : event.target.value)}
        type={numeric ? "number" : "text"}
        inputMode={numeric ? "numeric" : undefined}
        min={numeric ? 0 : undefined}
        step={numeric ? 1 : undefined}
        maxLength={numeric ? undefined : 255}
        placeholder={numeric ? "—" : undefined}
        autoComplete="off"
        aria-invalid={fieldState.invalid}
        className={cn(numeric && "text-end tabular-nums")}
      />
      {fieldState.error?.message && <p className="text-xs text-destructive">{messageText(fieldState.error.message)}</p>}
    </div>
  )
}

// Each variation's supplier SKU, ASIN and stock minimums, bound to the product form and saved with it.
export function VariationDetails({
  productTitle,
  variations
}: {
  productTitle: string
  variations: { variantId: string; title: string | null }[]
}) {
  const t = useTranslations("products.variations")
  return (
    <div className="@container">
      <div
        aria-hidden="true"
        className={cn("hidden gap-2 px-3 pb-1.5 text-xs font-medium text-muted-foreground @lg:grid", columns)}
      >
        <span>{t("variation")}</span>
        <span>{t("supplierSku")}</span>
        <span>ASIN</span>
        <span className="text-end" title={t("amazonMinimumHint")}>
          {t("amazonMin")}
        </span>
        <span className="text-end">{t("warehouseMin")}</span>
      </div>
      <ul className="divide-y rounded-lg border">
        {variations.map((variation, index) => {
          const label = variation.title ?? productTitle
          return (
            <li key={variation.variantId} className={cn("grid gap-2 p-3 @lg:items-start @lg:py-2", columns)}>
              <span className="text-sm font-medium [overflow-wrap:anywhere] @lg:pt-1.5">{label}</span>
              <div className="grid grid-cols-2 gap-2 @lg:contents">
                <Cell name={`variations.${index}.supplierSku`} label={t("supplierSku")} variation={label} />
                <Cell name={`variations.${index}.asin`} label="ASIN" variation={label} />
                <Cell
                  name={`variations.${index}.amazonStockTarget`}
                  label={t("amazonMinimum")}
                  variation={label}
                  numeric
                />
                <Cell
                  name={`variations.${index}.storeStockTarget`}
                  label={t("warehouseMinimum")}
                  variation={label}
                  numeric
                />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
