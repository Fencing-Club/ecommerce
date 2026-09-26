"use client"

import { Download, Eye, EyeOff, Trash2, Upload } from "lucide-react"
import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { api, errorMessage } from "@/lib/api"
import type { ProductLabel } from "@/lib/product-label"
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

export type BarcodeVariation = {
  variantId: string
  title: string | null
  barcode: ProductBarcode | null
  // Amazon's FNSKU for the standard label; null until the FBA sync reports one.
  fnsku: string | null
}

// The variation's label as a PDF: its uploaded barcode, or else the standard FNSKU sheet. It's fetched first so a label
// that can't be made, such as one whose FNSKU Amazon doesn't list, explains why in the row.
async function fetchLabel(variantId: string) {
  const response = await fetch(`/api/inventory/barcodes?${new URLSearchParams({ variantId })}`)
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    throw new Error(
      typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
        ? body.error
        : "The label couldn't be loaded. Try again."
    )
  }
  const disposition = response.headers.get("content-disposition") ?? ""
  const name = decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(disposition)?.[1] ?? "Label.pdf")
  return { blob: await response.blob(), name }
}

// What a PO line for this variation gets as its product label.
function LabelSource({ variation, productLabel }: { variation: BarcodeVariation; productLabel: ProductLabel }) {
  if (variation.barcode) {
    return <span className={styles.detail}>Uploaded: {variation.barcode.name}</span>
  }
  if (productLabel === "uploaded") {
    return <WarningNote>No label uploaded</WarningNote>
  }
  return (
    <span className={styles.detail}>
      {variation.fnsku ? `Standard label, FNSKU ${variation.fnsku}` : "Standard label"}
    </span>
  )
}

function BarcodeRow({
  variation,
  label,
  productLabel,
  onChanged
}: {
  variation: BarcodeVariation
  label: string
  productLabel: ProductLabel
  onChanged: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [upload, { isLoading: uploading }] = barcodesApi.useUploadBarcodeMutation()
  const [remove, { isLoading: removing }] = barcodesApi.useRemoveBarcodeMutation()
  const [error, setError] = useState("")
  // The shown label's object URL, while previewing.
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState<"preview" | "download" | null>(null)
  const { barcode } = variation
  const verb = barcode ? "Replace" : "Upload"
  // There's a label to show when one was uploaded, or the standard label applies. Its FNSKU is looked up if needed.
  const viewable = barcode !== null || productLabel === "standard"

  let previewText = preview ? "Hide" : "Preview"
  if (loading === "preview") {
    previewText = "Loading…"
  }

  function closePreview() {
    if (preview) {
      URL.revokeObjectURL(preview)
    }
    setPreview(null)
  }

  async function show() {
    if (preview) {
      closePreview()
      return
    }
    setError("")
    setLoading("preview")
    try {
      const { blob } = await fetchLabel(variation.variantId)
      setPreview(URL.createObjectURL(blob))
    } catch (e) {
      setError(errorMessage(e, "The label couldn't be loaded. Try again."))
    } finally {
      setLoading(null)
    }
  }

  async function download() {
    setError("")
    setLoading("download")
    try {
      const { blob, name } = await fetchLabel(variation.variantId)
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = name
      link.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(errorMessage(e, "The label couldn't be downloaded. Try again."))
    } finally {
      setLoading(null)
    }
  }

  async function send(file: File) {
    setError("")
    const data = new FormData()
    data.set("variantId", variation.variantId)
    data.set("file", file)
    try {
      await upload(data).unwrap()
      closePreview()
      onChanged()
    } catch (e) {
      setError(errorMessage(e, "The barcode couldn't be uploaded. Try again."))
    }
  }

  async function clear() {
    setError("")
    try {
      await remove(variation.variantId).unwrap()
      closePreview()
      onChanged()
    } catch (e) {
      setError(errorMessage(e, "The barcode couldn't be removed. Try again."))
    }
  }

  return (
    <li className={styles.barcode}>
      <div className={styles.barcodeInfo}>
        <span className={styles.title}>{label}</span>
        <LabelSource variation={variation} productLabel={productLabel} />
      </div>
      <div className={styles.barcodeActions}>
        <input
          ref={input}
          type="file"
          accept="application/pdf"
          hidden
          aria-label={`Label PDF for ${label}`}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (file) {
              void send(file)
            }
          }}
        />
        {viewable && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={loading !== null}
            aria-expanded={preview !== null}
            aria-label={`${preview ? "Hide" : "Preview"} label for ${label}`}
            onClick={() => void show()}
          >
            {preview ? <EyeOff data-icon="inline-start" /> : <Eye data-icon="inline-start" />}
            {previewText}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={uploading || removing}
          aria-label={`${verb} label for ${label}`}
          onClick={() => input.current?.click()}
        >
          <Upload data-icon="inline-start" />
          {uploading ? "Uploading…" : verb}
        </Button>
        {viewable && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={loading !== null}
            aria-label={`Download label for ${label}`}
            onClick={() => void download()}
          >
            <Download data-icon="inline-start" />
            {loading === "download" ? "Downloading…" : "Download"}
          </Button>
        )}
        {barcode && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={uploading || removing}
            aria-label={`Remove uploaded label for ${label}`}
            onClick={() => void clear()}
          >
            <Trash2 data-icon="inline-start" />
            Remove
          </Button>
        )}
      </div>
      {preview && (
        <iframe src={`${preview}#toolbar=0&view=FitH`} title={`Label for ${label}`} className={styles.preview} />
      )}
      {error && (
        <div className={styles.barcodeError}>
          <FormError message={error} />
        </div>
      )}
    </li>
  )
}

// Each variation's product label. Uploads save right away, separately from the rest of the product's details.
export function ProductBarcodes({
  productTitle,
  productLabel,
  variations,
  onChanged
}: {
  productTitle: string
  productLabel: ProductLabel
  variations: BarcodeVariation[]
  onChanged: () => void
}) {
  return (
    <section className={styles.barcodes} aria-labelledby="barcodes">
      <h3 id="barcodes" className={styles.title}>
        Labels
      </h3>
      <p className={styles.detail}>
        {productLabel === "standard"
          ? "New POs include each variation’s label for your supplier to print: an uploaded one-page PDF, or else the standard label with its Amazon FNSKU (or Shopify SKU without Amazon) and Shopify title. Uploads are saved right away."
          : "Upload a one-page PDF label for each variation, such as one with its size measurements. New POs include it for your supplier to print. Uploads are saved right away."}
      </p>
      <ul className={styles.barcodeList}>
        {variations.map((variation) => (
          <BarcodeRow
            key={variation.variantId}
            variation={variation}
            label={variation.title ?? productTitle}
            productLabel={productLabel}
            onChanged={onChanged}
          />
        ))}
      </ul>
    </section>
  )
}
