"use client"

import { money, orderInputSchema } from "@repo/aisle"
import { Plus, Search, Trash2 } from "lucide-react"
import { useState } from "react"
import { FormProvider, useFieldArray, useWatch } from "react-hook-form"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { useActionForm } from "@/hooks/useActionForm"
import { type CatalogProduct, errorMessage, useLazyCatalogQuery } from "@/lib/api"
import { FormError, SubmitButton } from "./actions"
import { EmptyState } from "./common"
import { FormInput, FormNumber, FormSelect, FormTextarea } from "./form-controls"

const destinations = [
  { value: "awd_us", label: "Amazon AWD USA" },
  { value: "awd_cn", label: "Amazon AWD China (planned)", disabled: true },
  { value: "fba", label: "Amazon FBA (planned)", disabled: true },
  { value: "forwarder", label: "Freight forwarder (planned)", disabled: true }
]
const currencies = ["USD", "CNY", "EUR", "GBP", "CAD", "AUD"].map((value) => ({ value, label: value }))
const prepCategories = [
  { value: "POLYBAGGING", label: "Sealed polybag (default)" },
  { value: "NO_PREP", label: "No preparation (exception)" },
  { value: "BUBBLEWRAPPING", label: "Bubble wrapping" },
  { value: "TAPING", label: "Taping" }
]

export function OrderBuilder({ suppliers }: { suppliers: Array<{ id: string; name: string }> }) {
  const [query, setQuery] = useState("")
  const [showResults, setShowResults] = useState(false)
  const [searchCatalog, catalog] = useLazyCatalogQuery()
  const { form, submit } = useActionForm({
    schema: orderInputSchema,
    action: "order.create",
    defaultValues: {
      reference: "",
      supplierId: "",
      destination: "awd_us",
      dueDate: "",
      currency: "USD",
      notes: "",
      items: []
    }
  })
  // Line items carry their own `id`, so the field array keys rows separately.
  const lineItems = useFieldArray({ control: form.control, name: "items", keyName: "key" })
  const items = useWatch({ control: form.control, name: "items" }) ?? []
  const currency = useWatch({ control: form.control, name: "currency" }) ?? "USD"
  const itemsError = form.formState.errors.items

  function search() {
    setShowResults(true)
    void searchCatalog(query)
  }

  function add(product: CatalogProduct) {
    lineItems.append({
      id: crypto.randomUUID(),
      variantId: product.id,
      inventoryItemId: product.inventoryItem.id,
      name: product.product.title,
      variant: product.title,
      buyerSku: product.sku ?? "",
      supplierSku: product.supplierSku?.value ?? "",
      asin: product.amazonAsin || product.asin?.value || "",
      fnsku: product.fnsku,
      pieces: 1,
      piecesPerSet: 1,
      unitPrice: 0,
      instructions: "",
      prepCategory: "POLYBAGGING"
    })
    setShowResults(false)
  }

  const pieces = items.reduce((n, i) => n + (i?.pieces || 0), 0)
  const amount = items.reduce((n, i) => n + (i?.unitPrice || 0) * (i?.pieces || 0), 0)
  const results = showResults ? (catalog.data ?? []) : []

  return (
    <FormProvider {...form}>
      <form className="flex flex-col gap-6" onSubmit={submit} noValidate>
        <Card>
          <CardHeader>
            <CardTitle>Order details</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <FormInput name="reference" label="PO reference" placeholder="PO-037" />
              <FormSelect
                name="supplierId"
                label="Supplier"
                placeholder="Select supplier"
                options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
              />
              <FormSelect name="destination" label="Destination" options={destinations} />
              <FormInput name="dueDate" label="Required date" type="date" />
              <FormSelect name="currency" label="Currency" options={currencies} />
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Products</CardTitle>
            <CardDescription>
              Search Shopify. Enter quantities and prices per individual piece. Amazon ASINs and FNSKUs are looked up
              from each product’s SKU when you save.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex gap-2">
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
              <p className="text-sm text-muted-foreground">No products match “{query}”.</p>
            )}

            {results.length > 0 && !catalog.isFetching && (
              <ItemGroup className="max-h-72 overflow-auto rounded-lg border p-1">
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
                    className="w-full text-left hover:bg-muted disabled:opacity-50"
                  >
                    <ItemContent>
                      <ItemTitle>
                        {product.product.title} / {product.title}
                      </ItemTitle>
                      <ItemDescription>{product.sku}</ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <Plus className="size-4" />
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
                return (
                  <Card key={line.key} size="sm" className="bg-muted/30">
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
                      <FieldGroup className="grid gap-4 sm:grid-cols-3">
                        <FormNumber name={`items.${index}.pieces`} label="Quantity (pieces)" min={1} step={1} />
                        <FormNumber
                          name={`items.${index}.piecesPerSet`}
                          label="Pieces per sellable unit"
                          min={1}
                          step={1}
                        />
                        <FormNumber
                          name={`items.${index}.unitPrice`}
                          label={`Unit price per piece (${currency})`}
                          min={0}
                          step={0.01}
                          scale={100}
                        />
                        <FormSelect name={`items.${index}.prepCategory`} label="Preparation" options={prepCategories} />
                        <dl className="grid content-start gap-1 text-sm sm:col-span-2">
                          <dt className="font-medium">Amazon identifiers</dt>
                          <dd className="text-muted-foreground">
                            {line.asin ? `ASIN ${line.asin}` : "ASIN looked up on save"}
                            {line.fnsku ? `, FNSKU ${line.fnsku}` : ", FNSKU looked up on save"}
                          </dd>
                        </dl>
                        <FormTextarea
                          name={`items.${index}.instructions`}
                          label="Product instructions"
                          placeholder="Add handling, labeling, or preparation exceptions"
                          className="sm:col-span-3"
                        />
                      </FieldGroup>
                      <FormError message={lineError?.message ?? lineError?.root?.message} />
                    </CardContent>
                    <CardFooter className="justify-end text-sm text-muted-foreground">
                      {item?.pieces && item?.piecesPerSet ? item.pieces / item.piecesPerSet : 0} sellable units
                    </CardFooter>
                  </Card>
                )
              })
            )}
            <FormError message={itemsError?.message ?? itemsError?.root?.message} />
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
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {lineItems.fields.length} products, {pieces} pieces, {money(amount, currency)}
          </p>
          <SubmitButton type="submit" pending={form.formState.isSubmitting} disabled={!lineItems.fields.length}>
            Save purchase order
          </SubmitButton>
        </div>
      </form>
    </FormProvider>
  )
}
