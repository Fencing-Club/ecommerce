"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { type Address, type OrderInput, type PackingDraft, packingSchema } from "@repo/aisle"
import { Copy, MapPinPlus, Plus, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { useEffect, useId, useState } from "react"
import {
  FormProvider,
  useController,
  useFieldArray,
  useForm,
  useFormContext,
  useFormState,
  useWatch
} from "react-hook-form"
import { objectKeys } from "ts-extras"
import { z } from "zod"
import { useCan } from "@/components/access"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldGroup, FieldSeparator } from "@/components/ui/field"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useErrorMessage, useFormErrorMap } from "@/hooks/use-error-text"
import { useActionMutation } from "@/lib/api"
import { cn } from "@/lib/utils"
import { FormError, SubmitButton } from "./actions"
import { AddressFields, emptyAddress } from "./address-fields"
import { EmptyState } from "./common"
import { FormInput, FormMoney, FormNumber, RequiredMark } from "./form-controls"
import { SelectField } from "./form-fields"
import { FormSelect } from "./form-select"
import { AddressSummary, type PartnerAddress, PartnerAddressDialog } from "./partner-address"
import { LinkExistingShipment } from "./shipment-actions"
import { Upload } from "./upload"

type Values = z.input<typeof packingSchema>

// An empty number field, which is null once someone empties it. It renders blank, fails validation with "Enter a
// number", and is dropped from drafts. The form has no other nulls.
const blank = Number.NaN
const withoutBlanks = (values: Values): Values =>
  JSON.parse(
    JSON.stringify(values, (_, value) =>
      value === null || (typeof value === "number" && Number.isNaN(value)) ? undefined : value
    )
  )

// A carton's measurements, each labeled under orders.packing.dimensions.
const cartonDimensions = ["length", "width", "height", "weight"] as const

const checkResult = z.object({
  canSubmit: z.boolean(),
  requiresApproval: z.boolean(),
  issues: z.array(z.object({ message: z.string(), field: z.string().optional(), cartonId: z.string().optional() }))
})

// In the invoice table each field sits under its column's name, so its own label is only read out.
const cellField = "[&>[data-slot=field-label]]:sr-only"
// The invoice table's first and last columns line up with the card's header.
const edgeCells = "[&_td:first-child]:ps-4 [&_td:last-child]:pe-4 [&_th:first-child]:ps-4 [&_th:last-child]:pe-4"
// On a wide card the carton rows line up under one row of column names, so each field's own label is only read out.
// On a narrow card every field keeps its label.
const cartonColumns = {
  // With several products, each carton says which it holds.
  products: "@4xl/cartons:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,1fr))_minmax(0,3fr)_minmax(0,1fr)_auto]",
  product: "@4xl/cartons:grid-cols-[minmax(0,1.3fr)_repeat(5,minmax(0,1fr))_minmax(0,3fr)]"
}
const cartonLabel = "@4xl/cartons:[&>[data-slot=field-label]]:sr-only"

const productName = (item: { name: string; variant: string }) =>
  [item.name, item.variant === "Default Title" ? "" : item.variant].filter(Boolean).join(" / ")

// Which saved address a pickup address is, while it's unchanged.
const savedAddress = (addresses: PartnerAddress[], origin: Partial<Address>) =>
  addresses.find(({ address }) => objectKeys(emptyAddress).every((key) => (address[key] ?? "") === (origin[key] ?? "")))

function CartonContents({ index, order }: { index: number; order: OrderInput }) {
  const t = useTranslations("orders.packing")
  const { control } = useFormContext<Values>()
  const contents = useFieldArray({ control, name: `cartons.${index}.items` })
  const values = useWatch({ control, name: `cartons.${index}.items` }) ?? []
  const first = order.items.find((item) => item.id === values[0]?.itemId)
  const next = order.items.find(
    (item) =>
      !values.some((content) => content.itemId === item.id) &&
      (order.destination !== "amazon" || item.amazonNetwork === first?.amazonNetwork)
  )
  const canMix = order.destination !== "amazon" || first?.amazonNetwork === "fba"
  return (
    <div className="col-span-2 flex min-w-0 flex-col gap-2 @4xl/cartons:col-span-2">
      {contents.fields.map((content, itemIndex) => (
        <div key={content.id} className="grid grid-cols-[minmax(0,1fr)_5rem_2rem] items-start gap-2">
          <FormSelect
            name={`cartons.${index}.items.${itemIndex}.itemId`}
            required
            label={t("product")}
            options={order.items.map((item) => ({ value: item.id, label: `${productName(item)} / ${item.buyerSku}` }))}
            className={cartonLabel}
          />
          <FormNumber
            name={`cartons.${index}.items.${itemIndex}.pieces`}
            required
            label={t("units")}
            min={1}
            step={1}
            className={cartonLabel}
          />
          {contents.fields.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="mt-7 @4xl/cartons:mt-0.5"
              aria-label={t("removeCartonProduct", { number: itemIndex + 1 })}
              onClick={() => contents.remove(itemIndex)}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      ))}
      {canMix && next && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => contents.append({ itemId: next.id, pieces: blank })}
        >
          <Plus data-icon="inline-start" />
          {t("addCartonProduct")}
        </Button>
      )}
    </div>
  )
}

// Enter in a field would submit the packing list, which can create the Amazon shipment, so only the Submit button
// submits. Buttons still press and text areas still start a new line, and a dialog opened from here keeps its own
// Enter: its fields belong to its own form.
function keepEnterFromSubmitting(event: React.KeyboardEvent<HTMLFormElement>) {
  if (
    event.key === "Enter" &&
    !event.nativeEvent.isComposing &&
    event.target instanceof HTMLInputElement &&
    event.target.form === event.currentTarget
  ) {
    event.preventDefault()
  }
}

export function PackingForm({
  orderId,
  shipmentId,
  revision,
  orderRevision,
  availablePieces,
  order,
  initial,
  invoice,
  addresses,
  enteringFor,
  addAddressTo,
  linkedAmazonShipmentId
}: {
  orderId: string
  shipmentId: string
  revision: number
  orderRevision: number
  availablePieces: Record<string, number>
  order: OrderInput
  initial: PackingDraft | null
  // The shipment's commercial invoice. There's one at most: each upload replaces the last.
  invoice?: { id: string; name: string; bytes: number }
  // The supplier's saved pickup addresses.
  addresses: PartnerAddress[]
  // The supplier's name when the buyer fills this in for it, which the copy then speaks to. Unset for the supplier.
  enteringFor?: string
  // The supplier that hasn't joined, when the buyer's owner fills this in for it and can save addresses to it.
  addAddressTo?: { id: string; name: string }
  // Present only for a buyer's AWD draft. Null means it has no existing Amazon shipment yet.
  linkedAmazonShipmentId?: string | null
}) {
  const t = useTranslations("orders.packing")
  const errorMessage = useErrorMessage()
  const formErrorMap = useFormErrorMap()
  const router = useRouter()
  const [run] = useActionMutation()
  const formId = useId()
  // Someone who doesn't see prices packs without them: the order comes without prices, and the server keeps its
  // prices, so only supplier SKUs can change.
  const prices = useCan("prices")
  const [savedRevision, setSavedRevision] = useState(revision)
  const [notice, setNotice] = useState("")
  const [serverError, setServerError] = useState("")
  const [working, setWorking] = useState<"save" | "check" | "submit" | "link" | null>(null)
  const [linkedId, setLinkedId] = useState(linkedAmazonShipmentId)
  const firstItem = order.items[0]!.id
  const multipleProducts = order.items.length > 1
  // A packing list without a pickup address yet starts from the supplier's only saved one.
  const noOrigin = objectKeys(emptyAddress).every((key) => !initial?.origin?.[key])
  const startAddress =
    noOrigin && addresses.length === 1 ? addresses[0] : savedAddress(addresses, initial?.origin ?? {})
  // The saved address the cartons leave from, or "" for one typed in.
  const [pickup, setPickup] = useState(startAddress?.id ?? "")

  const form = useForm<Values, unknown, z.output<typeof packingSchema>>({
    resolver: zodResolver(packingSchema, { error: formErrorMap }),
    defaultValues: {
      readyDate: initial?.readyDate ?? "",
      origin: { ...emptyAddress, ...(startAddress?.address ?? initial?.origin) },
      // The current invoice, not the draft's: a correction or a new upload outdates the one it chose.
      invoiceDocumentId: invoice?.id ?? "",
      cartons: (initial?.cartons ?? []).map((carton) => ({
        cartonId: carton.cartonId ?? "",
        length: carton.length || blank,
        width: carton.width || blank,
        height: carton.height || blank,
        weight: carton.weight || blank,
        items: carton.items?.length
          ? carton.items.map((item) => ({ itemId: item.itemId || firstItem, pieces: item.pieces || blank }))
          : [{ itemId: firstItem, pieces: blank }]
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
  const contents = cartonValues.flatMap((carton) => carton?.items ?? [])
  const pieces = contents.reduce((total, item) => total + (item.pieces || 0), 0)
  const packed = (itemId: string) =>
    contents.reduce((total, item) => total + (item.itemId === itemId ? item.pieces || 0 : 0), 0)
  const cartonsError = form.formState.errors.cartons?.message ?? form.formState.errors.cartons?.root?.message

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
    setWorking(mode)
    setServerError("")
    setNotice("")
    try {
      const nextRevision = await saveDraft(values)
      setNotice(t("draftSaved"))
      if (mode === "save") {
        return
      }
      const checked = checkResult.parse(await run({ action: "shipment.check", data: { id: shipmentId } }).unwrap())
      if (!checked.canSubmit) {
        setServerError(
          checked.issues
            .map((issue) =>
              issue.cartonId ? t("cartonIssue", { carton: issue.cartonId, message: issue.message }) : issue.message
            )
            .join("\n")
        )
        return
      }
      if (mode === "check") {
        // The buyer's own changes apply at once; a supplier's wait for the buyer.
        let ready = t("readyToSubmit")
        if (checked.requiresApproval) {
          ready = enteringFor ? t("readyToSubmitUpdates") : t("readyToSubmitApproval")
        }
        setNotice(ready)
        return
      }
      await run({ action: "shipment.submit", data: { id: shipmentId, revision: nextRevision } }).unwrap()
      router.refresh()
    } catch (error) {
      setServerError(errorMessage(error, t("saveFailed")))
    } finally {
      setWorking(null)
    }
  }

  async function linkShipment(amazonShipmentId: string | null) {
    setWorking("link")
    setNotice("")
    setServerError("")
    try {
      // Preserve any incomplete packing before changing the link; both writes use the latest revision.
      const nextRevision = await saveDraft(form.getValues())
      const result = z.object({ revision: z.number() }).parse(
        await run({
          action: "shipment.linkExisting",
          data: { id: shipmentId, revision: nextRevision, amazonShipmentId }
        }).unwrap()
      )
      setSavedRevision(result.revision)
      setLinkedId(amazonShipmentId)
      router.refresh()
    } finally {
      setWorking(null)
    }
  }

  const validated = (mode: "check" | "submit") =>
    form.handleSubmit(
      () => perform(mode, form.getValues()),
      (errors) => {
        // A saved address that doesn't pass, such as one without a phone number, opens its fields to fix here.
        if (errors.origin) {
          setPickup("")
        }
        setServerError(t("fixFields"))
      }
    )

  function addCarton() {
    cartons.append({
      cartonId: "",
      length: blank,
      width: blank,
      height: blank,
      weight: blank,
      items: [{ itemId: firstItem, pieces: blank }]
    })
  }

  return (
    <FormProvider {...form}>
      {/* Also the sticky action bar's container, so the bar stays in view down to the last card. */}
      <fieldset disabled={working !== null} className="flex min-w-0 flex-col gap-6">
        {linkedId !== undefined && (
          <LinkExistingShipment key={linkedId ?? "unlinked"} linkedId={linkedId} onLink={linkShipment} />
        )}
        {/* Outside the packing form element: the upload is a form of its own. */}
        <InvoiceCard orderId={orderId} shipmentId={shipmentId} invoice={invoice} enteringFor={enteringFor} />

        {/* The key handler is delegated from the fields and only keeps Enter from submitting; the form adds no action. */}
        {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
        <form
          id={formId}
          onSubmit={validated("submit")}
          onKeyDown={keepEnterFromSubmitting}
          noValidate
          className="flex flex-col gap-6"
        >
          <Card className="gap-0 overflow-hidden py-0">
            <CardHeader className="border-b p-4">
              <CardTitle>{t("invoiceDetails")}</CardTitle>
              <CardDescription>{enteringFor ? t("changesUpdate") : t("changesForApproval")}</CardDescription>
            </CardHeader>
            {/* An editing grid: on a narrow card it scrolls sideways rather than squeezing its fields. */}
            <Table framed={false} className={cn("min-w-160", edgeCells)}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("product")}</TableHead>
                  <TableHead className="text-end">{t("packed")}</TableHead>
                  <TableHead className="w-52">{t("supplierSku")}</TableHead>
                  {prices && (
                    <TableHead className="w-44">
                      {t("pricePerUnit")}
                      <RequiredMark />
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((item, index) => {
                  const available = availablePieces[item.id] ?? 0
                  const count = packed(item.id)
                  return (
                    // Top-aligned, so a field's error message grows its row downward; text lines up with the fields.
                    <TableRow key={item.id} className="hover:bg-transparent [&>td]:align-top">
                      <TableCell className="whitespace-normal">
                        <p className="font-medium">{productName(item)}</p>
                        <p className="text-xs text-muted-foreground">{item.buyerSku}</p>
                      </TableCell>
                      <TableCell
                        className={cn("pt-3.5 text-end tabular-nums", count > available && "text-destructive")}
                      >
                        {t("packedOf", { count, available })}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {item.components?.length ? (
                          <div className="flex flex-col gap-1 pt-1.5">
                            {item.components.map((component) => (
                              <p key={component.variantId}>
                                {component.quantity} × {component.supplierSku || component.buyerSku || "—"}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <FormInput
                            name={`changes.${index}.supplierSku`}
                            label={t("supplierSku")}
                            className={cellField}
                          />
                        )}
                      </TableCell>
                      {prices && (
                        <TableCell className="whitespace-normal">
                          <FormMoney
                            name={`changes.${index}.unitPrice`}
                            required
                            label={t("pricePerUnit")}
                            currency={order.currency}
                            className={cellField}
                          />
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Card>

          <PickupCard addresses={addresses} addAddressTo={addAddressTo} pickup={pickup} onPickupChange={setPickup} />

          <Card className="gap-0 overflow-hidden py-0">
            <CardHeader className="border-b p-4">
              <CardTitle>{t("cartons")}</CardTitle>
            </CardHeader>
            {cartons.fields.length ? (
              <div className="@container/cartons">
                <div
                  aria-hidden
                  className={cn(
                    "hidden gap-x-3 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground @4xl/cartons:grid",
                    multipleProducts ? cartonColumns.products : cartonColumns.product
                  )}
                >
                  <span>{t("cartonNumber")}</span>
                  {cartonDimensions.map((field) => (
                    <span key={field}>{t(`dimensions.${field}`)}</span>
                  ))}
                  {multipleProducts && <span>{t("product")}</span>}
                  <span>{t("units")}</span>
                  <span className="w-17" />
                </div>
                {cartons.fields.map((carton, index) => {
                  const name = cartonValues[index]?.cartonId || index + 1
                  return (
                    <div
                      key={carton.id}
                      className={cn(
                        "grid grid-flow-row-dense grid-cols-2 items-start gap-3 border-b px-4 py-3",
                        multipleProducts ? cartonColumns.products : cartonColumns.product
                      )}
                    >
                      <FormInput
                        name={`cartons.${index}.cartonId`}
                        required
                        label={t("cartonNumber")}
                        className={cartonLabel}
                      />
                      {cartonDimensions.map((field) => (
                        <FormNumber
                          key={field}
                          name={`cartons.${index}.${field}`}
                          label={t(`dimensions.${field}`)}
                          required
                          min={0}
                          step="any"
                          className={cartonLabel}
                        />
                      ))}
                      {multipleProducts ? (
                        <CartonContents index={index} order={order} />
                      ) : (
                        <FormNumber
                          name={`cartons.${index}.items.0.pieces`}
                          required
                          label={t("units")}
                          min={1}
                          step={1}
                          className={cartonLabel}
                        />
                      )}
                      <div className="col-span-2 flex justify-end gap-1 @4xl/cartons:col-span-1 @4xl/cartons:pt-0.5">
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={t("duplicateCarton", { name })}
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
                          aria-label={t("removeCarton", { name })}
                          onClick={() => cartons.remove(index)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                  )
                })}
                <div className="px-4 py-2">
                  <Button type="button" variant="ghost" size="sm" onClick={addCarton}>
                    <Plus data-icon="inline-start" />
                    {t("addCarton")}
                  </Button>
                </div>
              </div>
            ) : (
              <EmptyState title={t("noCartons")} description={t("noCartonsDescription")}>
                <Button type="button" variant="outline" onClick={addCarton}>
                  <Plus data-icon="inline-start" />
                  {t("addCarton")}
                </Button>
              </EmptyState>
            )}
            {cartonsError && (
              <div className="px-4 pb-4">
                <FormError message={cartonsError} />
              </div>
            )}
          </Card>
        </form>

        <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-xl bg-card p-3 text-sm shadow-lg ring-1 ring-foreground/10">
          {serverError && (
            <div className="max-h-48 overflow-y-auto">
              <FormError message={serverError} />
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex flex-col px-1">
              <p className="font-medium tabular-nums">
                {t("cartonsAndUnits", { cartons: cartons.fields.length, units: pieces })}
              </p>
              {notice && <output className="text-xs text-muted-foreground">{notice}</output>}
            </div>
            <div className="flex flex-wrap gap-2">
              <SubmitButton
                type="button"
                variant="ghost"
                pending={working === "save"}
                onClick={() => void perform("save", form.getValues())}
              >
                {t("saveDraft")}
              </SubmitButton>
              <SubmitButton
                type="button"
                variant="outline"
                pending={working === "check"}
                onClick={() => void validated("check")()}
              >
                {t("check")}
              </SubmitButton>
              <SubmitButton
                type="submit"
                form={formId}
                pending={working === "submit"}
                disabled={!cartons.fields.length}
              >
                {t("submit")}
              </SubmitButton>
            </div>
          </div>
        </div>
      </fieldset>
    </FormProvider>
  )
}

// The commercial invoice the cartons ship with: the one uploaded, with Replace, or a dropzone while there's none. The
// packing list takes whichever is current, such as one uploaded here once the page refreshes with it.
function InvoiceCard({
  orderId,
  shipmentId,
  invoice,
  enteringFor
}: {
  orderId: string
  shipmentId: string
  invoice?: { id: string; name: string; bytes: number }
  enteringFor?: string
}) {
  const t = useTranslations("orders.packing")
  const form = useFormContext<Values>()
  const {
    field: { ref, value },
    fieldState
  } = useController({ control: form.control, name: "invoiceDocumentId" })
  const invoiceId = invoice?.id ?? ""
  useEffect(() => {
    if (value !== invoiceId) {
      form.setValue("invoiceDocumentId", invoiceId, { shouldDirty: true })
      if (invoiceId) {
        form.clearErrors("invoiceDocumentId")
      }
    }
  }, [invoiceId, value, form])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("commercialInvoice")}</CardTitle>
        <CardDescription>
          {enteringFor ? t("theirInvoice", { supplier: enteringFor }) : t("yourInvoice")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Upload
          ref={ref}
          orderId={orderId}
          shipmentId={shipmentId}
          kind="invoice"
          label={null}
          current={invoice && { id: invoice.id, name: invoice.name, size: invoice.bytes }}
          error={fieldState.invalid ? t("uploadInvoice") : undefined}
        />
      </CardContent>
    </Card>
  )
}

// When the cartons are ready and where they're collected: one of the supplier's saved pickup addresses, shown in brief,
// or one typed in. Either way the packing list keeps the address itself, as its origin.
function PickupCard({
  addresses,
  addAddressTo,
  pickup,
  onPickupChange
}: {
  addresses: PartnerAddress[]
  addAddressTo?: { id: string; name: string }
  pickup: string
  onPickupChange: (id: string) => void
}) {
  const t = useTranslations("orders.packing")
  const form = useFormContext<Values>()
  const selectId = useId()
  const [adding, setAdding] = useState(false)
  // Addresses added here, until the refreshed page lists them.
  const [added, setAdded] = useState<PartnerAddress[]>([])
  // The address typed in, kept while a saved one is chosen.
  const [typed, setTyped] = useState<Values["origin"]>(emptyAddress)
  const origin = useWatch({ control: form.control, name: "origin" })
  const { errors } = useFormState({ control: form.control, name: "origin" })
  const saved = [...addresses, ...added.filter((address) => !addresses.some((row) => row.id === address.id))]
  const chosen = saved.find((address) => address.id === pickup)

  function choose(next: PartnerAddress | undefined) {
    if (!chosen) {
      setTyped(form.getValues("origin"))
    }
    form.clearErrors("origin")
    form.setValue("origin", { ...emptyAddress, ...(next ? next.address : typed) }, { shouldDirty: true })
    onPickupChange(next?.id ?? "")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("pickup")}</CardTitle>
        {addAddressTo && (
          <CardAction>
            <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
              <MapPinPlus data-icon="inline-start" />
              {t("addAddress")}
            </Button>
            <PartnerAddressDialog
              partner={{ kind: "supplier", ...addAddressTo }}
              // What's typed here becomes the new address's starting point.
              draft={chosen ? undefined : origin}
              open={adding}
              onOpenChange={setAdding}
              onSaved={({ id, name, address }) => {
                if (id) {
                  setAdded((list) => [...list, { id, name, address }])
                  choose({ id, name, address })
                }
              }}
            />
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            {saved.length > 0 && (
              <SelectField
                label={t("pickupAddress")}
                id={selectId}
                value={chosen?.id ?? ""}
                onChange={(event) => {
                  const next = saved.find((address) => address.id === event.target.value)
                  if (next || chosen) {
                    choose(next)
                  }
                }}
                options={[
                  ...saved.map((address) => ({ value: address.id, label: address.name })),
                  { value: "", label: t("otherAddress") }
                ]}
              />
            )}
            <FormInput name="readyDate" required label={t("readyForPickup")} type="date" />
          </div>
          {chosen && !errors.origin ? (
            <AddressSummary address={origin} className="rounded-lg bg-muted/50 p-3" />
          ) : (
            <>
              <FieldSeparator />
              <AddressFields path="origin" requirePhone />
            </>
          )}
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
