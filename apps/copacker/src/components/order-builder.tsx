"use client"

import { commonPaymentTerms, money, type OrderInput, orderInputSchema } from "@repo/aisle"
import { Plus, Search, Trash2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { FormProvider, useFieldArray, useWatch } from "react-hook-form"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { useActionForm } from "@/hooks/useActionForm"
import { type CatalogProduct, errorMessage, useLazyCatalogQuery } from "@/lib/api"
import { bundleQuote, type BundleQuoteStatus } from "@/lib/bundle-quote"
import { orderLine } from "@/lib/order-lines"
import { prepOptions } from "@/lib/prep"
import { FormError, SubmitButton } from "./actions"
import { EmptyState, WarningNote } from "./common"
import { FormInput, FormNumber, FormSelect, FormTextarea } from "./form-controls"
import * as styles from "./order-builder.css"
import { sx } from "@/styles/sprinkles.css"

const destinations = [
  { value: "amazon", label: "Amazon" },
  { value: "awd_us", label: "Amazon AWD USA" },
  { value: "warehouse", label: "Your location" },
  { value: "awd_china", label: "Amazon AWD China (planned)", disabled: true },
  { value: "fba", label: "Amazon FBA (draft only)" },
  { value: "forwarder", label: "Freight forwarder" }
]
const currencies = ["USD", "CNY", "EUR", "GBP", "CAD", "AUD"].map((value) => ({
  value,
  label: value
}))

function supplierMatchMessage(status: string) {
  switch (status) {
    case "not_in_supplier_catalog":
      return "Not in this supplier’s catalog. You can still order it; confirm the price and SKU."
    case "supplier_sku_missing":
      return "No supplier SKU. You can still order it; confirm the supplier’s code."
    case "currency_review":
      return "Supplier quote uses a different currency. Enter the agreed price."
    case "price_missing":
      return "Supplier price is unknown. Enter the agreed price."
    case "price_conversion_review":
      return "Supplier pack price cannot be converted exactly per piece. Enter the agreed price."
    default:
      return "Supplier catalog needs review. Confirm the SKU and price."
  }
}

export function OrderBuilder({
  suppliers,
  deliveries = [],
  forwarderAddresses = [],
  initialItems = [],
  initialDestination = "amazon",
  initialDeliveryId,
  initialSupplierId,
  needsBarcodeVariantIds = [],
  draft
}: {
  suppliers: Array<{ id: string; name: string }>
  // The buyer's delivery addresses, for POs sent to its own locations.
  deliveries?: Array<{ id: string; name: string }>
  // Where POs to freight forwarders can ship: each forwarder's addresses.
  forwarderAddresses?: Array<{ addressId: string; forwarderId: string; label: string }>
  // Lines added before the builder opens, such as a reorder from Products.
  initialItems?: ReturnType<typeof orderLine>[]
  initialDestination?: "amazon" | "awd_us" | "fba" | "warehouse"
  initialDeliveryId?: string
  // The supplier restock grouped these lines under.
  initialSupplierId?: string
  // Variations whose product needs an uploaded label, such as one with size measurements, that don't have one yet.
  // Other lines get their saved barcode or the standard FNSKU label.
  needsBarcodeVariantIds?: string[]
  // A draft PO being edited, saved as its next revision.
  draft?: { id: string; revision: number; data: OrderInput }
}) {
  const needsBarcode = new Set(needsBarcodeVariantIds)
  const [query, setQuery] = useState("")
  const [showResults, setShowResults] = useState(false)
  const [searchCatalog, catalog] = useLazyCatalogQuery()
  const { form, submit } = useActionForm({
    schema: orderInputSchema,
    action: draft ? "order.update" : "order.create",
    toPayload: draft ? (order) => ({ id: draft.id, revision: draft.revision, order }) : undefined,
    defaultValues: draft?.data ?? {
      reference: "",
      supplierId: initialSupplierId ?? "",
      destination: initialDestination,
      deliveryId: initialDeliveryId,
      dueDate: "",
      paymentTerms: "",
      currency: "USD",
      notes: "",
      adjustments: [],
      items: initialItems
    }
  })
  // Line items carry their own `id`, so the field array keys rows separately.
  const lineItems = useFieldArray({
    control: form.control,
    name: "items",
    keyName: "key"
  })
  const charges = useFieldArray({ control: form.control, name: "adjustments" })
  const adjustments = useWatch({ control: form.control, name: "adjustments" }) ?? []
  const items = useWatch({ control: form.control, name: "items" }) ?? []
  const currency = useWatch({ control: form.control, name: "currency" }) ?? "USD"
  const destination = useWatch({ control: form.control, name: "destination" })
  const deliveryId = useWatch({ control: form.control, name: "deliveryId" })
  // The address list depends on the destination, and a forwarder address names its forwarder, so both follow the
  // chosen destination and address.
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
  const [matches, setMatches] = useState<
    Array<{
      sku: string
      status: BundleQuoteStatus
      unitPriceMinor: number | null
      product: { title?: string } | null
    }>
  >([])
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
        return response.json() as Promise<typeof matches>
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
          return { sku: "", ...quote, product: null }
        })
        setMatches(perLine)
        perLine.forEach((result, index) => {
          const line = form.getValues(`items.${index}`)
          if (!line || result.status !== "matched" || result.unitPriceMinor === null) {
            return
          }
          const prior = lastDefaultedPrice.current[line.id]
          if (buyerEditedPrices.current.has(line.id) || (line.unitPrice !== 0 && line.unitPrice !== prior)) {
            return
          }
          form.setValue(`items.${index}.unitPrice`, result.unitPriceMinor, {
            shouldValidate: true
          })
          lastDefaultedPrice.current[line.id] = result.unitPriceMinor
        })
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

  function search() {
    setShowResults(true)
    void searchCatalog(query)
  }

  function add(product: CatalogProduct) {
    const line = orderLine(
      product,
      crypto.randomUUID(),
      { asin: product.amazonAsin, fnsku: product.fnsku, ...product.lineDefaults },
      form.getValues("currency")
    )
    lastDefaultedPrice.current[line.id] = line.unitPrice
    lineItems.append(line)
    setShowResults(false)
  }

  const pieces = items.reduce((n, i) => n + (i?.pieces || 0), 0)
  const subtotal = items.reduce((n, i) => n + (i?.unitPrice || 0) * (i?.pieces || 0), 0)
  const adjustmentTotal = adjustments.reduce((sum, charge) => sum + (charge?.amount || 0), 0)
  const amount = subtotal + adjustmentTotal
  const results = showResults ? (catalog.data ?? []) : []

  return (
    <FormProvider {...form}>
      <form className={sx({ display: "flex", flexDirection: "column", gap: 6 })} onSubmit={submit} noValidate>
        <Card>
          <CardHeader>
            <CardTitle>Order details</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup className={styles.detailsGrid}>
              <FormInput name="reference" required label="PO reference" placeholder="PO-037" />
              <FormSelect
                name="supplierId"
                required
                label="Supplier"
                placeholder="Select supplier"
                options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
              />
              <FormSelect
                name="destination"
                required
                label="Destination"
                options={destinations}
                description={destination === "amazon" ? "The Amazon warehouse is chosen when you ship." : undefined}
              />
              {destination === "forwarder" && (
                <FormSelect
                  name="deliveryId"
                  required
                  label="Forwarder address"
                  placeholder={forwarderAddresses.length ? "Select an address" : "Add a forwarder address first"}
                  options={forwarderAddresses.map((row) => ({ value: row.addressId, label: row.label }))}
                />
              )}
              {destination === "warehouse" && (
                <FormSelect
                  name="deliveryId"
                  required
                  label="Delivery address"
                  placeholder={deliveries.length ? "Select delivery address" : "Add a delivery address in Settings"}
                  options={deliveries.map((delivery) => ({ value: delivery.id, label: delivery.name }))}
                />
              )}
              <FormInput name="dueDate" required label="Required date" type="date" />
              <FormSelect name="currency" required label="Currency" options={currencies} />
              <FormInput
                name="paymentTerms"
                label="Payment terms"
                list="payment-terms"
                placeholder="Choose or type terms"
                autoComplete="off"
              />
              <datalist id="payment-terms">
                {commonPaymentTerms.map((terms) => (
                  <option key={terms} value={terms} aria-label={terms} />
                ))}
              </datalist>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Products</CardTitle>
            <CardDescription>
              Search Shopify. Enter quantities and prices per individual piece. Amazon ASINs and FNSKUs are looked up
              from each product’s SKU. If Amazon isn’t connected yet, that happens when you send the PO.
            </CardDescription>
          </CardHeader>
          <CardContent className={sx({ display: "flex", flexDirection: "column", gap: 4 })}>
            <div className={sx({ display: "flex", gap: 2 })}>
              <Input
                aria-label="Search Shopify catalog"
                placeholder="Search by product name or SKU"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    search()
                  }
                }}
              />
              <SubmitButton type="button" variant="outline" pending={catalog.isFetching} onClick={search}>
                {!catalog.isFetching && <Search data-icon="inline-start" />}
                Search
              </SubmitButton>
            </div>

            {showResults && catalog.isError && (
              <FormError
                message={errorMessage(
                  catalog.error,
                  "Couldn't search your Shopify catalog. Check the Shopify connection in Settings and try again."
                )}
              />
            )}
            {showResults && catalog.isSuccess && !catalog.isFetching && results.length === 0 && (
              <p className={sx({ text: "sm", color: "muted" })}>No products match “{query}”.</p>
            )}

            {results.length > 0 && !catalog.isFetching && (
              <ItemGroup className={styles.results}>
                {results.map((product) => (
                  <Item
                    key={product.id}
                    size="sm"
                    render={
                      <button
                        type="button"
                        aria-label={`Add ${product.product.title} / ${product.title}`}
                        disabled={items.some((i) => i?.variantId === product.id)}
                        onClick={() => add(product)}
                      />
                    }
                    className={styles.result}
                  >
                    <ItemContent>
                      <ItemTitle>
                        {product.product.title} / {product.title}
                      </ItemTitle>
                      <ItemDescription>{product.sku}</ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <Plus className={sx({ size: 4 })} />
                    </ItemActions>
                  </Item>
                ))}
              </ItemGroup>
            )}

            {lineItems.fields.length === 0 ? (
              <EmptyState
                title="No products yet"
                description="Search your Shopify catalog above to add products to this purchase order."
              />
            ) : (
              lineItems.fields.map((line, index) => {
                const item = items[index]
                const lineError = form.formState.errors.items?.[index]
                const match = matches[index]
                return (
                  <Card key={line.key} size="sm" className={styles.lineCard}>
                    <CardHeader>
                      <CardTitle>{line.name}</CardTitle>
                      <CardDescription>
                        {line.variant} / {line.buyerSku}
                      </CardDescription>
                      <CardAction>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Remove ${line.name}`}
                          onClick={() => lineItems.remove(index)}
                        >
                          <Trash2 />
                        </Button>
                      </CardAction>
                    </CardHeader>
                    <CardContent>
                      {needsBarcode.has(line.variantId) && (
                        <WarningNote className={sx({ marginBottom: 3 })}>
                          This product needs an uploaded label, such as one with its size measurements. Add it on the
                          Products page, or upload it on the PO after you save it.
                        </WarningNote>
                      )}
                      <FieldGroup className={styles.lineGrid}>
                        <FormNumber
                          name={`items.${index}.pieces`}
                          required
                          label="Quantity (pieces)"
                          min={line.piecesPerSet}
                          step={line.piecesPerSet}
                        />
                        <dl className={styles.identifiers}>
                          <dt className={sx({ fontWeight: "medium" })}>Sellable unit</dt>
                          <dd className={sx({ color: "muted" })}>
                            {line.piecesPerSet > 1 ? `Bundle of ${line.piecesPerSet} pieces in Shopify` : "1 piece"}
                          </dd>
                        </dl>
                        {!!item?.components?.length && (
                          <dl className={styles.identifiers}>
                            <dt className={sx({ fontWeight: "medium" })}>Supplier components</dt>
                            {item.components.map((component) => (
                              <dd key={component.variantId} className={sx({ color: "muted" })}>
                                {component.quantity} × {component.buyerSku || "Shopify component"} · Supplier SKU{" "}
                                {component.supplierSku || "missing"}
                              </dd>
                            ))}
                          </dl>
                        )}
                        <FormNumber
                          name={`items.${index}.unitPrice`}
                          required
                          label={`Unit price per piece (${currency})`}
                          min={0}
                          step={0.01}
                          scale={100}
                          onValueChange={() => buyerEditedPrices.current.add(line.id)}
                        />
                        {match?.status === "matched" && match.unitPriceMinor !== null && (
                          <p className={sx({ text: "sm", color: "muted" })}>
                            Supplier quote: {money(match.unitPriceMinor, currency)} per piece
                            {match.product?.title ? ` for ${match.product.title}` : ""}. Your PO price is editable.
                          </p>
                        )}
                        {match && match.status !== "matched" && (
                          <p className={sx({ text: "sm", color: "muted" })}>
                            {item?.components?.length
                              ? `Check the component SKUs and enter the agreed price per piece. ${supplierMatchMessage(match.status)}`
                              : supplierMatchMessage(match.status)}
                          </p>
                        )}
                        <FormSelect
                          name={`items.${index}.prepCategory`}
                          required
                          label="Preparation"
                          options={prepOptions}
                        />
                        <dl className={styles.identifiers}>
                          <dt className={sx({ fontWeight: "medium" })}>Amazon identifiers</dt>
                          <dd className={sx({ color: "muted" })}>
                            {line.asin ? `ASIN ${line.asin}` : "ASIN looked up from Amazon"}
                            {line.fnsku ? `, FNSKU ${line.fnsku}` : ", FNSKU looked up from Amazon"}
                          </dd>
                        </dl>
                        <FormTextarea
                          name={`items.${index}.instructions`}
                          label="Product instructions"
                          placeholder="Add handling, labeling, or preparation exceptions"
                          className={sx({ gridColumn: { sm: "span3" } })}
                        />
                      </FieldGroup>
                      <FormError message={lineError?.message ?? lineError?.root?.message} />
                    </CardContent>
                    <CardFooter
                      className={sx({
                        justifyContent: "flex-end",
                        text: "sm",
                        color: "muted"
                      })}
                    >
                      {item?.pieces && item?.piecesPerSet ? item.pieces / item.piecesPerSet : 0} sellable units
                    </CardFooter>
                  </Card>
                )
              })
            )}
            <FormError message={itemsError?.message ?? itemsError?.root?.message} />
            {matchError && <FormError message={matchError} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Charges and discounts</CardTitle>
            <CardDescription>
              Add packing, freight, duties or other charges. Enter discounts as negative amounts.
            </CardDescription>
          </CardHeader>
          <CardContent className={sx({ display: "flex", flexDirection: "column", gap: 4 })}>
            {charges.fields.map((charge, index) => (
              <FieldGroup key={charge.id} className={styles.lineGrid}>
                <FormInput
                  name={`adjustments.${index}.description`}
                  required
                  label={`Charge ${index + 1} description`}
                  placeholder="Packing"
                />
                <FormNumber
                  name={`adjustments.${index}.amount`}
                  required
                  label={`Charge ${index + 1} amount (${currency})`}
                  scale={100}
                  step={0.01}
                />
                <Button type="button" variant="outline" onClick={() => charges.remove(index)}>
                  Remove charge {index + 1}
                </Button>
              </FieldGroup>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={charges.fields.length >= 50}
              onClick={() => charges.append({ description: "", amount: 0 })}
            >
              Add charge or discount
            </Button>
            <FormError
              message={form.formState.errors.adjustments?.message ?? form.formState.errors.adjustments?.root?.message}
            />
            <output className={styles.totals}>
              <dl>
                <dt>Products</dt>
                <dd>{money(subtotal, currency)}</dd>
                <dt>Charges and discounts</dt>
                <dd>{money(adjustmentTotal, currency)}</dd>
                <dt className={styles.grandTotal}>PO total</dt>
                <dd className={styles.grandTotal}>{money(amount, currency)}</dd>
              </dl>
            </output>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <FormTextarea
              name="notes"
              label="Notes to supplier"
              placeholder="Payment terms, delivery requirements, or additional instructions"
            />
          </CardContent>
        </Card>

        <FormError message={form.formState.errors.root?.server?.message} />
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
            {lineItems.fields.length} products, {pieces} pieces, {money(amount, currency)}
          </p>
          <SubmitButton type="submit" pending={form.formState.isSubmitting} disabled={!lineItems.fields.length}>
            {draft ? "Save changes" : "Save purchase order"}
          </SubmitButton>
        </div>
      </form>
    </FormProvider>
  )
}
