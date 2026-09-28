"use client"

import { Download, Eye, EyeOff, Trash2, Upload } from "lucide-react"
import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api, errorMessage } from "@/lib/api"
import type { ProductLabel } from "@/lib/product-label"
import { cn } from "@/lib/utils"
import type { BarcodeTarget, ProductBarcode } from "@/server/product-barcodes"
import { WarningNote } from "./common"

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

// What a PO line for this variation gets as its product label. Without an FNSKU, the standard label shows the SKU.
function LabelSource({ variation, productLabel }: { variation: BarcodeVariation; productLabel: ProductLabel }) {
  if (variation.barcode) {
    return <>Uploaded, {variation.barcode.name}</>
  }
  if (productLabel === "uploaded") {
    return <WarningNote>Label missing</WarningNote>
  }
  const fnsku = variation.fnsku ? `FNSKU ${variation.fnsku}` : null
  if (productLabel === "none") {
    return <>{fnsku ? `Amazon only, ${fnsku}` : "Amazon only"}</>
  }
  return <>{`Standard, ${fnsku ?? "SKU barcode"}`}</>
}

// A small ghost icon button with its name in a tooltip.
function IconAction({
  tip,
  label,
  busy = false,
  expanded,
  disabled,
  onClick,
  children
}: {
  tip: string
  label: string
  busy?: boolean
  expanded?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground"
            aria-label={label}
            aria-expanded={expanded}
            aria-busy={busy || undefined}
            disabled={disabled}
            onClick={onClick}
          />
        }
      >
        {busy ? <Spinner /> : children}
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
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
  const viewable = barcode !== null || productLabel !== "uploaded"

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
    <li className="flex flex-col gap-2 py-2 pr-2 pl-3">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {variation.title && <span className="text-sm font-medium [overflow-wrap:anywhere]">{variation.title}</span>}
          <span
            className={cn("text-muted-foreground [overflow-wrap:anywhere]", variation.title ? "text-xs" : "text-sm")}
          >
            <LabelSource variation={variation} productLabel={productLabel} />
          </span>
        </div>
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
        <div className="flex shrink-0 items-center">
          {viewable && (
            <IconAction
              tip={preview ? "Hide preview" : "Preview"}
              label={`${preview ? "Hide" : "Preview"} label for ${label}`}
              busy={loading === "preview"}
              expanded={preview !== null}
              disabled={loading !== null}
              onClick={() => void show()}
            >
              {preview ? <EyeOff /> : <Eye />}
            </IconAction>
          )}
          {viewable && (
            <IconAction
              tip="Download"
              label={`Download label for ${label}`}
              busy={loading === "download"}
              disabled={loading !== null}
              onClick={() => void download()}
            >
              <Download />
            </IconAction>
          )}
          <IconAction
            tip={verb}
            label={`${verb} label for ${label}`}
            busy={uploading}
            disabled={uploading || removing}
            onClick={() => input.current?.click()}
          >
            <Upload />
          </IconAction>
          {barcode && (
            <IconAction
              tip="Remove"
              label={`Remove uploaded label for ${label}`}
              busy={removing}
              disabled={uploading || removing}
              onClick={() => void clear()}
            >
              <Trash2 />
            </IconAction>
          )}
        </div>
      </div>
      {preview && (
        <iframe
          src={`${preview}#toolbar=0&view=FitH`}
          title={`Label for ${label}`}
          className="h-72 w-full rounded-md border bg-muted"
        />
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </li>
  )
}

// Each variation's product label. Uploads save right away, apart from the rest of the product's details.
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
    <ul aria-label="Labels" className="divide-y rounded-lg border">
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
  )
}
