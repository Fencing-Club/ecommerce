"use client"

import { type Address, type OrderInput, type Packing, type PackingDraft } from "@repo/aisle"
import { Copy, Plus, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldGroup, FieldSeparator } from "@/components/ui/field"
import { FormError, SubmitButton, perform } from "./actions"
import { EmptyState } from "./common"
import { SelectField, TextField } from "./form-fields"
import { Upload } from "./upload"

const addressFields = [
  { key: "name", label: "Contact name" },
  { key: "phoneNumber", label: "Phone number", type: "tel" },
  { key: "email", label: "Email", type: "email", optional: true },
  { key: "addressLine1", label: "Street address" },
  { key: "addressLine2", label: "Address line 2", optional: true },
  { key: "city", label: "City" },
  { key: "stateOrRegion", label: "State or province" },
  { key: "postalCode", label: "Postal code" },
  { key: "countryCode", label: "Country code", placeholder: "CN" }
]

export function AddressFields({
  address,
  prefix = "",
  requirePhone = false
}: {
  address?: Partial<Address>
  prefix?: string
  requirePhone?: boolean
}) {
  return (
    <FieldGroup className="grid gap-4 sm:grid-cols-2">
      {addressFields.map((field) => {
        const optional = field.optional || (field.key === "phoneNumber" && !requirePhone)
        return (
          <TextField
            key={field.key}
            label={optional ? `${field.label} (optional)` : field.label}
            name={`${prefix}${field.key}`}
            type={field.type ?? "text"}
            placeholder={field.placeholder}
            defaultValue={address ? Reflect.get(address, field.key) : undefined}
            required={!optional}
          />
        )
      })}
    </FieldGroup>
  )
}

export function readAddress(form: FormData, prefix = "") {
  return Object.fromEntries(addressFields.map(({ key }) => [key, form.get(`${prefix}${key}`)]))
}

const cartonFields = [
  { key: "cartonId", label: "Supplier carton number" },
  { key: "length", label: "Length (cm)" },
  { key: "width", label: "Width (cm)" },
  { key: "height", label: "Height (cm)" },
  { key: "weight", label: "Gross weight (kg)" }
] as const

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
  const formRef = useRef<HTMLFormElement>(null)
  const [savedRevision, setSavedRevision] = useState(revision)
  const [notice, setNotice] = useState("")
  const [cartons, setCartons] = useState<Packing["cartons"]>(
    (initial?.cartons ?? []).map((carton) => ({
      cartonId: carton.cartonId ?? "",
      length: carton.length ?? 0,
      width: carton.width ?? 0,
      height: carton.height ?? 0,
      weight: carton.weight ?? 0,
      items: [{ itemId: carton.items?.[0]?.itemId ?? order.items[0]!.id, pieces: carton.items?.[0]?.pieces ?? 0 }]
    }))
  )
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const [addressId, setAddressId] = useState("")

  function add() {
    setCartons([
      ...cartons,
      { cartonId: "", length: 0, width: 0, height: 0, weight: 0, items: [{ itemId: order.items[0]!.id, pieces: 0 }] }
    ])
  }

  function update(index: number, field: string, value: string) {
    setCartons(
      cartons.map((carton, i) =>
        i === index ? { ...carton, [field]: field === "cartonId" ? value : Number(value) } : carton
      )
    )
  }

  function updateContents(index: number, contents: Partial<Packing["cartons"][number]["items"][number]>) {
    setCartons(cartons.map((c, i) => (i === index ? { ...c, items: [{ ...c.items[0]!, ...contents }] } : c)))
  }

  async function commit(mode: "save" | "check" | "submit") {
    if (!formRef.current || pending) {
      return
    }
    const f = new FormData(formRef.current)
    setPending(true)
    setError("")
    setNotice("")
    try {
      const draft = {
        readyDate: f.get("readyDate"),
        origin: readAddress(f, "origin."),
        invoiceDocumentId: f.get("invoiceDocumentId") ?? "",
        cartons,
        changes: order.items.map((i) => ({
          itemId: i.id,
          supplierSku: f.get(`sku:${i.id}`) ?? "",
          unitPrice: f.get(`cost:${i.id}`) === "" ? undefined : Math.round(Number(f.get(`cost:${i.id}`)) * 100)
        }))
      }
      const saved = z
        .object({ revision: z.number() })
        .parse(await perform("shipment.save", { id: shipmentId, revision: savedRevision, orderRevision, draft }))
      setSavedRevision(saved.revision)
      setNotice("Packing draft saved. You can leave and return later.")
      if (mode === "save") {
        return
      }
      const checked = z
        .object({
          canSubmit: z.boolean(),
          requiresApproval: z.boolean(),
          issues: z.array(
            z.object({ message: z.string(), field: z.string().optional(), cartonId: z.string().optional() })
          )
        })
        .parse(await perform("shipment.check", { id: shipmentId }))
      if (!checked.canSubmit) {
        setError(
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
      await perform("shipment.submit", { id: shipmentId, revision: saved.revision })
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save packing")
    } finally {
      setPending(false)
    }
  }

  const pieces = cartons.reduce((n, c) => n + c.items.reduce((sum, i) => sum + i.pieces, 0), 0)

  return (
    <div className="flex flex-col gap-6">
      <Upload orderId={orderId} shipmentId={shipmentId} kind="invoice" />
      <form
        ref={formRef}
        onSubmit={(event) => {
          event.preventDefault()
          void commit("submit")
        }}
      >
        <fieldset disabled={pending} className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Invoice details</CardTitle>
              <CardDescription>
                Enter the prices and supplier SKUs from your official invoice. Changes go to the buyer for approval.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <SelectField
                  label="Uploaded commercial invoice"
                  id="invoiceDocumentId"
                  name="invoiceDocumentId"
                  required
                  defaultValue={initial?.invoiceDocumentId}
                  placeholder="Choose uploaded invoice"
                  options={invoices.map((d) => ({ value: d.id, label: d.name }))}
                />
                {order.items.map((item) => {
                  const change = initial?.changes?.find((c) => c.itemId === item.id)
                  return (
                    <div key={item.id} className="flex flex-col gap-4">
                      <FieldSeparator />
                      <div className="grid gap-4 sm:grid-cols-[1fr_180px_160px] sm:items-start">
                        <div className="flex flex-col gap-1">
                          <p className="text-sm font-medium">
                            {item.name} / {item.variant}
                          </p>
                          <p className="text-xs text-muted-foreground">Buyer SKU: {item.buyerSku}</p>
                          <p className="text-xs text-muted-foreground">
                            {availablePieces[item.id] ?? 0} pieces available on this PO
                          </p>
                        </div>
                        <TextField
                          name={`sku:${item.id}`}
                          label="Supplier SKU"
                          defaultValue={change?.supplierSku ?? item.supplierSku}
                        />
                        <TextField
                          name={`cost:${item.id}`}
                          label={`Price per piece (${order.currency})`}
                          type="number"
                          min="0"
                          step="0.01"
                          required
                          defaultValue={(change?.unitPrice ?? item.unitPrice) / 100}
                        />
                      </div>
                    </div>
                  )
                })}
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
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    label="Ready for pickup"
                    name="readyDate"
                    type="date"
                    defaultValue={initial?.readyDate}
                    required
                  />
                  {addresses.length > 0 && (
                    <SelectField
                      label="Use a saved address"
                      id="savedAddress"
                      value={addressId}
                      onChange={(e) => setAddressId(e.target.value)}
                      placeholder="Enter a new address"
                      options={addresses.map((a) => ({ value: a.id, label: a.name }))}
                    />
                  )}
                </div>
                <AddressFields
                  requirePhone
                  key={addressId}
                  prefix="origin."
                  address={addresses.find((a) => a.id === addressId)?.address ?? initial?.origin}
                />
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
                <Button type="button" variant="outline" onClick={add}>
                  <Plus data-icon="inline-start" />
                  Add carton
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {cartons.length === 0 && (
                <EmptyState
                  title="No cartons yet"
                  description="Add your first carton, then duplicate identical cartons to save time."
                />
              )}
              {cartons.map((carton, index) => (
                <Card key={index} size="sm" className="bg-muted/30">
                  <CardHeader>
                    <CardTitle>Carton {carton.cartonId || index + 1}</CardTitle>
                    <CardAction className="flex gap-1">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Duplicate carton ${index + 1}`}
                        onClick={() => setCartons([...cartons, { ...structuredClone(carton), cartonId: "" }])}
                      >
                        <Copy />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Remove carton ${index + 1}`}
                        onClick={() => setCartons(cartons.filter((_, i) => i !== index))}
                      >
                        <Trash2 />
                      </Button>
                    </CardAction>
                  </CardHeader>
                  <CardContent>
                    <FieldGroup>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                        {cartonFields.map((field) => (
                          <TextField
                            key={field.key}
                            id={`${index}-${field.key}`}
                            label={field.label}
                            type={field.key === "cartonId" ? "text" : "number"}
                            min="0.001"
                            step="any"
                            required
                            value={carton[field.key] || ""}
                            onChange={(e) => update(index, field.key, e.target.value)}
                          />
                        ))}
                      </div>
                      <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
                        <SelectField
                          label="Product (one SKU per AWD carton)"
                          id={`${index}-product`}
                          value={carton.items[0]!.itemId}
                          onChange={(e) => updateContents(index, { itemId: e.target.value })}
                          options={order.items.map((item) => ({
                            value: item.id,
                            label: `${item.name} / ${item.variant} / ${item.buyerSku}`
                          }))}
                        />
                        <TextField
                          id={`${index}-pieces`}
                          label="Pieces in carton"
                          type="number"
                          min="1"
                          step="1"
                          required
                          value={carton.items[0]!.pieces || ""}
                          onChange={(e) => updateContents(index, { pieces: Number(e.target.value) })}
                        />
                      </div>
                    </FieldGroup>
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>

          <FormError message={error} />
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              {cartons.length} cartons, {pieces} pieces
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={pending} onClick={() => void commit("save")}>
                Save draft
              </Button>
              <Button type="button" variant="outline" disabled={pending} onClick={() => void commit("check")}>
                Check packing
              </Button>
              <SubmitButton type="submit" pending={pending} disabled={!cartons.length}>
                Submit packing list
              </SubmitButton>
            </div>
          </div>
          {notice && <output className="text-sm text-muted-foreground">{notice}</output>}
        </fieldset>
      </form>
    </div>
  )
}
