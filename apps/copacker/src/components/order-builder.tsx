"use client"

import {
  amazonNetworkNames,
  adjustmentTypes,
  amazonNetworks,
  commonPaymentTerms,
  itemTotal,
  orderCharges,
  orderTotal,
  supplierChargeTotal,
  type OrderInput,
  orderInputSchema
} from "@repo/aisle"
import {
  ArrowRight,
  Building2,
  ChevronDown,
  Download,
  Ellipsis,
  MapPin,
  Package,
  Plus,
  Warehouse,
  X
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useId, useRef, useState } from "react"
import { FormProvider, useController, useFieldArray, useFormContext, useWatch } from "react-hook-form"
import { PageLink } from "@/components/access"
import { PageHeader, WarningNote } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
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
import { useMoney } from "@/hooks/use-money"
import { useActionForm } from "@/hooks/useActionForm"
import type { CatalogProduct } from "@/lib/api"
import { bundleQuote, type BundleQuoteStatus } from "@/lib/bundle-quote"
import { quantityProblem, type QuantityRules } from "@/lib/catalog-pricing"
import { currencySymbol } from "@/lib/currency"
import { adjustmentKeys, knownName, orderLine, paymentTermKeys } from "@/lib/order-lines"
import { prepOptions } from "@/lib/prep"
import { cn } from "@/lib/utils"
import { FormError, SubmitButton } from "./actions"
import { AddProductsDialog, type StockAt } from "./add-products-dialog"
import { DateInput, FormCheckbox, FormInput, FormLabel, FormTextarea } from "./form-controls"
import { FormSelect } from "./form-select"

// Where a purchase order can go, each labeled under orders.builder.destinations.
const destinations = ["amazon", "warehouse"] as const
// Which of Amazon's networks a line goes to, when the PO ships to Amazon.
const networkOptions = amazonNetworks.map((value) => ({ value, label: amazonNetworkNames[value] }))
// The currencies a PO can be in, each named under orders.currencies.
const currencies = ["USD", "CNY", "EUR", "GBP", "CAD", "AUD"] as const

// Why a line's price isn't the supplier's quote, in a few words, as its key under orders.builder.matchNotes. A supplier
// without a catalog has nothing to say.
function matchNote(status: string) {
  switch (status) {
    case "matched":
    case "supplier_catalog_unavailable":
      return null
    case "not_in_supplier_catalog":
      return "notInCatalog"
    case "supplier_sku_missing":
      return "noSupplierSku"
    case "currency_review":
      return "otherCurrency"
    case "price_missing":
      return "noPrice"
    default:
      return "checkPrice"
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
  // The forwarders' addresses a PO can stop at on the way, and whether Amazon could pick up there.
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
  const t = useTranslations("orders")
  const tb = useTranslations("orders.builder")
  const locale = useLocale()
  const money = useMoney()
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
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set())
  const selectedCount = lineItems.fields.filter((line) => selectedLines.has(line.id)).length
  const groups = (destination === "amazon" ? (["awd_us", "fba"] as const) : (["warehouse"] as const))
    .map((network) => ({
      network,
      label: network === "warehouse" ? tb("destinations.warehouse") : amazonNetworkNames[network],
      lines: lineItems.fields
        .map((line, index) => ({ line, index }))
        .filter(({ index }) => network === "warehouse" || (items[index]?.amazonNetwork ?? "fba") === network)
    }))
    .filter((group) => group.lines.length > 0)
  function selectLines(ids: string[], selected: boolean) {
    setSelectedLines((current) => {
      const next = new Set(current)
      for (const id of ids) {
        if (selected) {
          next.add(id)
        } else {
          next.delete(id)
        }
      }
      return next
    })
  }
  function moveSelected(network: OrderInput["items"][number]["amazonNetwork"]) {
    lineItems.fields.forEach((line, index) => {
      if (selectedLines.has(line.id)) {
        form.setValue(`items.${index}.amazonNetwork`, network, { shouldDirty: true, shouldValidate: true })
      }
    })
    setSelectedLines(new Set())
  }
  // A delivery address is one of the buyer's locations, so another destination clears it. A stop on the way suits
  // either destination and stays.
  useEffect(() => {
    if (deliveryId && (destination !== "warehouse" || !deliveries.some((row) => row.id === deliveryId))) {
      form.setValue("deliveryId", undefined)
    }
  }, [destination, deliveryId, deliveries, form])
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
          throw new Error(tb("catalogLookupFailed"))
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
          setMatchError(error instanceof Error ? error.message : tb("catalogLookupFailed"))
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
  const stockLabel = {
    amazon: tb("stockAt.amazon"),
    warehouse: tb("stockAt.location"),
    forwarder: tb("stockAt.destination")
  }

  const paymentTerms = form.getValues("paymentTerms")
  // Shopify's terms, and a draft's own when it has other terms.
  const termOptions = [
    { value: "", label: t("detail.none") },
    ...[
      ...(paymentTerms && !commonPaymentTerms.some((terms) => terms === paymentTerms) ? [paymentTerms] : []),
      ...commonPaymentTerms
    ].map((terms) => ({ value: terms, label: knownName(paymentTermKeys, terms, t) }))
  ]
  const units = items.reduce((n, i) => n + (i?.pieces || 0), 0)
  const subtotal = items.reduce((n, i) => n + (i?.unitPrice || 0) * (i?.pieces || 0), 0)
  const summaryCharges = orderCharges({ items, adjustments })
  const amount = orderTotal({ items, adjustments })

  return (
    <FormProvider {...form}>
      <PageHeader title={title} parents={parents}>
        <Button
          variant="outline"
          render={<Link href={draft ? `/orders/${draft.id}` : "/orders"} />}
          nativeButton={false}
        >
          {tb("discard")}
        </Button>
        <SubmitButton
          type="submit"
          form={formId}
          pending={form.formState.isSubmitting}
          disabled={!lineItems.fields.length || (!!draft && !form.formState.isDirty)}
        >
          {tb("save")}
        </SubmitButton>
      </PageHeader>
      <form id={formId} onSubmit={submit} noValidate className="@container flex flex-col gap-4">
        <FormError message={form.formState.errors.root?.server?.message} />

        <div className="grid grid-cols-1 items-start gap-4 @min-[72rem]:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex min-w-0 flex-col gap-4">
            <Card className="gap-0 py-0">
              <div className="flex flex-wrap items-center gap-1.5 p-3">
                <RoutePicker
                  name="supplierId"
                  label={tb("supplier")}
                  icon={<Building2 />}
                  placeholder={tb("chooseSupplier")}
                  options={suppliers.map((row) => ({ value: row.id, label: row.name }))}
                />
                <ArrowRight className="size-4 text-muted-foreground rtl:rotate-180" aria-hidden />
                {(via || addingStop) && (
                  <>
                    <Stop
                      forwarderAddresses={forwarderAddresses}
                      onRemove={() => {
                        form.setValue("via", undefined, { shouldDirty: true })
                        setAddingStop(false)
                      }}
                    />
                    <ArrowRight className="size-4 text-muted-foreground rtl:rotate-180" aria-hidden />
                  </>
                )}
                <RoutePicker
                  name="destination"
                  label={tb("destination")}
                  icon={<MapPin />}
                  options={destinations.map((value) => ({ value, label: tb(`destinations.${value}`) }))}
                />
                {destination === "warehouse" && (
                  <RoutePicker
                    name="deliveryId"
                    label={tb("deliveryAddress")}
                    placeholder={deliveries.length ? tb("chooseAddress") : tb("addAddressInSettings")}
                    options={deliveries.map((row) => ({ value: row.id, label: row.name }))}
                  />
                )}
                {!via && !addingStop && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ms-auto text-muted-foreground"
                    disabled={!forwarderAddresses.length}
                    onClick={() => setAddingStop(true)}
                  >
                    <Plus data-icon="inline-start" />
                    {tb("addStop")}
                  </Button>
                )}
              </div>
              {via &&
                destination === "amazon" &&
                forwarderAddresses.find((row) => row.addressId === via.addressId)?.hasPhone === false && (
                  <p className="px-3 pb-3">
                    <WarningNote>{tb.rich("stopNeedsPhone", { link: forwardersLink })}</WarningNote>
                  </p>
                )}
            </Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">{tb("shipments")}</h2>
              {destination === "amazon" && <p className="text-sm text-muted-foreground">{tb("groupingHint")}</p>}
            </div>
            {destination === "amazon" && selectedCount > 0 && (
              <div
                className="flex flex-wrap items-center gap-2 rounded-md border bg-muted p-3"
                role="toolbar"
                aria-label={tb("moveProducts")}
              >
                <span className="me-auto text-sm font-medium">{tb("selectedProducts", { count: selectedCount })}</span>
                {networkOptions.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => moveSelected(option.value)}
                  >
                    {tb("moveTo", { destination: option.label })}
                  </Button>
                ))}
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedLines(new Set())}>
                  {tb("clearSelection")}
                </Button>
              </div>
            )}
            {groups.map((group) => {
              const selected = group.lines.filter(({ line }) => selectedLines.has(line.id)).length
              const groupPieces = group.lines.reduce((sum, { index }) => sum + (items[index]?.pieces || 0), 0)
              const groupTotal = group.lines.reduce(
                (sum, { index }) => sum + (items[index] ? itemTotal(items[index]) : 0),
                0
              )
              return (
                <Collapsible key={group.network} defaultOpen render={<Card className="gap-0 overflow-hidden py-0" />}>
                  <div className="flex items-center gap-3 px-3 py-2">
                    {destination === "amazon" && (
                      <Checkbox
                        aria-label={tb("selectShipment", { destination: group.label })}
                        checked={selected === group.lines.length}
                        indeterminate={selected > 0 && selected < group.lines.length}
                        onCheckedChange={(checked) =>
                          selectLines(
                            group.lines.map(({ line }) => line.id),
                            checked
                          )
                        }
                      />
                    )}
                    <CollapsibleTrigger className="group flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-sm text-start focus-visible:outline-ring">
                      <Package className="size-4 text-muted-foreground" aria-hidden />
                      <h3 className="font-semibold">{tb("shipmentTo", { destination: group.label })}</h3>
                      <span className="ms-auto flex flex-col items-end gap-1 text-end text-sm sm:flex-row sm:items-center sm:gap-4">
                        <span className="text-muted-foreground">
                          {tb("shipmentCounts", { count: group.lines.length, pieces: groupPieces })}
                        </span>
                        <span className="font-semibold whitespace-nowrap tabular-nums">
                          <span className="sr-only">{tb("shipmentTotal")} </span>
                          {money(groupTotal, currency)}
                        </span>
                      </span>
                      <ChevronDown
                        className="size-4 shrink-0 transition-transform group-data-[panel-open]:rotate-180"
                        aria-hidden
                      />
                    </CollapsibleTrigger>
                  </div>
                  <CollapsibleContent keepMounted>
                    <div className="relative overflow-x-auto border-t">
                      <table className="w-full min-w-3xl text-sm">
                        <thead className="bg-muted">
                          <tr>
                            {destination === "amazon" && (
                              <th className="w-10">
                                <span className="sr-only">{tb("select")}</span>
                              </th>
                            )}
                            <th className="h-10 px-3 text-start font-medium">{t("detail.columns.products")}</th>
                            <th className="h-10 w-36 px-2 text-start font-medium">{t("detail.columns.supplierSku")}</th>
                            <th className="h-10 w-24 px-2 text-end font-medium">{t("detail.columns.quantity")}</th>
                            <th className="h-10 w-32 px-2 text-start font-medium">{t("detail.columns.cost")}</th>
                            <th className="h-10 w-24 px-2 text-end font-medium">{t("detail.columns.total")}</th>
                            <th className="w-18">
                              <span className="sr-only">{t("detail.columns.actions")}</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.lines.map(({ line, index }) => {
                            const item = items[index]
                            const note = matches[index] && matchNote(matches[index].status)
                            const available = matches[index]?.available ?? null
                            const rules = matches[index]?.rules
                            const ruleProblem =
                              rules && item?.pieces ? quantityProblem(rules, item.pieces, "piece") : null
                            const lineError = form.formState.errors.items?.[index]
                            return (
                              <tr
                                key={line.key}
                                className={cn(
                                  "border-t align-top",
                                  destination === "amazon" && selectedLines.has(line.id) && "bg-accent/50"
                                )}
                              >
                                {destination === "amazon" && (
                                  <td className="px-3 py-4">
                                    <Checkbox
                                      aria-label={tb("selectProduct", {
                                        name: `${line.name}${line.variant && line.variant !== "Default Title" ? `, ${line.variant}` : ""}`
                                      })}
                                      checked={selectedLines.has(line.id)}
                                      onCheckedChange={(checked) => selectLines([line.id], checked)}
                                    />
                                  </td>
                                )}
                                <td className="px-3 py-2.5">
                                  <p className="leading-snug font-medium">{line.name}</p>
                                  {line.variant && line.variant !== "Default Title" && (
                                    <Badge variant="secondary" className="mt-1">
                                      {line.variant}
                                    </Badge>
                                  )}
                                  <p className="mt-1 text-xs text-muted-foreground">{line.buyerSku}</p>
                                  {line.piecesPerSet > 1 && (
                                    <p className="text-xs text-muted-foreground">
                                      {t("detail.perPack", { count: line.piecesPerSet })}
                                    </p>
                                  )}
                                  {needsBarcode.has(line.variantId) && (
                                    <p className="mt-1">
                                      <WarningNote>{tb("needsLabel")}</WarningNote>
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
                                    <CellInput
                                      name={`items.${index}.supplierSku`}
                                      label={tb("supplierSkuFor", { name: line.name })}
                                    />
                                  )}
                                </td>
                                <td className="px-2 py-2">
                                  <CellNumber
                                    name={`items.${index}.pieces`}
                                    label={tb("quantityOf", { name: line.name })}
                                    min={line.piecesPerSet}
                                    step={line.piecesPerSet}
                                  />
                                  {line.piecesPerSet > 1 && item?.pieces ? (
                                    <p className="mt-1 text-end text-xs whitespace-nowrap text-muted-foreground">
                                      {tb("packCount", {
                                        count: item.pieces / line.piecesPerSet,
                                        size: line.piecesPerSet
                                      })}
                                    </p>
                                  ) : null}
                                  {available !== null && (
                                    <p
                                      className={cn(
                                        "mt-1 text-xs",
                                        (item?.pieces ?? 0) > available ? "text-destructive" : "text-muted-foreground"
                                      )}
                                    >
                                      {tb("available", { count: available })}
                                    </p>
                                  )}
                                  {ruleProblem && (
                                    <p className="mt-1">
                                      <WarningNote>{ruleProblem}</WarningNote>
                                    </p>
                                  )}
                                </td>
                                <td className="px-2 py-2">
                                  <CellNumber
                                    name={`items.${index}.unitPrice`}
                                    label={tb("costOf", { name: line.name })}
                                    prefix={currencySymbol(currency, locale)}
                                    scale={100}
                                    step={0.01}
                                    min={0}
                                    onValueChange={() => buyerEditedPrices.current.add(line.id)}
                                  />
                                  {note && (
                                    <p className="mt-1 text-xs text-muted-foreground">{tb(`matchNotes.${note}`)}</p>
                                  )}
                                </td>
                                <td className="px-2 py-3.5 text-end tabular-nums">
                                  {money(item ? itemTotal(item) : 0, currency)}
                                  {item?.supplierCharges?.map((charge, chargeIndex) => (
                                    <p key={chargeIndex} className="mt-1 text-xs text-muted-foreground">
                                      {knownName(adjustmentKeys, charge.description, t)}{" "}
                                      {money(supplierChargeTotal(item, charge), currency)}
                                    </p>
                                  ))}
                                </td>
                                <td className="py-2 pe-2">
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
                                      aria-label={tb("remove", { name: line.name })}
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
                  </CollapsibleContent>
                </Collapsible>
              )
            })}
            {!lineItems.fields.length && (
              <Card>
                <CardContent className="text-center text-sm text-muted-foreground">{tb("noProducts")}</CardContent>
              </Card>
            )}
            <div>
              <AddProductsDialog
                added={new Set(items.map((item) => item?.variantId))}
                stockAt={{ ...stockAt, label: stockLabel[stockAt.label] }}
                onAdd={add}
              />
              <FormError message={itemsError?.message ?? itemsError?.root?.message} />
              {matchError && <FormError message={matchError} />}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <Card size="sm">
              <CardHeader>
                <CardTitle>{t("detail.costSummary")}</CardTitle>
                <CardAction>
                  <CostSummaryDialog
                    currency={currency}
                    adjustments={adjustments}
                    onSave={(rows) => charges.replace(rows)}
                  />
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <p className="font-medium">{t("detail.orderDetails")}</p>
                <div className="flex justify-between gap-3">
                  <span>{t("detail.variantsAndItems", { variants: lineItems.fields.length, items: units })}</span>
                  <span className="tabular-nums">{money(subtotal, currency)}</span>
                </div>
                {summaryCharges.map((adjustment, index) => (
                  <div key={index} className="flex justify-between gap-3">
                    <span>{knownName(adjustmentKeys, adjustment.description, t)}</span>
                    <span className="tabular-nums">{money(adjustment.amount, currency)}</span>
                  </div>
                ))}
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>{t("detail.columns.total")}</span>
                  <span className="tabular-nums">{money(amount, currency)}</span>
                </div>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>{t("detail.purchaseOrderDetails")}</CardTitle>
              </CardHeader>
              <CardContent>
                <FieldGroup className="gap-4">
                  <FormInput name="reference" required label={tb("reference")} placeholder="PO-038" />
                  <RequiredBy />
                  <FormTextarea name="notes" label={t("detail.noteToSupplier")} />
                  <Separator />
                  <p className="font-medium">{tb("purchasingInformation")}</p>
                  <FormSelect name="paymentTerms" label={t("detail.paymentTerms")} options={termOptions} />
                  <FormSelect
                    name="currency"
                    required
                    label={tb("supplierCurrency")}
                    options={currencies.map((value) => ({ value, label: t(`currencies.${value}`) }))}
                  />
                </FieldGroup>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </FormProvider>
  )
}

// Where the PO's stock is counted for the product picker: FBA and AWD together, or the address's Shopify location. Its
// label is the destination, which the builder names.
function stockAtDestination(
  destination: OrderInput["destination"],
  shopifyLocationId?: string | null
): Omit<StockAt, "label"> & { label: "amazon" | "warehouse" | "forwarder" } {
  switch (destination) {
    case "amazon":
      return { locationIds: ["amazon:fba", "amazon:awd"], label: "amazon" }
    case "warehouse":
      return { locationIds: shopifyLocationId ? [shopifyLocationId] : null, label: "warehouse" }
    default:
      return { locationIds: null, label: "forwarder" }
  }
}

type Option = { value: string; label: string; disabled?: boolean }

// Markup in translated sentences: the link to add a forwarder's phone number, and words only screen readers say.
const forwardersLink = (chunks: React.ReactNode) => (
  <PageLink href="/partners?type=forwarder" className="underline underline-offset-2">
    {chunks}
  </PageLink>
)
const screenReaderOnly = (chunks: React.ReactNode) => <span className="sr-only">{chunks}</span>

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
  const t = useTranslations("orders.builder")
  const { setValue, control } = useFormContext<OrderInput>()
  const via = useWatch({ control, name: "via" })
  return (
    <span className="flex min-w-0 items-center">
      <PillSelect
        label={t("stop")}
        icon={<Warehouse />}
        placeholder={t("chooseForwarder")}
        options={forwarderAddresses.map((row) => ({ value: row.addressId, label: row.label }))}
        value={via?.addressId ?? null}
        onChange={(addressId) => {
          const row = forwarderAddresses.find((address) => address.addressId === addressId)
          setValue("via", row ? { forwarderId: row.forwarderId, addressId: row.addressId } : undefined, {
            shouldDirty: true
          })
        }}
      />
      <Button type="button" variant="ghost" size="icon-xs" aria-label={t("removeStop")} onClick={onRemove}>
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
        // A cleared cell holds null, which saving asks to fill in. Undefined would read back as the line's first value.
        onChange(event.target.value === "" ? null : Math.round(event.target.valueAsNumber * scale * 1000) / 1000)
        onValueChange?.()
      }}
      onBlur={() => {
        setTyping(false)
        onBlur()
      }}
      aria-invalid={fieldState.invalid}
      className="text-end tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
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
  const t = useTranslations("orders")
  const tShipments = useTranslations("shipments")
  const [packing, setPacking] = useState(false)
  const warning = useWatch({ name: `items.${index}.suffocationWarning` }) as boolean | undefined
  function editPacking() {
    setPacking(true)
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button type="button" variant="ghost" size="icon-sm" aria-label={t("actions.moreFor", { name })} />}
        >
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {orderId && (
            <DropdownMenuItem
              render={
                <a href={`/api/orders/${orderId}/labels/${itemId}`} download aria-label={t("actions.downloadLabel")} />
              }
            >
              <Download />
              {t("actions.downloadLabel")}
            </DropdownMenuItem>
          )}
          {orderId && warning && (
            <DropdownMenuItem
              render={
                <a
                  href={`/api/orders/${orderId}/labels/warning`}
                  download
                  aria-label={t("actions.downloadHazardLabel")}
                />
              }
            >
              <Download />
              {t("actions.downloadHazardLabel")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={editPacking}>
            <Package />
            {t("builder.editPacking")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={packing} onOpenChange={setPacking}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("builder.packingDetails")}</DialogTitle>
            <DialogDescription>{name}</DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-4">
            <FormSelect
              name={`items.${index}.prepCategory`}
              required
              label={t("builder.preparation")}
              options={prepOptions(tShipments)}
            />
            <SkuLabel index={index} toAmazon={toAmazon} />
            <FormCheckbox name={`items.${index}.suffocationWarning`} label={t("builder.suffocationWarning")} />
            <FormTextarea
              name={`items.${index}.instructions`}
              label={t("detail.instructions")}
              placeholder={t("builder.instructionsPlaceholder")}
            />
            <SupplierCharges index={index} />
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" />}>{t("builder.done")}</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function SupplierCharges({ index }: { index: number }) {
  const t = useTranslations("orders")
  const locale = useLocale()
  const money = useMoney()
  const { control } = useFormContext<OrderInput>()
  const currency = useWatch({ control, name: "currency" })
  const item = useWatch({ control, name: `items.${index}` })
  const charges = useFieldArray({ control, name: `items.${index}.supplierCharges`, keyName: "key" })
  const types = adjustmentTypes
    .filter((type) => type !== "Discount")
    .map((type) => ({
      value: type,
      label: knownName(adjustmentKeys, type, t)
    }))
  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">{t("builder.supplierCharges")}</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={charges.fields.length >= 20}
          onClick={() =>
            charges.append({ description: "Packing", amount: 0, basis: item.piecesPerSet > 1 ? "pack" : "piece" })
          }
        >
          <Plus />
          {t("builder.addSupplierCharge")}
        </Button>
      </div>
      {charges.fields.map((charge, chargeIndex) => (
        <div key={charge.key} className="flex flex-col gap-3 rounded-md border p-3">
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <FormSelect
                name={`items.${index}.supplierCharges.${chargeIndex}.description`}
                label={t("builder.expenseType")}
                options={types}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("builder.removeSupplierCharge")}
              onClick={() => charges.remove(chargeIndex)}
            >
              <X />
            </Button>
          </div>
          <div className="grid grid-cols-2 items-end gap-3">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">{t("builder.rate")}</span>
              <CellNumber
                name={`items.${index}.supplierCharges.${chargeIndex}.amount`}
                label={t("builder.rate")}
                min={0}
                step={0.01}
                scale={100}
                prefix={currencySymbol(currency, locale)}
              />
            </div>
            <FormSelect
              name={`items.${index}.supplierCharges.${chargeIndex}.basis`}
              label={t("builder.chargeBasis")}
              options={[
                { value: "pack", label: t("builder.perPack") },
                { value: "piece", label: t("builder.perPiece") },
                { value: "flat", label: t("builder.flatAmount") }
              ]}
            />
          </div>
          <div className="flex justify-between gap-3 text-sm">
            <span>{t("detail.columns.total")}</span>
            <span className="tabular-nums">
              {money(
                item.supplierCharges?.[chargeIndex] ? supplierChargeTotal(item, item.supplierCharges[chargeIndex]) : 0,
                currency
              )}
            </span>
          </div>
        </div>
      ))}
    </div>
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
  const t = useTranslations("orders")
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<AdjustmentRow[]>([])
  const types = [
    ...adjustmentTypes,
    ...adjustments.map((row) => row.description).filter((type) => !adjustmentTypes.some((known) => known === type))
  ].map((type) => ({ value: type, label: knownName(adjustmentKeys, type, t) }))
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
        {t.rich("builder.editCostSummary", { hidden: screenReaderOnly })}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("builder.editCostSummaryTitle")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {rows.length > 0 && (
              <div className="grid grid-cols-[minmax(0,1fr)_8rem_1.75rem] gap-2 text-muted-foreground">
                <span>{t("builder.adjustment")}</span>
                <span>{t("builder.amount")}</span>
              </div>
            )}
            {rows.map((row) => (
              <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_8rem_1.75rem] items-center gap-2">
                <Select
                  items={types}
                  value={row.type || null}
                  onValueChange={(type) => update(row.key, { type: type ?? "" })}
                >
                  <SelectTrigger aria-label={t("builder.adjustment")} className="w-full">
                    <SelectValue>
                      {(type: string | null) =>
                        type === null ? t("builder.select") : knownName(adjustmentKeys, type, t)
                      }
                    </SelectValue>
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
                    aria-label={t("builder.amount")}
                    value={row.amount}
                    onChange={(event) => update(row.key, { amount: event.target.value })}
                    className="tabular-nums"
                  />
                </InputGroup>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("builder.removeAdjustment")}
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
              {t("builder.addAdjustment")}
            </Button>
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>{t("actions.cancel")}</DialogClose>
            <Button type="button" disabled={!complete} onClick={save}>
              {t("builder.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// Whether each unit gets its SKU label. Amazon needs every unit labeled, so POs to Amazon keep it on.
function SkuLabel({ index, toAmazon }: { index: number; toAmazon: boolean }) {
  const t = useTranslations("orders.builder")
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
        <FieldLabel htmlFor={id}>{t("skuLabel")}</FieldLabel>
        {toAmazon && <FieldDescription>{t("amazonRequiresIt")}</FieldDescription>}
      </FieldContent>
    </Field>
  )
}

// When the goods are needed, which the purchase order's page and PDF show. A cleared date input reads "", which the
// order keeps as no date.
function RequiredBy() {
  const t = useTranslations("orders.detail")
  const id = useId()
  const {
    field: { ref, value, onChange, onBlur, name },
    fieldState
  } = useController<OrderInput, "dueDate">({ name: "dueDate" })
  return (
    <Field data-invalid={fieldState.invalid}>
      <FormLabel htmlFor={id} label={t("requiredBy")} />
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
