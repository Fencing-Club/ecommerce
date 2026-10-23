import { Input, Label } from "@buildkitgg/shadcn-baseui-kit"
import { variantStockTargetSchema } from "@repo/copacker-contract"
import { useId } from "react"
import { useController, useWatch } from "react-hook-form"
import { useTranslations } from "use-intl"
import { z } from "zod"
import { useMessageText } from "@/hooks/use-error-text"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import { FormNumber } from "./form-controls"

// What Copacker keeps for a variation: its supplier SKU, ASIN, and the least stock to keep at Amazon and at the buyer's
// own locations. No minimum means none; an Amazon minimum of 0 means the variation isn't stocked there.
const stockTargetsSchema = z.object({
  revision: z.number().int().min(0),
  targets: z.array(
    variantStockTargetSchema.extend({
      quantity: z
        .number("products.details.enterWholeNumber")
        .int("products.details.enterWholeNumber")
        .min(0)
        .max(1000000)
        .nullable(),
      originalQuantity: z.number().nullable().optional(),
      name: z.string().nullable().optional(),
      provider: z.enum(["amazon", "store"]).optional()
    })
  )
})

export type VariationFields = {
  stockTargets?: z.infer<typeof stockTargetsSchema>
  supplierSku: string | null
  asin: string | null
  amazonStockTarget: number | null
  storeStockTarget: number | null
}
// What's sent to save them. Empty text clears a value.
type VariationInput = {
  stockTargets?: { revision: number; targets: z.infer<typeof variantStockTargetSchema>[] }
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
  stockTargets: stockTargetsSchema.optional(),
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
    ...(variation.stockTargets && {
      stockTargets: {
        ...variation.stockTargets,
        targets: variation.stockTargets.targets.map((target) => ({ ...target, originalQuantity: target.quantity }))
      }
    }),
    variantId: variation.variantId,
    supplierSku: variation.supplierSku ?? "",
    asin: variation.asin ?? "",
    amazonStockTarget: variation.amazonStockTarget,
    storeStockTarget: variation.storeStockTarget
  }
}

export function variationInput(values: VariationValues): VariationInput {
  return {
    ...(values.stockTargets && {
      stockTargets: {
        revision: values.stockTargets.revision,
        targets: values.stockTargets.targets.flatMap(
          ({ id, quantity, stocked, destination, provider, originalQuantity }) =>
            quantity === null
              ? []
              : [
                  {
                    id,
                    quantity,
                    stocked: provider === "amazon" && quantity !== originalQuantity ? quantity !== 0 : stocked,
                    destination
                  }
                ]
        )
      }
    }),
    supplierSku: values.supplierSku,
    asin: values.asin,
    amazonStockTarget: values.amazonStockTarget,
    storeStockTarget: values.storeStockTarget
  }
}

export function sameVariation(a: VariationInput, b: VariationInput) {
  return (
    JSON.stringify(a.stockTargets) === JSON.stringify(b.stockTargets) &&
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
  numeric = false,
  showLabel = false
}: {
  name: string
  label: string
  variation: string
  numeric?: boolean
  showLabel?: boolean
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
      <Label htmlFor={id} className={cn("text-xs font-normal text-muted-foreground", !showLabel && "@lg:sr-only")}>
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
                <TargetQuantityFields index={index} provider="amazon" variation={label} compact />
                <TargetQuantityFields index={index} provider="store" variation={label} compact />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// The existing quantity fields follow target identities. A pool is edited once, even when it contains several locations.
export function TargetQuantityFields({
  index,
  provider,
  variation,
  compact = false
}: {
  index: number
  provider: "amazon" | "store"
  variation?: string
  compact?: boolean
}) {
  const t = useTranslations("products.variations")
  const targets = useWatch<{ variations: VariationValues[] }, `variations.${number}.stockTargets`>({
    name: `variations.${index}.stockTargets`
  })
  const field = provider === "amazon" ? "amazonStockTarget" : "storeStockTarget"
  const label = t(provider === "amazon" ? "amazonMinimum" : "warehouseMinimum")
  const matches =
    targets?.targets.flatMap((target, targetIndex) =>
      target.provider === provider ? [{ target, targetIndex }] : []
    ) ?? []
  if (!targets || !matches.length) {
    return compact ? (
      <Cell name={`variations.${index}.${field}`} label={label} variation={variation ?? ""} numeric />
    ) : (
      <FormNumber
        name={`variations.${index}.${field}`}
        label={label}
        description={provider === "amazon" ? t("amazonMinimumHint") : undefined}
        min={0}
        step={1}
      />
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {matches.map(({ target, targetIndex }) => {
        const name = `variations.${index}.stockTargets.targets.${targetIndex}.quantity`
        const targetLabel = matches.length === 1 ? label : (target.name ?? label)
        return compact ? (
          <Cell
            key={target.id}
            name={name}
            label={targetLabel}
            variation={variation ?? ""}
            numeric
            showLabel={matches.length > 1}
          />
        ) : (
          <FormNumber
            key={target.id}
            name={name}
            label={targetLabel}
            description={provider === "amazon" ? t("amazonMinimumHint") : undefined}
            min={0}
            step={1}
          />
        )
      })}
    </div>
  )
}
