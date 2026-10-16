import { Download, Eye, EyeOff, Trash2, Upload } from "lucide-react"
import { useRef, useState } from "react"
import { useTranslations } from "use-intl"
import { useCan } from "@/components/access"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useErrorMessage } from "@/hooks/use-error-text"
import { api } from "@/lib/api"
import type { ProductLabel } from "@/lib/product-label"
import { cn } from "@/lib/utils"
import type { BarcodeTarget } from "@/server/product-barcodes"
import type { ProductBarcode } from "@/server/product-barcodes"
import { fileName, WarningNote } from "./common"

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
// that can't be made, such as one whose FNSKU Amazon doesn't list, explains why in the row. `fallback` is the failure
// and file name to show when the server gives neither.
async function fetchLabel(variantId: string, fallback: { error: string; name: string }) {
  const response = await fetch(`/api/inventory/barcodes?${new URLSearchParams({ variantId })}`)
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    throw new Error(
      typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
        ? body.error
        : fallback.error
    )
  }
  const disposition = response.headers.get("content-disposition") ?? ""
  const name = decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(disposition)?.[1] ?? fallback.name)
  return { blob: await response.blob(), name }
}

// What a PO line for this variation gets as its product label. Without an FNSKU, the standard label shows the SKU.
function LabelSource({ variation, productLabel }: { variation: BarcodeVariation; productLabel: ProductLabel }) {
  const t = useTranslations("products.barcodes")
  if (variation.barcode) {
    return <>{t.rich("uploadedSource", { name: variation.barcode.name, file: fileName })}</>
  }
  if (productLabel === "uploaded") {
    return <WarningNote>{t("labelMissing")}</WarningNote>
  }
  const { fnsku } = variation
  if (productLabel === "none") {
    return <>{fnsku ? t("amazonOnlyFnsku", { fnsku }) : t("amazonOnly")}</>
  }
  return <>{fnsku ? t("standardFnsku", { fnsku }) : t("standardSku")}</>
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
  const t = useTranslations("products.barcodes")
  const errorMessage = useErrorMessage()
  const input = useRef<HTMLInputElement>(null)
  const [upload, { isLoading: uploading }] = barcodesApi.useUploadBarcodeMutation()
  const [remove, { isLoading: removing }] = barcodesApi.useRemoveBarcodeMutation()
  // Someone who can only view products previews and downloads labels without changing them.
  const editable = useCan("products", "edit")
  const [error, setError] = useState("")
  // The shown label's object URL, while previewing.
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState<"preview" | "download" | null>(null)
  const { barcode } = variation
  const fallback = { error: t("loadFailed"), name: t("fileName") }
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
      const { blob } = await fetchLabel(variation.variantId, fallback)
      setPreview(URL.createObjectURL(blob))
    } catch (e) {
      setError(errorMessage(e, t("loadFailed")))
    } finally {
      setLoading(null)
    }
  }

  async function download() {
    setError("")
    setLoading("download")
    try {
      const { blob, name } = await fetchLabel(variation.variantId, fallback)
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = name
      link.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(errorMessage(e, t("downloadFailed")))
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
      setError(errorMessage(e, t("uploadFailed")))
    }
  }

  async function clear() {
    setError("")
    try {
      await remove(variation.variantId).unwrap()
      closePreview()
      onChanged()
    } catch (e) {
      setError(errorMessage(e, t("removeFailed")))
    }
  }

  return (
    <li className="flex flex-col gap-2 py-2 pe-2 ps-3">
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
          aria-label={t("fileInput", { label })}
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
              tip={preview ? t("hidePreview") : t("preview")}
              label={preview ? t("hideLabelFor", { label }) : t("previewLabelFor", { label })}
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
              tip={t("download")}
              label={t("downloadLabelFor", { label })}
              busy={loading === "download"}
              disabled={loading !== null}
              onClick={() => void download()}
            >
              <Download />
            </IconAction>
          )}
          {editable && (
            <IconAction
              tip={barcode ? t("replace") : t("upload")}
              label={barcode ? t("replaceLabelFor", { label }) : t("uploadLabelFor", { label })}
              busy={uploading}
              disabled={uploading || removing}
              onClick={() => input.current?.click()}
            >
              <Upload />
            </IconAction>
          )}
          {editable && barcode && (
            <IconAction
              tip={t("remove")}
              label={t("removeLabelFor", { label })}
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
          title={t("labelFor", { label })}
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
  const t = useTranslations("products.barcodes")
  return (
    <ul aria-label={t("list")} className="divide-y rounded-lg border">
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
