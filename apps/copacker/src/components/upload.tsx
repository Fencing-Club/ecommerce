"use client"

import { CheckCircle2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useId, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { errorMessage, useUploadDocumentMutation } from "@/lib/api"
import { cn } from "@/lib/utils"
import { FileDropzone } from "./file-dropzone"
import { SelectField } from "./form-fields"

const titles = {
  invoice: "Official commercial invoice",
  product_label: "Product labels",
  shipping_label: "Carrier shipping labels"
}

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
  cartons = []
}: {
  orderId: string
  shipmentId?: string
  kind: "invoice" | "product_label" | "shipping_label"
  // The field's label: the document's name when left out, or null for none, such as in a card titled for the document.
  label?: string | null
  items?: Array<{ id: string; name: string; variant: string }>
  cartons?: Array<{ cartonId: string }>
}) {
  const router = useRouter()
  const [upload] = useUploadDocumentMutation()
  const form = useRef<HTMLFormElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<"ready" | "uploading" | "uploaded">("ready")
  const [itemId, setItemId] = useState("")
  const [error, setError] = useState("")
  const id = useId()
  const needsDetails = kind === "shipping_label" || items.length > 0

  async function send(chosen: File, target: HTMLFormElement) {
    setError("")
    if (items.length > 0 && !itemId) {
      setError("Choose a product variation")
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
        setError("Enter the label page for at least one carton")
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
      setError(errorMessage(e, "Upload failed. Try again."))
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
          setError("Choose a PDF")
        } else if (status === "ready") {
          void send(file, event.currentTarget)
        }
      }}
    >
      <FieldGroup>
        {items.length > 0 && (
          <SelectField
            label="Product variation"
            id={`${id}-item`}
            required
            placeholder="Choose a variation"
            options={items.map((i) => ({ value: i.id, label: `${i.name} / ${i.variant}` }))}
            value={itemId}
            onChange={(event) => setItemId(event.target.value)}
          />
        )}
        <FileDropzone
          id={`${id}-drop`}
          label={label === undefined ? titles[kind] : label}
          hint={kind === "product_label" ? "One label sheet per variation, up to 32 MB" : undefined}
          accept="application/pdf,.pdf"
          maxBytes={maxBytes}
          file={file}
          onFileChange={choose}
          disabled={status === "uploading"}
          error={error}
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
                Uploading
              </>
            )}
            {status === "uploaded" && (
              <>
                <CheckCircle2 aria-hidden className="text-success" />
                Uploaded
              </>
            )}
          </span>
          {status === "ready" && (
            <Button type="submit" variant="outline" size="sm">
              Upload
            </Button>
          )}
        </FileDropzone>
        {kind === "shipping_label" && (
          <FieldSet>
            <FieldLegend variant="label">Label page for each carton</FieldLegend>
            <FieldDescription>Leave a carton blank if its label is in another file</FieldDescription>
            <div className="grid gap-3 sm:grid-cols-3">
              {cartons.map((c) => (
                <Field key={c.cartonId}>
                  <FieldLabel htmlFor={`${id}-page-${c.cartonId}`}>Carton {c.cartonId}</FieldLabel>
                  <Input
                    id={`${id}-page-${c.cartonId}`}
                    name={`page:${c.cartonId}`}
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    placeholder="Page"
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
