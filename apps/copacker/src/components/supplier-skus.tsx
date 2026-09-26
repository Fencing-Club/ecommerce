"use client"

import { useId, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api, errorMessage } from "@/lib/api"
import { FormError } from "./actions"
import * as styles from "./inventory-products.css"

const supplierSkusApi = api.injectEndpoints({
  overrideExisting: true,
  endpoints: (build) => ({
    saveSupplierSku: build.mutation<{ supplierSku: string | null }, { variantId: string; supplierSku: string }>({
      query: (body) => ({ url: "inventory/supplier-sku", method: "PATCH", body }),
      // Restock matches supplier catalogs on it.
      invalidatesTags: ["Restock"]
    })
  })
})

export type SupplierSkuVariation = { variantId: string; title: string | null; supplierSku: string | null }

function SupplierSkuRow({
  variation,
  label,
  onChanged
}: {
  variation: SupplierSkuVariation
  label: string
  onChanged: () => void
}) {
  const id = useId()
  const [save, { isLoading: saving }] = supplierSkusApi.useSaveSupplierSkuMutation()
  // The value Shopify holds, updated on save so the row doesn't wait for the page to reload.
  const [saved, setSaved] = useState(variation.supplierSku ?? "")
  const [value, setValue] = useState(saved)
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)
  const changed = value.trim() !== saved

  async function submit() {
    if (!changed || saving) {
      return
    }
    setError("")
    try {
      const result = await save({ variantId: variation.variantId, supplierSku: value }).unwrap()
      setSaved(result.supplierSku ?? "")
      setValue(result.supplierSku ?? "")
      setDone(true)
      onChanged()
    } catch (e) {
      setError(errorMessage(e, "The supplier SKU couldn't be saved. Try again."))
    }
  }

  return (
    <li className={styles.supplierSku}>
      <Label htmlFor={id} className={styles.title}>
        <span className={styles.srOnlyLegend}>Supplier SKU for </span>
        {label}
      </Label>
      <div className={styles.supplierSkuField}>
        <Input
          id={id}
          value={value}
          maxLength={255}
          autoComplete="off"
          placeholder="Not set"
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            setValue(event.target.value)
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!changed || saving}
          aria-label={`Save supplier SKU for ${label}`}
          onClick={() => void submit()}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
      <output className={styles.detail}>{done && !changed ? "Saved to Shopify" : ""}</output>
      <FormError message={error} />
    </li>
  )
}

// Each variation's SKU in its supplier's catalog. Saves go to Shopify right away, separately from the product's details.
export function SupplierSkus({
  productTitle,
  variations,
  onChanged
}: {
  productTitle: string
  variations: SupplierSkuVariation[]
  onChanged: () => void
}) {
  return (
    <section className={styles.supplierSkus} aria-labelledby="supplier-skus">
      <h3 id="supplier-skus" className={styles.title}>
        Supplier SKUs
      </h3>
      <p className={styles.detail}>
        Saved to Shopify right away. Supplier catalogs and POs match products by their supplier SKU.
      </p>
      <ul className={styles.supplierSkuList}>
        {variations.map((variation) => (
          <SupplierSkuRow
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
