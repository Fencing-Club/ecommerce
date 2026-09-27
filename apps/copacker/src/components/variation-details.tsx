"use client"

import { useId, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api, errorMessage } from "@/lib/api"
import { FormError } from "./actions"
import * as styles from "./inventory-products.css"

type Details = {
  supplierSku: string | null
  asin: string | null
  amazonStockTarget: number | null
  storeStockTarget: number | null
}

const variationDetailsApi = api.injectEndpoints({
  overrideExisting: true,
  endpoints: (build) => ({
    saveVariationDetails: build.mutation<Details, Partial<Details> & { variantId: string }>({
      query: (body) => ({ url: "inventory/variant-fields", method: "PATCH", body }),
      // Restock matches supplier catalogs on the supplier SKU and aims for the stock targets.
      invalidatesTags: ["Restock"]
    })
  })
})

export type DetailsVariation = Details & { variantId: string; title: string | null }

// A whole number of units, or empty for none.
const units = (text: string) => (text.trim() === "" ? null : Number(text))
const shown = (value: number | null) => (value === null ? "" : String(value))

function VariationRow({
  variation,
  label,
  onChanged
}: {
  variation: DetailsVariation
  label: string
  onChanged: () => void
}) {
  const id = useId()
  const [save, { isLoading: saving }] = variationDetailsApi.useSaveVariationDetailsMutation()
  const initial = {
    supplierSku: variation.supplierSku ?? "",
    asin: variation.asin ?? "",
    amazonStockTarget: shown(variation.amazonStockTarget),
    storeStockTarget: shown(variation.storeStockTarget)
  }
  // What's saved, updated on save so the row doesn't wait for the page to reload.
  const [saved, setSaved] = useState(initial)
  const [values, setValues] = useState(initial)
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)
  const changed = (Object.keys(values) as (keyof typeof values)[]).some(
    (key) => values[key].trim() !== saved[key].trim()
  )
  const invalid = [values.amazonStockTarget, values.storeStockTarget].some(
    (text) => text.trim() !== "" && !/^\d+$/.test(text.trim())
  )

  async function submit() {
    if (!changed || saving) {
      return
    }
    if (invalid) {
      setError("Enter whole numbers of units, or leave them empty.")
      return
    }
    setError("")
    try {
      const result = await save({
        variantId: variation.variantId,
        supplierSku: values.supplierSku,
        asin: values.asin,
        amazonStockTarget: units(values.amazonStockTarget),
        storeStockTarget: units(values.storeStockTarget)
      }).unwrap()
      const next = {
        supplierSku: result.supplierSku ?? "",
        asin: result.asin ?? "",
        amazonStockTarget: shown(result.amazonStockTarget),
        storeStockTarget: shown(result.storeStockTarget)
      }
      setSaved(next)
      setValues(next)
      setDone(true)
      onChanged()
    } catch (e) {
      setError(errorMessage(e, "The details couldn't be saved. Try again."))
    }
  }

  const field = (key: keyof typeof values, name: string, numeric = false) => (
    <div className={styles.variationField}>
      <Label htmlFor={`${id}-${key}`} className={styles.detail}>
        {name}
        <span className={styles.srOnlyLegend}> for {label}</span>
      </Label>
      <Input
        id={`${id}-${key}`}
        value={values[key]}
        maxLength={255}
        autoComplete="off"
        placeholder="Not set"
        inputMode={numeric ? "numeric" : undefined}
        aria-invalid={error ? true : undefined}
        onChange={(event) => {
          setValues({ ...values, [key]: event.target.value })
          setDone(false)
        }}
        onKeyDown={(event) => {
          // Saves this row rather than submitting the panel's form.
          if (event.key === "Enter") {
            event.preventDefault()
            void submit()
          }
        }}
      />
    </div>
  )

  return (
    <li className={styles.variation}>
      <div className={styles.variationHeading}>
        <span className={styles.title}>{label}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!changed || saving}
          aria-label={`Save details for ${label}`}
          onClick={() => void submit()}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
      <div className={styles.variationFields}>
        {field("supplierSku", "Supplier SKU")}
        {field("asin", "ASIN")}
        {field("amazonStockTarget", "Amazon minimum", true)}
        {field("storeStockTarget", "Warehouse minimum", true)}
      </div>
      <output className={styles.detail}>{done && !changed ? "Saved" : ""}</output>
      <FormError message={error} />
    </li>
  )
}

// Each variation's supplier SKU, ASIN and minimum stock. Each row saves on its own, apart from the product's details.
export function VariationDetails({
  productTitle,
  variations,
  onChanged
}: {
  productTitle: string
  variations: DetailsVariation[]
  onChanged: () => void
}) {
  return (
    <section className={styles.variations} aria-labelledby="variation-details">
      <h3 id="variation-details" className={styles.title}>
        Variations
      </h3>
      <ul className={styles.variationList}>
        {variations.map((variation) => (
          <VariationRow
            key={variation.variantId}
            variation={variation}
            label={variation.title ?? productTitle}
            onChanged={onChanged}
          />
        ))}
      </ul>
    </section>
  )
}
