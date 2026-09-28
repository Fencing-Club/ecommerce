"use client"

import { CheckCircle2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { useId, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useErrorMessage } from "@/hooks/use-error-text"
import { useUploadDocumentMutation } from "@/lib/api"
import { cn } from "@/lib/utils"
import { FileDropzone, pdfFiles } from "./file-dropzone"
import { SelectField } from "./form-fields"

// Each document's name, as its key under the "common" messages' `upload.titles`.
const titles = {
  invoice: "invoice",
  product_label: "productLabels",
  shipping_label: "shippingLabels"
} as const

// The documents route takes one PDF of up to 32 MB.
const maxBytes = 32 * 1024 * 1024

// Uploads a PDF to a purchase order or shipment, with the variation or the carton pages the document needs. The file
// uploads as soon as it's chosen. A document that needs those details waits for the Upload button in the file's row,
// since they're filled in after choosing the file.
export function Upload({
  orderId,
  shipmentId,
  kind,
  label,
  items = [],
  cartons = [],
  current,
  error: problem,
  ref
}: {
  orderId: string
  shipmentId?: string
  kind: "invoice" | "product_label" | "shipping_label"
  // The field's label: the document's name when left out, or null for none, such as in a card titled for the document.
  label?: string | null
  items?: Array<{ id: string; name: string; variant: string }>
  cartons?: Array<{ cartonId: string }>
  // The document already uploaded, such as a shipment's invoice, which the next upload replaces. It shows in place of
  // the dropzone, with Replace.
  current?: { id: string; name: string; size?: number }
  // The parent's problem with the document, such as a required invoice that's missing.
  error?: string
  // The button that chooses the file, for a form to focus when the document is required.
  ref?: React.Ref<HTMLButtonElement>
}) {
  const t = useTranslations("common.upload")
  const router = useRouter()
  const errorMessage = useErrorMessage()
  const [upload] = useUploadDocumentMutation()
  const form = useRef<HTMLFormElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<"ready" | "uploading" | "uploaded">("ready")
  const [itemId, setItemId] = useState("")
  const [error, setError] = useState("")
  const id = useId()
  const needsDetails = kind === "shipping_label" || items.length > 0
  // Once the refreshed page shows the uploaded file as the current document, the row shows that instead.
  const [currentId, setCurrentId] = useState(current?.id)
  if (current?.id !== currentId) {
    setCurrentId(current?.id)
    if (status === "uploaded") {
      setFile(null)
      setStatus("ready")
    }
  }

  async function send(chosen: File, target: HTMLFormElement) {
    setError("")
    if (items.length > 0 && !itemId) {
      setError(t("chooseVariationError"))
      return
    }
    const data = new FormData(target)
    data.set("orderId", orderId)
    data.set("kind", kind)
    data.set("file", chosen)
    if (itemId) {
      data.set("itemId", itemId)
    }
    if (shipmentId) {
      data.set("shipmentId", shipmentId)
    }
    if (kind === "shipping_label") {
      const assignments = cartons.flatMap((c) => {
        const page = Number(data.get(`page:${c.cartonId}`))
        return page > 0 ? [{ cartonId: c.cartonId, page }] : []
      })
      if (!assignments.length) {
        setError(t("enterLabelPage"))
        return
      }
      data.set("assignments", JSON.stringify(assignments))
    }
    setStatus("uploading")
    try {
      await upload(data).unwrap()
      target.reset()
      setItemId("")
      setStatus("uploaded")
      router.refresh()
    } catch (e) {
      setStatus("ready")
      setError(errorMessage(e, t("failed")))
    }
  }

  function choose(next: File | null) {
    setFile(next)
    setStatus("ready")
    setError("")
    if (next && !needsDetails && form.current) {
      void send(next, form.current)
    }
  }

  return (
    <form
      ref={form}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (!file) {
          setError(t("choosePdf"))
        } else if (status === "ready") {
          void send(file, event.currentTarget)
        }
      }}
    >
      <FieldGroup>
        {items.length > 0 && (
          <SelectField
            label={t("variation")}
            id={`${id}-item`}
            required
            placeholder={t("chooseVariation")}
            options={items.map((i) => ({ value: i.id, label: `${i.name} / ${i.variant}` }))}
            value={itemId}
            onChange={(event) => setItemId(event.target.value)}
          />
        )}
        <FileDropzone
          id={`${id}-drop`}
          label={label === undefined ? t(`titles.${titles[kind]}`) : label}
          hint={kind === "product_label" ? t("productLabelHint") : undefined}
          accept={pdfFiles}
          maxBytes={maxBytes}
          file={file}
          onFileChange={choose}
          current={current && { name: current.name, size: current.size, href: `/api/documents/${current.id}` }}
          disabled={status === "uploading"}
          // A chosen file answers the parent's problem, such as a missing invoice, while it uploads.
          error={error || (file ? undefined : problem)}
          ref={ref}
        >
          {/* Kept in place while empty, so screen readers announce the upload's progress. Not an <output>: the form's
              reset after an upload would replace an output's content. */}
          <span
            aria-live="polite"
            className={cn(
              "flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground [&>svg]:size-3.5",
              status === "ready" && "sr-only"
            )}
          >
            {status === "uploading" && (
              <>
                <Spinner />
                {t("uploading")}
              </>
            )}
            {status === "uploaded" && (
              <>
                <CheckCircle2 aria-hidden className="text-success" />
                {t("uploaded")}
              </>
            )}
          </span>
          {status === "ready" && (
            <Button type="submit" variant="outline" size="sm">
              {t("upload")}
            </Button>
          )}
        </FileDropzone>
        {kind === "shipping_label" && (
          <FieldSet>
            <FieldLegend variant="label">{t("labelPages")}</FieldLegend>
            <FieldDescription>{t("labelPagesDescription")}</FieldDescription>
            <div className="grid gap-3 sm:grid-cols-3">
              {cartons.map((c) => (
                <Field key={c.cartonId}>
                  <FieldLabel htmlFor={`${id}-page-${c.cartonId}`}>{t("carton", { carton: c.cartonId })}</FieldLabel>
                  <Input
                    id={`${id}-page-${c.cartonId}`}
                    name={`page:${c.cartonId}`}
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    placeholder={t("page")}
                  />
                </Field>
              ))}
            </div>
          </FieldSet>
        )}
      </FieldGroup>
    </form>
  )
}
