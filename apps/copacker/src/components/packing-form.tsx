"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { type Address, type OrderInput, type PackingDraft, packingSchema } from "@repo/aisle"
import { Copy, Plus, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { FormProvider, useFieldArray, useForm, useWatch } from "react-hook-form"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldGroup, FieldSeparator } from "@/components/ui/field"
import { errorMessage, useActionMutation } from "@/lib/api"
import { formErrorMap } from "@/lib/form-errors"
import { FormError, SubmitButton } from "./actions"
import { AddressFields, emptyAddress } from "./address-fields"
import { EmptyState } from "./common"
import { FormInput, FormNumber, FormSelect } from "./form-controls"
import { SelectField } from "./form-fields"
import { Upload } from "./upload"
import * as styles from "./packing-form.css"
import { sx } from "@/styles/sprinkles.css"

type Values = z.input<typeof packingSchema>

// An empty number field. It renders blank, fails validation with "Enter a number", and is dropped from drafts.
const blank = Number.NaN
const withoutBlanks = (values: Values): Values =>
  JSON.parse(
    JSON.stringify(values, (_, value) => (typeof value === "number" && Number.isNaN(value) ? undefined : value))
  )

const cartonDimensions = [
  { key: "length", label: "Length (cm)" },
  { key: "width", label: "Width (cm)" },
  { key: "height", label: "Height (cm)" },
  { key: "weight", label: "Gross weight (kg)" }
] as const

const checkResult = z.object({
  canSubmit: z.boolean(),
  requiresApproval: z.boolean(),
  issues: z.array(z.object({ message: z.string(), field: z.string().optional(), cartonId: z.string().optional() }))
})

export function PackingForm({
  orderId,
  shipmentId,
  revision,
  orderRevision,
  availablePieces,
  order,
  initial,
  invoices,
  addresses
}: {
  orderId: string
  shipmentId: string
  revision: number
  orderRevision: number
  availablePieces: Record<string, number>
  order: OrderInput
  initial: PackingDraft | null
  invoices: Array<{ id: string; name: string }>
  addresses: Array<{ id: string; name: string; address: Address }>
}) {
  const router = useRouter()
  const [run] = useActionMutation()
  const [savedRevision, setSavedRevision] = useState(revision)
  const [notice, setNotice] = useState("")
  const [serverError, setServerError] = useState("")
  const [working, setWorking] = useState(false)
  const [addressId, setAddressId] = useState("")
  const firstItem = order.items[0]!.id

  const form = useForm<Values, unknown, z.output<typeof packingSchema>>({
    resolver: zodResolver(packingSchema, { error: formErrorMap }),
    defaultValues: {
      readyDate: initial?.readyDate ?? "",
      origin: { ...emptyAddress, ...initial?.origin },
      invoiceDocumentId: initial?.invoiceDocumentId ?? "",
      cartons: (initial?.cartons ?? []).map((carton) => ({
        cartonId: carton.cartonId ?? "",
        length: carton.length || blank,
        width: carton.width || blank,
        height: carton.height || blank,
        weight: carton.weight || blank,
        items: [{ itemId: carton.items?.[0]?.itemId || firstItem, pieces: carton.items?.[0]?.pieces || blank }]
      })),
      changes: order.items.map((item) => {
        const change = initial?.changes?.find((c) => c.itemId === item.id)
        return {
          itemId: item.id,
          supplierSku: change?.supplierSku ?? item.supplierSku,
          unitPrice: change?.unitPrice ?? item.unitPrice
        }
      })
    }
  })
  const cartons = useFieldArray({ control: form.control, name: "cartons" })
  const cartonValues = useWatch({ control: form.control, name: "cartons" }) ?? []
  const pieces = cartonValues.reduce((n, c) => n + (c?.items?.[0]?.pieces || 0), 0)

  // Drafts save whatever is entered; check and submit only run after the form passes packingSchema.
  async function saveDraft(draft: Values) {
    const saved = z.object({ revision: z.number() }).parse(
      await run({
        action: "shipment.save",
        data: { id: shipmentId, revision: savedRevision, orderRevision, draft: withoutBlanks(draft) }
      }).unwrap()
    )
    setSavedRevision(saved.revision)
    return saved.revision
  }

  async function perform(mode: "save" | "check" | "submit", values: Values) {
    setWorking(true)
    setServerError("")
    setNotice("")
    try {
      const nextRevision = await saveDraft(values)
      setNotice("Packing draft saved. You can leave and return later.")
      if (mode === "save") {
        return
      }
      const checked = checkResult.parse(await run({ action: "shipment.check", data: { id: shipmentId } }).unwrap())
      if (!checked.canSubmit) {
        setServerError(
          checked.issues.map((issue) => `${issue.cartonId ?? issue.field ?? "Packing"}: ${issue.message}`).join("\n")
        )
        return
      }
      if (mode === "check") {
        setNotice(
          checked.requiresApproval
            ? "Packing checked. Invoice changes will go to the buyer for approval."
            : "Packing checked. Ready to submit."
        )
        return
      }
      await run({ action: "shipment.submit", data: { id: shipmentId, revision: nextRevision } }).unwrap()
      router.refresh()
    } catch (error) {
      setServerError(errorMessage(error, "Could not save packing"))
    } finally {
      setWorking(false)
    }
  }

  const validated = (mode: "check" | "submit") =>
    form.handleSubmit(
      () => perform(mode, form.getValues()),
      () => setServerError("Fix the highlighted fields, then try again.")
    )

  function applySavedAddress(id: string) {
    setAddressId(id)
    const saved = addresses.find((a) => a.id === id)
    if (saved) {
      form.setValue("origin", { ...emptyAddress, ...saved.address }, { shouldDirty: true, shouldValidate: true })
    }
  }

  return (
    <div className={sx({ display: "flex", flexDirection: "column", gap: 6 })}>
      <Upload orderId={orderId} shipmentId={shipmentId} kind="invoice" />
      <FormProvider {...form}>
        <form onSubmit={validated("submit")} noValidate>
          <fieldset disabled={working} className={sx({ display: "flex", flexDirection: "column", gap: 6 })}>
            <Card>
              <CardHeader>
                <CardTitle>Invoice details</CardTitle>
                <CardDescription>
                  Enter the prices and supplier SKUs from your official invoice. Changes go to the buyer for approval.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <FormSelect
                    name="invoiceDocumentId"
                    required
                    label="Uploaded commercial invoice"
                    placeholder="Choose uploaded invoice"
                    options={invoices.map((d) => ({ value: d.id, label: d.name }))}
                  />
                  {order.items.map((item, index) => (
                    <div key={item.id} className={sx({ display: "flex", flexDirection: "column", gap: 4 })}>
                      <FieldSeparator />
                      <div
                        className={sx({
                          display: "grid",
                          gap: 4,
                          gridTemplateColumns: { sm: "itemPriceSku" },
                          alignItems: { sm: "flex-start" }
                        })}
                      >
                        <div className={sx({ display: "flex", flexDirection: "column", gap: 1 })}>
                          <p className={sx({ text: "sm", fontWeight: "medium" })}>
                            {item.name} / {item.variant}
                          </p>
                          <p className={sx({ text: "xs", color: "muted" })}>Buyer SKU: {item.buyerSku}</p>
                          <p className={sx({ text: "xs", color: "muted" })}>
                            {availablePieces[item.id] ?? 0} pieces available on this PO
                          </p>
                        </div>
                        {item.components?.length ? (
                          <div className={sx({ text: "sm" })}>
                            <p className={sx({ fontWeight: "medium" })}>Supplier components per sellable unit</p>
                            {item.components.map((component) => (
                              <p key={component.variantId} className={sx({ color: "muted" })}>
                                {component.quantity} × {component.buyerSku || "Shopify component"} · Supplier SKU{" "}
                                {component.supplierSku || "missing"}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <FormInput name={`changes.${index}.supplierSku`} label="Supplier SKU" />
                        )}
                        <FormNumber
                          name={`changes.${index}.unitPrice`}
                          required
                          label={`Price per piece (${order.currency})`}
                          min={0}
                          step={0.01}
                          scale={100}
                        />
                      </div>
                    </div>
                  ))}
                </FieldGroup>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Pickup details</CardTitle>
                <CardDescription>
                  Tell the buyer when the cartons will be ready. The buyer books transportation, and Amazon coordinates
                  pickup with this contact.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <div className={sx({ display: "grid", gap: 4, gridTemplateColumns: { sm: "2" } })}>
                    <FormInput name="readyDate" required label="Ready for pickup" type="date" />
                    {addresses.length > 0 && (
                      <SelectField
                        label="Use a saved address"
                        id="savedAddress"
                        value={addressId}
                        onChange={(e) => applySavedAddress(e.target.value)}
                        placeholder="Enter a new address"
                        options={addresses.map((a) => ({ value: a.id, label: a.name }))}
                      />
                    )}
                  </div>
                  <AddressFields path="origin" requirePhone />
                </FieldGroup>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cartons</CardTitle>
                <CardDescription>
                  Use the numbers printed on your cartons. Dimensions in cm, gross weight in kg.
                </CardDescription>
                <CardAction>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      cartons.append({
                        cartonId: "",
                        length: blank,
                        width: blank,
                        height: blank,
                        weight: blank,
                        items: [{ itemId: firstItem, pieces: blank }]
                      })
                    }
                  >
                    <Plus data-icon="inline-start" />
                    Add carton
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className={sx({ display: "flex", flexDirection: "column", gap: 4 })}>
                {cartons.fields.length === 0 && (
                  <EmptyState
                    title="No cartons yet"
                    description="Add your first carton, then duplicate identical cartons to save time."
                  />
                )}
                {cartons.fields.map((carton, index) => (
                  <Card key={carton.id} size="sm" className={styles.cartonCard}>
                    <CardHeader>
                      <CardTitle>Carton {cartonValues[index]?.cartonId || index + 1}</CardTitle>
                      <CardAction className={sx({ display: "flex", gap: 1 })}>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Duplicate carton ${index + 1}`}
                          onClick={() =>
                            cartons.append({ ...structuredClone(form.getValues(`cartons.${index}`)), cartonId: "" })
                          }
                        >
                          <Copy />
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Remove carton ${index + 1}`}
                          onClick={() => cartons.remove(index)}
                        >
                          <Trash2 />
                        </Button>
                      </CardAction>
                    </CardHeader>
                    <CardContent>
                      <FieldGroup>
                        <div className={sx({ display: "grid", gap: 4, gridTemplateColumns: { sm: "2", lg: "5" } })}>
                          <FormInput name={`cartons.${index}.cartonId`} required label="Supplier carton number" />
                          {cartonDimensions.map((field) => (
                            <FormNumber
                              key={field.key}
                              name={`cartons.${index}.${field.key}`}
                              label={field.label}
                              required
                              min={0}
                              step="any"
                            />
                          ))}
                        </div>
                        <div
                          className={sx({ display: "grid", gap: 4, gridTemplateColumns: { sm: "fieldWithPieces" } })}
                        >
                          <FormSelect
                            name={`cartons.${index}.items.0.itemId`}
                            required
                            label="Product (one SKU per AWD carton)"
                            options={order.items.map((item) => ({
                              value: item.id,
                              label: `${item.name} / ${item.variant} / ${item.buyerSku}`
                            }))}
                          />
                          <FormNumber
                            name={`cartons.${index}.items.0.pieces`}
                            required
                            label="Pieces in carton"
                            min={1}
                            step={1}
                          />
                        </div>
                      </FieldGroup>
                    </CardContent>
                  </Card>
                ))}
                <FormError
                  message={form.formState.errors.cartons?.message ?? form.formState.errors.cartons?.root?.message}
                />
              </CardContent>
            </Card>

            <FormError message={serverError} />
            <div
              className={sx({
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 4
              })}
            >
              <p className={sx({ text: "sm", color: "muted" })}>
                {cartons.fields.length} cartons, {pieces} pieces
              </p>
              <div className={sx({ display: "flex", flexWrap: "wrap", gap: 2 })}>
                <Button type="button" variant="outline" onClick={() => void perform("save", form.getValues())}>
                  Save draft
                </Button>
                <Button type="button" variant="outline" onClick={() => void validated("check")()}>
                  Check packing
                </Button>
                <SubmitButton type="submit" pending={working} disabled={!cartons.fields.length}>
                  Submit packing list
                </SubmitButton>
              </div>
            </div>
            {notice && <output className={sx({ text: "sm", color: "muted" })}>{notice}</output>}
          </fieldset>
        </form>
      </FormProvider>
    </div>
  )
}
