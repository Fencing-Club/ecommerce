"use client"

import {
  amazonNetworkNames,
  adjustmentTypes,
  amazonNetworks,
  commonPaymentTerms,
  money,
  type OrderInput,
  orderInputSchema
} from "@repo/aisle"
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Download,
  Ellipsis,
  MapPin,
  Package,
  Plus,
  Warehouse,
  X
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useId, useRef, useState } from "react"
import { FormProvider, useController, useFieldArray, useFormContext, useWatch } from "react-hook-form"
import { PageHeader } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { useActionForm } from "@/hooks/useActionForm"
import type { CatalogProduct } from "@/lib/api"
import { bundleQuote, type BundleQuoteStatus } from "@/lib/bundle-quote"
import { quantityProblem, type QuantityRules } from "@/lib/catalog-pricing"
import { orderLine } from "@/lib/order-lines"
import { prepOptions } from "@/lib/prep"
import { cn } from "@/lib/utils"
import { FormError, SubmitButton } from "./actions"
import { AddProductsDialog, type StockAt } from "./add-products-dialog"
import { DateInput, FormCheckbox, FormInput, FormLabel, FormSelect, FormTextarea } from "./form-controls"

const destinations = [
  { value: "amazon", label: "Amazon" },
  { value: "warehouse", label: "Your location" },
  { value: "forwarder", label: "Freight forwarder" }
]
// Which of Amazon's networks a line goes to, when the PO ships to Amazon.
const networkOptions = amazonNetworks.map((value) => ({ value, label: amazonNetworkNames[value] }))
const currencies = [
  { value: "USD", label: "US Dollar (USD $)" },
  { value: "CNY", label: "Chinese Yuan (CNY ¥)" },
  { value: "EUR", label: "Euro (EUR €)" },
  { value: "GBP", label: "British Pound (GBP £)" },
  { value: "CAD", label: "Canadian Dollar (CAD $)" },
  { value: "AUD", label: "Australian Dollar (AUD $)" }
]

// Why a line's price isn't the supplier's quote, in a few words. A supplier without a catalog has nothing to say.
function matchNote(status: string) {
  switch (status) {
    case "matched":
    case "supplier_catalog_unavailable":
      return null
    case "not_in_supplier_catalog":
      return "Not in the supplier’s catalog"
    case "supplier_sku_missing":
      return "No supplier SKU"
    case "currency_review":
      return "Quote is in another currency"
    case "price_missing":
      return "No supplier price"
    default:
      return "Check the price"
  }
}

type Match = {
  sku: string
  status: BundleQuoteStatus
  unitPriceMinor: number | null
  product: { title?: string } | null
  // Pieces the supplier can still sell, or null when there's no limit.
  available: number | null
  // The supplier's volume pricing and quantity rules for this buyer, in pieces.
  tiers?: Array<{ minimumPieces: number; unitPriceMinor: number }>
  rules?: QuantityRules | null
}

// The supplier's price for this many pieces: its volume price once the quantity reaches a break.
function quotedPrice(match: Match, pieces: number) {
  return match.tiers?.findLast((tier) => pieces >= tier.minimumPieces)?.unitPriceMinor ?? match.unitPriceMinor
}

// A PO's editor, laid out like Shopify's: the route from the supplier to where the goods go, a table of products
// edited in place, with more per line in its menu, and the PO's details and totals beside it.
export function OrderBuilder({
  suppliers,
  deliveries = [],
  forwarderAddresses = [],
  initialItems = [],
  initialDestination = "amazon",
  initialDeliveryId,
  initialSupplierId,
  needsBarcodeVariantIds = [],
  draft,
  title,
  parents
}: {
  suppliers: Array<{ id: string; name: string }>
  // The buyer's delivery addresses, for POs sent to its own locations, with the Shopify location stock arrives at.
  deliveries?: Array<{ id: string; name: string; shopifyLocationId?: string | null }>
  // Where POs to freight forwarders can ship: each forwarder's addresses, and whether Amazon could pick up there.
  forwarderAddresses?: Array<{ addressId: string; forwarderId: string; label: string; hasPhone?: boolean }>
  // Lines added before the builder opens, such as a reorder from Restock.
  initialItems?: ReturnType<typeof orderLine>[]
  initialDestination?: "amazon" | "warehouse"
  initialDeliveryId?: string
  // The supplier Restock grouped these lines under.
  initialSupplierId?: string
  // Variations whose product needs an uploaded label that it doesn't have yet.
  needsBarcodeVariantIds?: string[]
  // A draft PO being edited, saved as its next revision.
  draft?: { id: string; revision: number; data: OrderInput }
  // The page's header: its title and the breadcrumb links before it.
  title: string
  parents: Array<{ label: string; href: string }>
}) {
  const needsBarcode = new Set(needsBarcodeVariantIds)
  const router = useRouter()
  // The header's Save sits outside the form, which the header row must precede, and submits it by this id.
  const formId = useId()
  const { form, submit } = useActionForm({
    schema: orderInputSchema,
    action: draft ? "order.update" : "order.create",
    toPayload: draft ? (order) => ({ id: draft.id, revision: draft.revision, order }) : undefined,
    // Saving an edit goes back to the PO.
    onSuccess: draft ? () => router.push(`/orders/${draft.id}`) : undefined,
    defaultValues: draft?.data ?? {
      reference: "",
      supplierId: initialSupplierId ?? "",
      destination: initialDestination,
      deliveryId: initialDeliveryId,
      paymentTerms: "Payment in advance",
      currency: "USD",
      notes: "",
      adjustments: [],
      items: initialItems
    }
  })
  // Line items carry their own `id`, so the field array keys rows separately.
  const lineItems = useFieldArray({ control: form.control, name: "items", keyName: "key" })
  const charges = useFieldArray({ control: form.control, name: "adjustments" })
  const adjustments = useWatch({ control: form.control, name: "adjustments" }) ?? []
  const items = useWatch({ control: form.control, name: "items" }) ?? []
  const currency = useWatch({ control: form.control, name: "currency" }) ?? "USD"
  const destination = useWatch({ control: form.control, name: "destination" })
  const deliveryId = useWatch({ control: form.control, name: "deliveryId" })
  const via = useWatch({ control: form.control, name: "via" })
  const [addingStop, setAddingStop] = useState(false)
  // The address list depends on the destination, and a forwarder address names its forwarder, so both follow the
  // chosen destination and address. A stop on the way only suits a destination further on, such as Amazon.
  useEffect(() => {
    let choices: string[] = []
    if (destination === "forwarder") {
      choices = forwarderAddresses.map((row) => row.addressId)
    } else if (destination === "warehouse") {
      choices = deliveries.map((row) => row.id)
    }
    if (deliveryId && !choices.includes(deliveryId)) {
      form.setValue("deliveryId", undefined)
    }
    const forwarderId =
      destination === "forwarder"
        ? forwarderAddresses.find((row) => row.addressId === deliveryId)?.forwarderId
        : undefined
    if (form.getValues("forwarderId") !== forwarderId) {
      form.setValue("forwarderId", forwarderId)
    }
    if ((destination === "forwarder" || destination === "warehouse") && form.getValues("via")) {
      form.setValue("via", undefined)
    }
  }, [destination, deliveryId, deliveries, forwarderAddresses, form])
  const supplierId = useWatch({ control: form.control, name: "supplierId" }) ?? ""
  const itemsError = form.formState.errors.items
  const lookupGroups = items.map((item) =>
    item?.components?.length
      ? item.components.map((component) => component.supplierSku?.trim() ?? "")
      : [item?.supplierSku?.trim() ?? ""]
  )
  const supplierSkus = lookupGroups.flat()
  const skuKey = items.map((item, index) => `${item?.id ?? ""}\0${lookupGroups[index]?.join(",") ?? ""}`).join("\n")
  const [matches, setMatches] = useState<Match[]>([])
  const [matchError, setMatchError] = useState("")
  // Prices filled in for the buyer, from Shopify's unit cost or a supplier quote, which a newer quote may replace.
  const lastDefaultedPrice = useRef<Record<string, number>>(
    Object.fromEntries(initialItems.map((item) => [item.id, item.unitPrice]))
  )
  const buyerEditedPrices = useRef(new Set<string>())

  useEffect(() => {
    if (!supplierId || !supplierSkus.length) {
      setMatches([])
      setMatchError("")
      return
    }
    const controller = new AbortController()
    setMatches([])
    setMatchError("")
    void fetch("/api/supplier-catalog/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplierId, currency, supplierSkus }),
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Supplier catalog lookup failed")
        }
        return response.json() as Promise<Match[]>
      })
      .then((results) => {
        if (controller.signal.aborted) {
          return
        }
        let offset = 0
        const perLine = lookupGroups.map((group, index) => {
          const componentMatches = results.slice(offset, offset + group.length)
          offset += group.length
          const components = items[index]?.components
          if (!components?.length) {
            return componentMatches[0]!
          }
          const quote = bundleQuote(components, componentMatches)
          // A bundle can have as many units as its scarcest component allows.
          const units = components.flatMap((component, position) => {
            const available = componentMatches[position]?.available
            return available === null || available === undefined ? [] : [Math.floor(available / component.quantity)]
          })
          const available = units.length ? Math.min(...units) * (items[index]?.piecesPerSet ?? 1) : null
          return { sku: "", ...quote, product: null, available }
        })
        setMatches(perLine)
        perLine.forEach((result, index) => defaultPrice(index, result))
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setMatchError(error instanceof Error ? error.message : "Supplier catalog lookup failed")
        }
      })
    return () => controller.abort()
    // skuKey contains only the fields relevant to catalog matching; price edits must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId, currency, skuKey, form])

  // Fills in the supplier's price for a line unless the buyer set their own.
  function defaultPrice(index: number, result: Match) {
    const line = form.getValues(`items.${index}`)
    const price = line && result.status === "matched" ? quotedPrice(result, line.pieces) : null
    if (!line || price === null) {
      return
    }
    const prior = lastDefaultedPrice.current[line.id]
    if (
      buyerEditedPrices.current.has(line.id) ||
      (line.unitPrice !== 0 && line.unitPrice !== prior) ||
      price === prior
    ) {
      return
    }
    form.setValue(`items.${index}.unitPrice`, price, { shouldValidate: true })
    lastDefaultedPrice.current[line.id] = price
  }

  // A quantity reaching or leaving a volume break moves the line to that break's price.
  const piecesKey = items.map((item) => item?.pieces ?? 0).join(",")
  useEffect(() => {
    matches.forEach((result, index) => {
      if (result.tiers && result.tiers.length > 1) {
        defaultPrice(index, result)
      }
    })
    // defaultPrice reads the form; only quantities and quotes should rerun this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piecesKey, matches])

  function add(products: CatalogProduct[]) {
    for (const product of products) {
      if (form.getValues("items").some((item) => item.variantId === product.id)) {
        continue
      }
      const line = orderLine(
        product,
        crypto.randomUUID(),
        { asin: product.amazonAsin, fnsku: product.fnsku, ...product.lineDefaults },
        form.getValues("currency")
      )
      lastDefaultedPrice.current[line.id] = line.unitPrice
      lineItems.append(line)
    }
  }

  const stockAt = stockAtDestination(destination, deliveries.find((row) => row.id === deliveryId)?.shopifyLocationId)

  const paymentTerms = form.getValues("paymentTerms")
  // Shopify's terms, and a draft's own when it has other terms.
  const termOptions = [
    { value: "", label: "None" },
    ...[
      ...(paymentTerms && !commonPaymentTerms.some((terms) => terms === paymentTerms) ? [paymentTerms] : []),
      ...commonPaymentTerms
    ].map((terms) => ({ value: terms, label: terms }))
  ]
  const units = items.reduce((n, i) => n + (i?.pieces || 0), 0)
  const subtotal = items.reduce((n, i) => n + (i?.unitPrice || 0) * (i?.pieces || 0), 0)
  const amount = subtotal + adjustments.reduce((sum, charge) => sum + (charge?.amount || 0), 0)

  return (
    <FormProvider {...form}>
      <PageHeader title={title} parents={parents}>
        <Button
          variant="outline"
          render={<Link href={draft ? `/orders/${draft.id}` : "/orders"} />}
          nativeButton={false}
        >
          Discard
        </Button>
        <SubmitButton
          type="submit"
          form={formId}
          pending={form.formState.isSubmitting}
          disabled={!lineItems.fields.length || (!!draft && !form.formState.isDirty)}
        >
          Save
        </SubmitButton>
      </PageHeader>
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FormError message={form.formState.errors.root?.server?.message} />

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_20rem]">
          <Card className="gap-0 overflow-hidden py-0">
            <div className="flex flex-wrap items-center gap-1.5 p-3">
              <RoutePicker
                name="supplierId"
                label="Supplier"
                icon={<Building2 />}
                placeholder="Choose supplier"
                options={suppliers.map((row) => ({ value: row.id, label: row.name }))}
              />
              <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
              {(via || addingStop) && (
                <>
                  <Stop
                    forwarderAddresses={forwarderAddresses}
                    onRemove={() => {
                      form.setValue("via", undefined, { shouldDirty: true })
                      setAddingStop(false)
                    }}
                  />
                  <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
                </>
              )}
              <RoutePicker name="destination" label="Destination" icon={<MapPin />} options={destinations} />
              {destination === "warehouse" && (
                <RoutePicker
                  name="deliveryId"
                  label="Delivery address"
                  placeholder={deliveries.length ? "Choose address" : "Add an address in Settings"}
                  options={deliveries.map((row) => ({ value: row.id, label: row.name }))}
                />
              )}
              {destination === "forwarder" && (
                <RoutePicker
                  name="deliveryId"
                  label="Forwarder address"
                  placeholder={forwarderAddresses.length ? "Choose address" : "Add a forwarder first"}
                  options={forwarderAddresses.map((row) => ({ value: row.addressId, label: row.label }))}
                />
              )}
              {!via && !addingStop && destination !== "forwarder" && destination !== "warehouse" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-muted-foreground"
                  disabled={!forwarderAddresses.length}
                  onClick={() => setAddingStop(true)}
                >
                  <Plus data-icon="inline-start" />
                  Add stop
                </Button>
              )}
            </div>
            {via && forwarderAddresses.find((row) => row.addressId === via.addressId)?.hasPhone === false && (
              <p className="flex items-center gap-1.5 px-3 pb-3 text-xs text-warning">
                <AlertTriangle className="size-3.5" />
                Amazon needs a phone number at this stop for pickup.
                <Link href="/partners?type=forwarder" className="underline underline-offset-2">
                  Add one
                </Link>
              </p>
            )}

            <div className="overflow-x-auto border-t">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Products</th>
                    <th className="w-36 px-2 py-2 text-left font-medium">Supplier SKU</th>
                    <th className="w-24 px-2 py-2 text-left font-medium">Qty</th>
                    <th className="w-32 px-2 py-2 text-left font-medium">Cost</th>
                    <th className="w-24 px-2 py-2 text-right font-medium">Total</th>
                    <th className="w-18">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {!lineItems.fields.length && (
                    <tr className="border-t">
                      <td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">
                        No products
                      </td>
                    </tr>
                  )}
                  {lineItems.fields.map((line, index) => {
                    const item = items[index]
                    const note = matches[index] && matchNote(matches[index].status)
                    const available = matches[index]?.available ?? null
                    const rules = matches[index]?.rules
                    const ruleProblem = rules && item?.pieces ? quantityProblem(rules, item.pieces, "piece") : null
                    const lineError = form.formState.errors.items?.[index]
                    return (
                      <tr key={line.key} className="border-t align-top">
                        <td className="px-3 py-2.5">
                          <p className="leading-snug font-medium">{line.name}</p>
                          {line.variant && line.variant !== "Default Title" && (
                            <Badge variant="secondary" className="mt-1">
                              {line.variant}
                            </Badge>
                          )}
                          <p className="mt-1 text-xs text-muted-foreground">
                            {line.buyerSku}
                            {line.piecesPerSet > 1 && `, ${line.piecesPerSet} per unit`}
                          </p>
                          {needsBarcode.has(line.variantId) && (
                            <p className="mt-1 flex items-center gap-1 text-xs text-warning">
                              <AlertTriangle className="size-3.5" />
                              Needs an uploaded label
                            </p>
                          )}
                          <FormError message={lineError?.message ?? lineError?.root?.message} />
                        </td>
                        <td className="px-2 py-2">
                          {item?.components?.length ? (
                            <p className="py-1.5 text-xs text-muted-foreground">
                              {item.components
                                .map((component) => `${component.quantity} × ${component.supplierSku || "?"}`)
                                .join(", ")}
                            </p>
                          ) : (
                            <CellInput name={`items.${index}.supplierSku`} label={`Supplier SKU for ${line.name}`} />
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <CellNumber
                            name={`items.${index}.pieces`}
                            label={`Quantity of ${line.name}`}
                            min={line.piecesPerSet}
                            step={line.piecesPerSet}
                          />
                          {available !== null && (
                            <p
                              className={cn(
                                "mt-1 text-xs",
                                (item?.pieces ?? 0) > available ? "text-destructive" : "text-muted-foreground"
                              )}
                            >
                              {available} available
                            </p>
                          )}
                          {ruleProblem && <p className="mt-1 text-xs text-warning">{ruleProblem}</p>}
                        </td>
                        <td className="px-2 py-2">
                          <CellNumber
                            name={`items.${index}.unitPrice`}
                            label={`Cost of ${line.name}`}
                            prefix="$"
                            scale={100}
                            step={0.01}
                            min={0}
                            onValueChange={() => buyerEditedPrices.current.add(line.id)}
                          />
                          {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
                        </td>
                        <td className="px-2 py-3.5 text-right tabular-nums">
                          {money((item?.unitPrice || 0) * (item?.pieces || 0), currency)}
                        </td>
                        <td className="py-2 pr-2">
                          <div className="flex justify-end">
                            <LineMenu
                              index={index}
                              name={line.name}
                              orderId={draft?.id}
                              itemId={line.id}
                              toAmazon={destination === "amazon"}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Remove ${line.name}`}
                              onClick={() => lineItems.remove(index)}
                            >
                              <X />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t p-3">
              <AddProductsDialog added={new Set(items.map((item) => item?.variantId))} stockAt={stockAt} onAdd={add} />
              <FormError message={itemsError?.message ?? itemsError?.root?.message} />
              {matchError && <FormError message={matchError} />}
            </div>
          </Card>

          <div className="flex flex-col gap-4">
            <Card size="sm">
              <CardHeader>
                <CardTitle>Cost summary</CardTitle>
                <CardAction>
                  <CostSummaryDialog
                    currency={currency}
                    adjustments={adjustments}
                    onSave={(rows) => charges.replace(rows)}
                  />
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <p className="font-medium">Order details</p>
                <div className="flex justify-between gap-3">
                  <span>
                    {lineItems.fields.length} {lineItems.fields.length === 1 ? "variant" : "variants"} ({units}{" "}
                    {units === 1 ? "item" : "items"})
                  </span>
                  <span className="tabular-nums">{money(subtotal, currency)}</span>
                </div>
                {adjustments.map((adjustment, index) => (
                  <div key={index} className="flex justify-between gap-3">
                    <span>{adjustment.description}</span>
                    <span className="tabular-nums">{money(adjustment.amount, currency)}</span>
                  </div>
                ))}
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{money(amount, currency)}</span>
                </div>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>Purchase order details</CardTitle>
              </CardHeader>
              <CardContent>
                <FieldGroup className="gap-4">
                  <FormInput name="reference" required label="Reference number" placeholder="PO-038" />
                  <RequiredBy />
                  <FormTextarea name="notes" label="Note to supplier" />
                  <Separator />
                  <p className="font-medium">Purchasing information</p>
                  <FormSelect name="paymentTerms" label="Payment terms" options={termOptions} />
                  <FormSelect name="currency" required label="Supplier currency" options={currencies} />
                </FieldGroup>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </FormProvider>
  )
}

// Where the PO's stock is counted for the product picker: FBA and AWD together, or the address's Shopify location.
function stockAtDestination(destination: OrderInput["destination"], shopifyLocationId?: string | null): StockAt {
  switch (destination) {
    case "amazon":
      return { locationIds: ["amazon:fba", "amazon:awd"], label: "At Amazon" }
    case "warehouse":
      return { locationIds: shopifyLocationId ? [shopifyLocationId] : null, label: "At location" }
    default:
      return { locationIds: null, label: "At destination" }
  }
}

type Option = { value: string; label: string; disabled?: boolean }

// A pill in the route from the supplier to the destination, which opens a menu of choices.
function PillSelect({
  label,
  icon,
  options,
  placeholder,
  value,
  onChange,
  invalid
}: {
  label: string
  icon?: React.ReactNode
  options: Option[]
  placeholder?: string
  value: string | null
  onChange: (value: string | null) => void
  invalid?: boolean
}) {
  return (
    <Select items={options} value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={label}
        aria-invalid={invalid}
        size="sm"
        className="max-w-md min-w-0 rounded-full border-transparent bg-muted font-medium hover:bg-muted/70 dark:bg-muted *:data-[slot=select-value]:block *:data-[slot=select-value]:truncate"
      >
        {icon}
        <SelectValue>
          {(chosen: string | null) => options.find((option) => option.value === chosen)?.label ?? placeholder}
        </SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="start" className="w-auto min-w-48">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function RoutePicker({
  name,
  ...props
}: {
  name: string
  label: string
  icon?: React.ReactNode
  options: Option[]
  placeholder?: string
}) {
  const {
    field: { value, onChange },
    fieldState
  } = useController({ name })
  return (
    <PillSelect
      {...props}
      value={typeof value === "string" && value ? value : null}
      onChange={(next) => onChange(next ?? undefined)}
      invalid={fieldState.invalid}
    />
  )
}

// A freight forwarder the goods stop at on the way to the destination.
function Stop({
  forwarderAddresses,
  onRemove
}: {
  forwarderAddresses: Array<{ addressId: string; forwarderId: string; label: string }>
  onRemove: () => void
}) {
  const { setValue, control } = useFormContext<OrderInput>()
  const via = useWatch({ control, name: "via" })
  return (
    <span className="flex items-center">
      <PillSelect
        label="Stop on the way"
        icon={<Warehouse />}
        placeholder="Choose forwarder"
        options={forwarderAddresses.map((row) => ({ value: row.addressId, label: row.label }))}
        value={via?.addressId ?? null}
        onChange={(addressId) => {
          const row = forwarderAddresses.find((address) => address.addressId === addressId)
          setValue("via", row ? { forwarderId: row.forwarderId, addressId: row.addressId } : undefined, {
            shouldDirty: true
          })
        }}
      />
      <Button type="button" variant="ghost" size="icon-xs" aria-label="Remove the stop" onClick={onRemove}>
        <X />
      </Button>
    </span>
  )
}

function CellInput({ name, label, placeholder }: { name: string; label: string; placeholder?: string }) {
  const {
    field: { value, onChange, onBlur, ref },
    fieldState
  } = useController({ name })
  return (
    <Input
      ref={ref}
      aria-label={label}
      placeholder={placeholder}
      value={(value as string | undefined) ?? ""}
      onChange={onChange}
      onBlur={onBlur}
      aria-invalid={fieldState.invalid}
    />
  )
}

// A number cell, scaled like prices kept in cents, with an optional prefix such as "$".
function CellNumber({
  name,
  label,
  prefix,
  scale = 1,
  onValueChange,
  ...props
}: {
  name: string
  label: string
  prefix?: string
  scale?: number
  onValueChange?: () => void
  min?: number
  step?: number
}) {
  const {
    field: { value, onChange, onBlur, ref },
    fieldState
  } = useController({ name })
  // Money reads with its cents, like $78.50, except while being typed.
  const [typing, setTyping] = useState(false)
  const shown = typeof value === "number" && Number.isFinite(value) ? value / scale : ""
  const input = (
    <InputGroupInput
      {...props}
      ref={ref}
      type="number"
      // A quantity steps in whole pieces, so its keypad has no decimal point.
      inputMode={Number.isInteger(props.step) ? "numeric" : "decimal"}
      aria-label={label}
      value={!typing && scale === 100 && shown !== "" ? shown.toFixed(2) : shown}
      onFocus={() => setTyping(true)}
      onChange={(event) => {
        onChange(event.target.value === "" ? undefined : Math.round(event.target.valueAsNumber * scale * 1000) / 1000)
        onValueChange?.()
      }}
      onBlur={() => {
        setTyping(false)
        onBlur()
      }}
      aria-invalid={fieldState.invalid}
      className="tabular-nums"
    />
  )
  return (
    <InputGroup>
      {prefix && (
        <InputGroupAddon>
          <InputGroupText>{prefix}</InputGroupText>
        </InputGroupAddon>
      )}
      {input}
    </InputGroup>
  )
}

// A line's menu: its labels once the PO is saved, and its packing details.
function LineMenu({
  index,
  name,
  orderId,
  itemId,
  toAmazon
}: {
  index: number
  name: string
  orderId?: string
  itemId: string
  toAmazon: boolean
}) {
  const [packing, setPacking] = useState(false)
  const { getValues, setValue } = useFormContext()
  const warning = useWatch({ name: `items.${index}.suffocationWarning` }) as boolean | undefined
  function editPacking() {
    // Lines saved before each chose its Amazon network go to FBA, as the schema defaults them.
    if (toAmazon && !getValues(`items.${index}.amazonNetwork`)) {
      setValue(`items.${index}.amazonNetwork`, "fba")
    }
    setPacking(true)
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button type="button" variant="ghost" size="icon-sm" aria-label={`More for ${name}`} />}
        >
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {orderId && (
            <DropdownMenuItem
              render={<a href={`/api/orders/${orderId}/labels/${itemId}`} download aria-label="Download label" />}
            >
              <Download />
              Download label
            </DropdownMenuItem>
          )}
          {orderId && warning && (
            <DropdownMenuItem
              render={<a href={`/api/orders/${orderId}/labels/warning`} download aria-label="Download hazard label" />}
            >
              <Download />
              Download hazard label
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={editPacking}>
            <Package />
            Edit packing details
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={packing} onOpenChange={setPacking}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Packing details</DialogTitle>
            <DialogDescription>{name}</DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-4">
            {toAmazon && (
              <FormSelect
                name={`items.${index}.amazonNetwork`}
                required
                label="Amazon warehouse"
                options={networkOptions}
              />
            )}
            <FormSelect name={`items.${index}.prepCategory`} required label="Preparation" options={prepOptions} />
            <SkuLabel index={index} toAmazon={toAmazon} />
            <FormCheckbox name={`items.${index}.suffocationWarning`} label="Suffocation warning label" />
            <FormTextarea
              name={`items.${index}.instructions`}
              label="Instructions"
              placeholder="Handling or labeling exceptions"
            />
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" />}>Done</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

type Adjustment = { description: string; amount: number }
type AdjustmentRow = { key: string; type: string; amount: string }

// Shopify's cost summary editor, behind an Edit button: each row a kind of cost and its amount, saved together. A
// discount is entered as a positive amount and taken off.
function CostSummaryDialog({
  currency,
  adjustments,
  onSave
}: {
  currency: string
  adjustments: Adjustment[]
  onSave: (rows: Adjustment[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<AdjustmentRow[]>([])
  const types = [
    ...adjustmentTypes,
    ...adjustments.map((row) => row.description).filter((type) => !adjustmentTypes.some((known) => known === type))
  ].map((type) => ({ value: type, label: type }))
  const complete = rows.every((row) => row.type && row.amount !== "" && Number.isFinite(Number(row.amount)))
  function start() {
    setRows(
      adjustments.map((row) => ({
        key: crypto.randomUUID(),
        type: row.description,
        amount: String(Math.abs(row.amount) / 100)
      }))
    )
    setOpen(true)
  }
  function save() {
    onSave(
      rows.map((row) => {
        const cents = Math.round(Math.abs(Number(row.amount)) * 100)
        return { description: row.type, amount: row.type === "Discount" ? -cents : cents }
      })
    )
    setOpen(false)
  }
  const update = (key: string, change: Partial<AdjustmentRow>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)))
  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={start}>
        Edit<span className="sr-only"> cost summary</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit cost summary</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {rows.length > 0 && (
              <div className="grid grid-cols-[minmax(0,1fr)_8rem_1.75rem] gap-2 text-muted-foreground">
                <span>Adjustment</span>
                <span>Amount</span>
              </div>
            )}
            {rows.map((row) => (
              <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_8rem_1.75rem] items-center gap-2">
                <Select
                  items={types}
                  value={row.type || null}
                  onValueChange={(type) => update(row.key, { type: type ?? "" })}
                >
                  <SelectTrigger aria-label="Adjustment" className="w-full">
                    <SelectValue>{(type: string | null) => type ?? "Select"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {types.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <InputGroup>
                  <InputGroupAddon>
                    <InputGroupText>{currency === "USD" ? "$" : currency}</InputGroupText>
                  </InputGroupAddon>
                  <InputGroupInput
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={0.01}
                    aria-label="Amount"
                    value={row.amount}
                    onChange={(event) => update(row.key, { amount: event.target.value })}
                    className="tabular-nums"
                  />
                </InputGroup>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove adjustment"
                  onClick={() => setRows((current) => current.filter((candidate) => candidate.key !== row.key))}
                >
                  <X />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              disabled={rows.length >= 50}
              onClick={() => setRows((current) => [...current, { key: crypto.randomUUID(), type: "", amount: "" }])}
            >
              <Plus data-icon="inline-start" />
              Add adjustment
            </Button>
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="button" disabled={!complete} onClick={save}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// Whether each unit gets its SKU label. Amazon needs every unit labeled, so POs to Amazon keep it on.
function SkuLabel({ index, toAmazon }: { index: number; toAmazon: boolean }) {
  const { field } = useController({ name: `items.${index}.skuLabel` })
  const id = `sku-label-${index}`
  return (
    <Field orientation="horizontal" data-disabled={toAmazon || undefined}>
      <Checkbox
        id={id}
        checked={toAmazon || field.value !== false}
        disabled={toAmazon}
        onCheckedChange={(checked) => field.onChange(checked)}
      />
      <FieldContent>
        <FieldLabel htmlFor={id}>SKU label</FieldLabel>
        {toAmazon && <FieldDescription>Amazon requires it</FieldDescription>}
      </FieldContent>
    </Field>
  )
}

// When the goods are needed, which the purchase order's page and PDF show. A cleared date input reads "", which the
// order keeps as no date.
function RequiredBy() {
  const id = useId()
  const {
    field: { ref, value, onChange, onBlur, name },
    fieldState
  } = useController<OrderInput, "dueDate">({ name: "dueDate" })
  return (
    <Field data-invalid={fieldState.invalid}>
      <FormLabel htmlFor={id} label="Required by" />
      <DateInput
        id={id}
        ref={ref}
        name={name}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || undefined)}
        onBlur={onBlur}
        aria-invalid={fieldState.invalid}
      />
      <FieldError errors={[fieldState.error]} />
    </Field>
  )
}
