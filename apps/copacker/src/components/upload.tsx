"use client"

import { CheckCircle2, UploadCloud } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { errorMessage, useUploadDocumentMutation } from "@/lib/api"
import { FormError, SubmitButton } from "./actions"
import { SelectField } from "./form-fields"
import * as styles from "./upload.css"
import { sx } from "@/styles/sprinkles.css"

const titles = {
  invoice: "Official commercial invoice",
  product_label: "Product labels",
  shipping_label: "Carrier shipping labels"
}

export function Upload({
  orderId,
  shipmentId,
  kind,
  items = [],
  cartons = []
}: {
  orderId: string
  shipmentId?: string
  kind: "invoice" | "product_label" | "shipping_label"
  items?: Array<{ id: string; name: string; variant: string }>
  cartons?: Array<{ cartonId: string }>
}) {
  const router = useRouter()
  const [upload, { isLoading: pending }] = useUploadDocumentMutation()
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setSuccess(false)
    const form = event.currentTarget
    const data = new FormData(form)
    data.set("orderId", orderId)
    data.set("kind", kind)
    if (shipmentId) {
      data.set("shipmentId", shipmentId)
    }
    if (kind === "shipping_label") {
      const assignments = cartons.flatMap((c) => {
        const page = Number(data.get(`page:${c.cartonId}`))
        return page > 0 ? [{ cartonId: c.cartonId, page }] : []
      })
      data.set("assignments", JSON.stringify(assignments))
    }
    try {
      await upload(data).unwrap()
      form.reset()
      setSuccess(true)
      router.refresh()
    } catch (e) {
      setError(errorMessage(e, "Upload failed. Try again."))
    }
  }

  const fileId = `file-${kind}`

  return (
    <Card size="sm" className={styles.card}>
      <CardHeader>
        <CardTitle className={sx({ display: "flex", alignItems: "center", gap: 2 })}>
          <UploadCloud className={sx({ size: 4, color: "muted" })} />
          {titles[kind]}
        </CardTitle>
        <CardDescription>
          PDF up to 32 MB.{" "}
          {kind === "product_label"
            ? "Upload one full label sheet per variation. The supplier chooses how many copies to print."
            : "Stored privately with this order."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit}>
          <FieldGroup>
            {items.length > 0 && (
              <SelectField
                label="Product variation"
                id={`item-${kind}`}
                name="itemId"
                required
                options={items.map((i) => ({ value: i.id, label: `${i.name} / ${i.variant}` }))}
              />
            )}
            <Field>
              <FieldLabel htmlFor={fileId}>PDF file</FieldLabel>
              <Input id={fileId} type="file" name="file" accept="application/pdf" required />
            </Field>
            {kind === "shipping_label" && (
              <FieldSet>
                <FieldLegend variant="label">Label page for each carton</FieldLegend>
                <FieldDescription>
                  Enter the PDF page number for each carton. Leave a carton blank if its label is in a different file.
                </FieldDescription>
                <div className={sx({ display: "grid", gap: 3, gridTemplateColumns: { sm: "3" } })}>
                  {cartons.map((c) => (
                    <Field key={c.cartonId}>
                      <FieldLabel htmlFor={`page:${c.cartonId}`}>Carton {c.cartonId}</FieldLabel>
                      <Input
                        id={`page:${c.cartonId}`}
                        name={`page:${c.cartonId}`}
                        type="number"
                        min="1"
                        placeholder="Page"
                      />
                    </Field>
                  ))}
                </div>
              </FieldSet>
            )}
            <FormError message={error} />
            {success && (
              <Alert>
                <CheckCircle2 />
                <AlertDescription>Document uploaded.</AlertDescription>
              </Alert>
            )}
            <div>
              <SubmitButton type="submit" variant="outline" pending={pending}>
                Upload PDF
              </SubmitButton>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
