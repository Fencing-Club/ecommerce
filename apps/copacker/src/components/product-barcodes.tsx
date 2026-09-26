"use client"

import { Download, Trash2, Upload } from "lucide-react"
import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { api, errorMessage } from "@/lib/api"
import type { BarcodeTarget, ProductBarcode } from "@/server/product-barcodes"
import { FormError } from "./actions"
import { WarningNote } from "./common"
import * as styles from "./inventory-products.css"

const barcodesApi = api.injectEndpoints({
  overrideExisting: true,
  endpoints: (build) => ({
    uploadBarcode: build.mutation<ProductBarcode & { replaced: boolean; target: BarcodeTarget }, FormData>({
      query: (body) => ({ url: "inventory/barcodes", method: "POST", body })
    }),
    removeBarcode: build.mutation<{ ok: true }, string>({
      query: (variantId) => ({ url: "inventory/barcodes", method: "DELETE", params: { variantId } })
    })
  })
})

export const { useUploadBarcodeMutation } = barcodesApi

export type BarcodeVariation = { variantId: string; title: string | null; barcode: ProductBarcode | null }

const barcodeHref = (variantId: string) => `/api/inventory/barcodes?${new URLSearchParams({ variantId })}`

function BarcodeRow({
  variation,
  label,
  onChanged
}: {
  variation: BarcodeVariation
  label: string
  onChanged: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [upload, { isLoading: uploading }] = barcodesApi.useUploadBarcodeMutation()
  const [remove, { isLoading: removing }] = barcodesApi.useRemoveBarcodeMutation()
  const [error, setError] = useState("")
  const { barcode } = variation
  const verb = barcode ? "Replace" : "Upload"

  async function send(file: File) {
    setError("")
    const data = new FormData()
    data.set("variantId", variation.variantId)
    data.set("file", file)
    try {
      await upload(data).unwrap()
      onChanged()
    } catch (e) {
      setError(errorMessage(e, "The barcode couldn't be uploaded. Try again."))
    }
  }

  async function clear() {
    setError("")
    try {
      await remove(variation.variantId).unwrap()
      onChanged()
    } catch (e) {
      setError(errorMessage(e, "The barcode couldn't be removed. Try again."))
    }
  }

  return (
    <li className={styles.barcode}>
      <div className={styles.barcodeInfo}>
        <span className={styles.title}>{label}</span>
        {barcode ? <span className={styles.detail}>{barcode.name}</span> : <WarningNote>No barcode</WarningNote>}
      </div>
      <div className={styles.barcodeActions}>
        <input
          ref={input}
          type="file"
          accept="application/pdf"
          hidden
          aria-label={`Barcode PDF for ${label}`}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (file) {
              void send(file)
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={uploading || removing}
          aria-label={`${verb} barcode for ${label}`}
          onClick={() => input.current?.click()}
        >
          <Upload data-icon="inline-start" />
          {uploading ? "Uploading…" : verb}
        </Button>
        {barcode && (
          <>
            <Button
              variant="ghost"
              size="xs"
              nativeButton={false}
              render={
                <a href={barcodeHref(variation.variantId)} download aria-label={`Download barcode for ${label}`} />
              }
            >
              <Download data-icon="inline-start" />
              Download
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={uploading || removing}
              aria-label={`Remove barcode for ${label}`}
              onClick={() => void clear()}
            >
              <Trash2 data-icon="inline-start" />
              Remove
            </Button>
          </>
        )}
      </div>
      {error && (
        <div className={styles.barcodeError}>
          <FormError message={error} />
        </div>
      )}
    </li>
  )
}

// Each variation's barcode label. Uploads save right away, separately from the rest of the product's details.
export function ProductBarcodes({
  productTitle,
  variations,
  onChanged
}: {
  productTitle: string
  variations: BarcodeVariation[]
  onChanged: () => void
}) {
  return (
    <section className={styles.barcodes} aria-labelledby="barcodes">
      <h3 id="barcodes" className={styles.title}>
        Barcodes
      </h3>
      <p className={styles.detail}>
        Upload a one-page PDF label for each variation. New POs include it as the product label for your supplier to
        print. Uploads are saved right away.
      </p>
      <ul className={styles.barcodeList}>
        {variations.map((variation) => (
          <BarcodeRow
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
