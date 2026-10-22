import { useSelection } from "@mantine/hooks"
import { skipToken } from "@reduxjs/toolkit/query"
import {
  commonPaymentTerms,
  type Destination,
  orderCharges,
  orderCurrencies,
  type OrderInput,
  type OrderItem,
  orderLine,
  orderSubtotal,
  orderTotal,
  orderUnits,
  shipmentGroups
} from "@repo/copacker-orders"
import {
  amazonNetworks,
  isAmazonNetwork,
  orderDestination,
  type ReceiverId,
  receiverFor,
  receivers
} from "@repo/copacker-packing-rules"
import { amazonNetworkNames } from "@repo/copacker-shipments"
import { Link, useRouter } from "@tanstack/react-router"
import { useEffect, useEffectEvent, useId, useRef } from "react"
import { FormProvider, useFieldArray, useWatch } from "react-hook-form"
import { useTranslations } from "use-intl"
import { PageHeader } from "@/components/common"
import { CostSummaryCard } from "@/components/cost-summary-card"
import { CostSummaryDialog } from "@/components/cost-summary-dialog"
import { FormError, FormServerError, SubmitButton } from "@/components/form-feedback"
import { OrderLineRow } from "@/components/order-line-row"
import { type ForwarderAddress, RouteCard } from "@/components/route-card"
import { ShipmentGroupCard } from "@/components/shipment-group-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldGroup } from "@/components/ui/field"
import { Separator } from "@/components/ui/separator"
import { useActionForm } from "@/hooks/use-action-form"
import { useErrorMessage } from "@/hooks/use-error-text"
import { type CatalogProduct, type SupplierCatalogMatch, useSupplierCatalogMatchQuery } from "@/lib/api"
import { orderFormSchema } from "@/lib/order-form"
import { knownName, paymentTermKeys } from "@/lib/order-lines"
import { type LineQuote, lineQuotes, lineSkus, quotedPrice } from "@/lib/order-quotes"
import { AddProductsDialog, type StockAt } from "./add-products-dialog"
import { DateInput, FormField, FormInput, FormTextarea, useFormField } from "./form-controls"
import { FormSelect } from "./form-select"

type Line = OrderItem

// Which of Amazon's networks a line goes to, when the PO ships to Amazon.
const networkOptions = amazonNetworks.map((value) => ({ value, label: amazonNetworkNames[value] }))

// A line's receiver where its PO goes: lines added before the builder opens, such as a reorder from Restock, start at
// their product's Amazon network.
const receiverIn = (destination: Destination, line: Line) =>
  receivers[line.receiver].group === destination ? line : { ...line, receiver: receiverFor(destination) }

// A PO's editor, laid out like Shopify's: the route from the supplier to where the goods go, a table of products
// edited in place for each shipment they become, with more per line in its menu, and the PO's details and totals
// beside it. Each line's price starts at Shopify's unit cost, or the supplier's quote for its quantity once the
// supplier's catalog answers, until the buyer types their own.
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
  forwarderAddresses?: ForwarderAddress[]
  // Lines added before the builder opens, such as a reorder from Restock.
  initialItems?: Line[]
  initialDestination?: Destination
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
  const errorMessage = useErrorMessage()
  const needsBarcode = new Set(needsBarcodeVariantIds)
  const router = useRouter()
  // The header's Save sits outside the form, which the header row must precede, and submits it by this id.
  const formId = useId()
  const startDestination = draft ? orderDestination(draft.data) : initialDestination
  const startItems = draft?.data.items ?? initialItems
  // A delivery address is one of the buyer's locations, so it only goes with a PO there.
  const startDelivery = draft ? draft.data.deliveryId : initialDeliveryId
  const deliveryId =
    startDestination === "warehouse" && deliveries.some((row) => row.id === startDelivery) ? startDelivery : undefined
  const { form, submit } = useActionForm({
    schema: orderFormSchema,
    action: draft ? "order.update" : "order.create",
    toPayload: ({ destination: _, ...order }) => (draft ? { id: draft.id, revision: draft.revision, order } : order),
    // Saving an edit goes back to the PO.
    onSuccess: draft ? () => router.navigate({ href: `/orders/${draft.id}` }) : undefined,
    defaultValues: draft
      ? { ...draft.data, destination: startDestination, deliveryId }
      : {
          reference: "",
          supplierId: initialSupplierId ?? "",
          destination: startDestination,
          deliveryId,
          paymentTerms: "Payment in advance",
          currency: "USD",
          notes: "",
          adjustments: [],
          items: initialItems.map((line) => receiverIn(startDestination, line))
        }
  })
  // Line items carry their own `id`, so the field array keys rows separately.
  const lineItems = useFieldArray({ control: form.control, name: "items", keyName: "key" })
  const charges = useFieldArray({ control: form.control, name: "adjustments" })
  const adjustments = useWatch({ control: form.control, name: "adjustments" }) ?? []
  const items = useWatch({ control: form.control, name: "items" })
  const currency = useWatch({ control: form.control, name: "currency" })
  const destination = useWatch({ control: form.control, name: "destination" })
  const supplierId = useWatch({ control: form.control, name: "supplierId" })
  const watchedDelivery = useWatch({ control: form.control, name: "deliveryId" })
  const toAmazon = destination === "amazon"

  // Each line's last receiver in each group, so a line moved back to Amazon returns to FBA or AWD as it was.
  const earlierReceivers = useRef(
    new Map(startItems.map((item) => [`${item.id}:${receivers[item.receiver].group}`, item.receiver]))
  )
  // Lines go where the PO goes: a new destination moves each line to a receiver there. A delivery address is one of the
  // buyer's locations, so another destination clears it; a stop on the way suits either and stays.
  function moveLinesTo(next: Destination) {
    form.getValues("items").forEach((item, index) => {
      const group = receivers[item.receiver].group
      earlierReceivers.current.set(`${item.id}:${group}`, item.receiver)
      if (group !== next) {
        const earlier = earlierReceivers.current.get(`${item.id}:${next}`)
        form.setValue(`items.${index}.receiver`, receiverFor(next, earlier), { shouldDirty: true })
      }
    })
    if (next !== "warehouse") {
      form.setValue("deliveryId", undefined)
    }
  }

  const lineIds = lineItems.fields.map((line) => line.id)
  const [selection, selecting] = useSelection({ data: lineIds })
  const selected = new Set(selection)
  const selectedCount = lineIds.filter((id) => selected.has(id)).length
  function selectLines(ids: string[], on: boolean) {
    for (const id of ids) {
      if (on) {
        selecting.select(id)
      } else {
        selecting.deselect(id)
      }
    }
  }
  function moveSelected(network: ReceiverId) {
    lineItems.fields.forEach((line, index) => {
      if (selected.has(line.id)) {
        form.setValue(`items.${index}.receiver`, network, { shouldDirty: true, shouldValidate: true })
      }
    })
    selecting.resetSelection()
  }

  // The supplier's catalog quotes each line, asked again whenever the supplier, currency or a supplier SKU changes.
  const supplierSkus = items.flatMap((item) => lineSkus(item))
  const lookup = useSupplierCatalogMatchQuery(
    supplierId && supplierSkus.length ? { supplierId, currency, supplierSkus } : skipToken
  )
  const matches = lookup.currentData
  const quotes = matches ? lineQuotes(items, matches) : []
  // Prices filled in for the buyer, from Shopify's unit cost or a supplier quote, which a newer quote may replace.
  const lastDefaultedPrice = useRef(new Map(initialItems.map((item) => [item.id, item.unitPrice])))
  const buyerEditedPrices = useRef(new Set<string>())

  // Fills in the supplier's price for a line unless the buyer set their own.
  function defaultPrice(index: number, quote: LineQuote) {
    const line = form.getValues(`items.${index}`)
    const price = line && quote.status === "matched" ? quotedPrice(quote, line.pieces) : null
    if (!line || price === null) {
      return
    }
    const prior = lastDefaultedPrice.current.get(line.id)
    if (
      buyerEditedPrices.current.has(line.id) ||
      (line.unitPrice !== 0 && line.unitPrice !== prior) ||
      price === prior
    ) {
      return
    }
    form.setValue(`items.${index}.unitPrice`, price, { shouldValidate: true })
    lastDefaultedPrice.current.set(line.id, price)
  }
  // The catalog's answer prices each line it quotes.
  const priceLines = useEffectEvent((found: SupplierCatalogMatch[]) => {
    lineQuotes(form.getValues("items"), found).forEach((quote, index) => {
      if (quote) {
        defaultPrice(index, quote)
      }
    })
  })
  useEffect(() => {
    if (matches) {
      priceLines(matches)
    }
  }, [matches])
  // A quantity reaching or leaving a volume break moves the line to that break's price.
  function piecesChanged(index: number) {
    const quote = quotes[index]
    if (quote && quote.tiers.length > 1) {
      defaultPrice(index, quote)
    }
  }

  function add(products: CatalogProduct[]) {
    for (const product of products) {
      if (form.getValues("items").some((item) => item.variantId === product.id)) {
        continue
      }
      const line = orderLine(
        product,
        crypto.randomUUID(),
        { asin: product.amazonAsin, fnsku: product.fnsku, ...product.lineDefaults },
        form.getValues("currency"),
        form.getValues("destination")
      )
      lastDefaultedPrice.current.set(line.id, line.unitPrice)
      lineItems.append(line)
    }
  }

  const stockAt = stockAtDestination(
    destination,
    deliveries.find((row) => row.id === watchedDelivery)?.shopifyLocationId
  )
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
  const groups = shipmentGroups(
    lineItems.fields.map((line, index) => {
      // A line just added is watched from the next render, so it shows as it was added until then, which lets the
      // field array focus it.
      const item = items[index] ?? line
      return { line, index, item, receiver: item.receiver }
    })
  )
  const itemsError = form.formState.errors.items

  return (
    <FormProvider {...form}>
      <PageHeader title={title} parents={parents}>
        <Button
          variant="outline"
          render={<Link to="." href={draft ? `/orders/${draft.id}` : "/orders"} />}
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
        <FormServerError />

        <div className="grid grid-cols-1 items-start gap-4 @min-[72rem]:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex min-w-0 flex-col gap-4">
            <RouteCard
              suppliers={suppliers}
              deliveries={deliveries}
              forwarderAddresses={forwarderAddresses}
              onDestinationChange={moveLinesTo}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">{tb("shipments")}</h2>
              {toAmazon && <p className="text-sm text-muted-foreground">{tb("groupingHint")}</p>}
            </div>
            {toAmazon && selectedCount > 0 && (
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
                <Button type="button" variant="ghost" size="sm" onClick={() => selecting.resetSelection()}>
                  {tb("clearSelection")}
                </Button>
              </div>
            )}
            {groups.map((group) => {
              const groupItems = group.lines.map(({ item }) => item)
              const label = isAmazonNetwork(group.receiver)
                ? amazonNetworkNames[group.receiver]
                : tb("destinations.warehouse")
              const ids = group.lines.map(({ line }) => line.id)
              const groupSelected = ids.filter((id) => selected.has(id)).length
              return (
                <ShipmentGroupCard
                  key={group.receiver}
                  title={label}
                  heading="h3"
                  lines={group.lines.length}
                  pieces={orderUnits(groupItems)}
                  total={orderTotal({ items: groupItems })}
                  currency={currency}
                  select={
                    toAmazon && (
                      <Checkbox
                        aria-label={tb("selectShipment", { destination: label })}
                        checked={groupSelected === ids.length}
                        indeterminate={groupSelected > 0 && groupSelected < ids.length}
                        onCheckedChange={(checked) => selectLines(ids, checked)}
                      />
                    )
                  }
                >
                  <div className="relative overflow-x-auto">
                    <table className="w-full min-w-3xl text-sm">
                      <thead className="bg-muted">
                        <tr>
                          {toAmazon && (
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
                        {group.lines.map(({ line, index, item }) => {
                          const lineError = form.formState.errors.items?.[index]
                          return (
                            <OrderLineRow
                              key={line.key}
                              index={index}
                              item={item}
                              quote={quotes[index]}
                              currency={currency}
                              orderId={draft?.id}
                              toAmazon={toAmazon}
                              needsLabel={needsBarcode.has(item.variantId)}
                              error={lineError?.message ?? lineError?.root?.message}
                              select={
                                toAmazon
                                  ? {
                                      selected: selected.has(line.id),
                                      onSelectedChange: (on) => selectLines([line.id], on)
                                    }
                                  : undefined
                              }
                              onPiecesChange={() => piecesChanged(index)}
                              onPriceChange={() => buyerEditedPrices.current.add(line.id)}
                              onRemove={() => lineItems.remove(index)}
                            />
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </ShipmentGroupCard>
              )
            })}
            {!lineItems.fields.length && (
              <Card>
                <CardContent className="text-center text-sm text-muted-foreground">{tb("noProducts")}</CardContent>
              </Card>
            )}
            <div>
              <AddProductsDialog
                added={new Set(items.map((item) => item.variantId))}
                stockAt={{ ...stockAt, label: stockLabel[stockAt.label] }}
                onAdd={add}
              />
              <FormError message={itemsError?.message ?? itemsError?.root?.message} />
              {lookup.error && <FormError message={errorMessage(lookup.error, tb("catalogLookupFailed"))} />}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <CostSummaryCard
              lines={lineItems.fields.length}
              units={orderUnits(items)}
              subtotal={orderSubtotal(items)}
              charges={orderCharges({ items, adjustments })}
              total={orderTotal({ items, adjustments })}
              currency={currency}
              action={
                <CostSummaryDialog
                  currency={currency}
                  adjustments={adjustments}
                  onSave={(rows) => charges.replace(rows)}
                />
              }
            />

            <Card size="sm">
              <CardHeader>
                <CardTitle>{t("detail.purchaseOrderDetails")}</CardTitle>
              </CardHeader>
              <CardContent>
                <FieldGroup className="gap-4">
                  <FormInput name="reference" required label={tb("reference")} placeholder="PO-038" />
                  <RequiredBy />
                  <FormTextarea
                    name="notes"
                    label={t("detail.noteToSupplier")}
                    description={t("builder.markdownHint")}
                  />
                  <Separator />
                  <p className="font-medium">{tb("purchasingInformation")}</p>
                  <FormSelect name="paymentTerms" label={t("detail.paymentTerms")} options={termOptions} />
                  <FormSelect
                    name="currency"
                    required
                    label={tb("supplierCurrency")}
                    options={orderCurrencies.map((value) => ({ value, label: t(`currencies.${value}`) }))}
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
  destination: Destination | undefined,
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

// When the goods are needed, which the purchase order's page and PDF show. A cleared date input reads "", which the
// order keeps as no date.
function RequiredBy() {
  const t = useTranslations("orders.detail")
  const {
    field: { ref, value, onChange, onBlur, name },
    fieldProps,
    controlProps
  } = useFormField("dueDate")
  return (
    <FormField {...fieldProps} label={t("requiredBy")}>
      <DateInput
        {...controlProps}
        ref={ref}
        name={name}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value || undefined)}
        onBlur={onBlur}
      />
    </FormField>
  )
}
