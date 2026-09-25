"use client"

import { money, type OrderItem } from "@repo/aisle"
import type { CatalogVariant } from "@repo/aisle/shopify"
import { Plus, Search, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Textarea } from "@/components/ui/textarea"
import { FormError, SubmitButton, perform } from "./actions"
import { EmptyState } from "./common"
import { SelectField, TextField } from "./form-fields"

type Product = CatalogVariant & { amazonAsin: string; fnsku: string }

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
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Product[]>([])
  const [items, setItems] = useState<OrderItem[]>([])
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  async function search() {
    setPending(true)
    setError("")
    try {
      const response = await fetch(`/api/catalog?q=${encodeURIComponent(query)}`)
      if (!response.ok) {
        throw new Error("Connect Shopify in Settings before searching your catalog")
      }
      setResults(await response.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed")
    } finally {
      setPending(false)
    }
  }

  function add(product: Product) {
    setItems([
      ...items,
      {
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
      }
    ])
    setResults([])
  }

  function update(id: string, field: string, value: string) {
    setItems(
      items.map((item) =>
        item.id === id
          ? {
              ...item,
              [field]: ["pieces", "piecesPerSet", "unitPrice"].includes(field)
                ? Math.round(Number(value) * (field === "unitPrice" ? 100 : 1))
                : value
            }
          : item
      )
    )
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError("")
    try {
      const data = new FormData(event.currentTarget)
      const result = await perform("order.create", { ...Object.fromEntries(data), items })
      if (result.redirect) {
        router.push(result.redirect)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create order")
    } finally {
      setPending(false)
    }
  }

  const pieces = items.reduce((n, i) => n + i.pieces, 0)
  const amount = items.reduce((n, i) => n + i.unitPrice * i.pieces, 0)

  return (
    <form className="flex flex-col gap-6" onSubmit={submit}>
      <Card>
        <CardHeader>
          <CardTitle>Order details</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <TextField label="PO reference" name="reference" placeholder="PO-037" required />
            <SelectField
              label="Supplier"
              id="supplierId"
              name="supplierId"
              required
              placeholder="Select supplier"
              options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
            />
            <SelectField label="Destination" id="destination" name="destination" options={destinations} />
            <TextField label="Required date" name="dueDate" type="date" required />
            <SelectField label="Currency" id="currency" name="currency" options={currencies} />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Products</CardTitle>
          <CardDescription>Search Shopify. Enter quantities and prices per individual piece.</CardDescription>
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
                  void search()
                }
              }}
            />
            <Button type="button" variant="outline" disabled={pending} onClick={search}>
              <Search data-icon="inline-start" />
              Search
            </Button>
          </div>

          {results.length > 0 && (
            <ItemGroup className="max-h-72 overflow-auto rounded-lg border p-1">
              {results.map((product) => (
                <Item
                  key={product.id}
                  size="sm"
                  render={
                    <button
                      type="button"
                      aria-label={`Add ${product.product.title} / ${product.title}`}
                      disabled={items.some((i) => i.variantId === product.id)}
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

          {items.length === 0 ? (
            <EmptyState
              title="No products yet"
              description="Search your Shopify catalog above to add products to this purchase order."
            />
          ) : (
            items.map((item) => (
              <Card key={item.id} size="sm" className="bg-muted/30">
                <CardHeader>
                  <CardTitle>{item.name}</CardTitle>
                  <CardDescription>
                    {item.variant} / {item.buyerSku}
                  </CardDescription>
                  <CardAction>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Remove ${item.name}`}
                      onClick={() => setItems(items.filter((i) => i.id !== item.id))}
                    >
                      <Trash2 />
                    </Button>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <FieldGroup className="grid gap-4 sm:grid-cols-3">
                    <TextField
                      label="Quantity (pieces)"
                      id={`${item.id}-pieces`}
                      type="number"
                      min={1}
                      step="1"
                      required
                      value={item.pieces}
                      onChange={(e) => update(item.id, "pieces", e.target.value)}
                    />
                    <TextField
                      label="Pieces per sellable unit"
                      id={`${item.id}-piecesPerSet`}
                      type="number"
                      min={1}
                      step="1"
                      required
                      value={item.piecesPerSet}
                      onChange={(e) => update(item.id, "piecesPerSet", e.target.value)}
                    />
                    <TextField
                      label="Unit price (per piece)"
                      id={`${item.id}-unitPrice`}
                      type="number"
                      min={0}
                      step="0.01"
                      required
                      value={item.unitPrice / 100}
                      onChange={(e) => update(item.id, "unitPrice", e.target.value)}
                    />
                    <TextField
                      label="Amazon ASIN"
                      id={`${item.id}-asin`}
                      required
                      value={item.asin}
                      onChange={(e) => update(item.id, "asin", e.target.value)}
                    />
                    <TextField
                      label="Amazon FNSKU"
                      id={`${item.id}-fnsku`}
                      required
                      value={item.fnsku}
                      onChange={(e) => update(item.id, "fnsku", e.target.value)}
                    />
                    <SelectField
                      label="Preparation"
                      id={`${item.id}-prep`}
                      value={item.prepCategory}
                      onChange={(e) => update(item.id, "prepCategory", e.target.value)}
                      options={prepCategories}
                    />
                    <Field className="sm:col-span-3">
                      <FieldLabel htmlFor={`${item.id}-instructions`}>Product instructions</FieldLabel>
                      <Textarea
                        id={`${item.id}-instructions`}
                        placeholder="Add handling, labeling, or preparation exceptions"
                        value={item.instructions}
                        onChange={(e) => update(item.id, "instructions", e.target.value)}
                      />
                    </Field>
                  </FieldGroup>
                </CardContent>
                <CardFooter className="justify-end text-sm text-muted-foreground">
                  {item.pieces / item.piecesPerSet} sellable units
                </CardFooter>
              </Card>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Field>
            <FieldLabel htmlFor="notes">Notes to supplier</FieldLabel>
            <Textarea
              id="notes"
              name="notes"
              placeholder="Payment terms, delivery requirements, or additional instructions"
            />
          </Field>
        </CardContent>
      </Card>

      <FormError message={error} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {items.length} products, {pieces} pieces, {money(amount)} before currency selection
        </p>
        <SubmitButton type="submit" pending={pending} disabled={!items.length}>
          Save purchase order
        </SubmitButton>
      </div>
    </form>
  )
}
