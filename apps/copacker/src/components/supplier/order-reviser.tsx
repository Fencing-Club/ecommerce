"use client"

import { commonPaymentTerms, money } from "@repo/aisle"
import { ChevronRight, Plus, Search, Undo2, X } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { MoneyInput } from "./pricing-controls"
import { matches } from "./shared"

type Line = {
  key: string
  itemId?: string
  name: string
  variant: string
  supplierSku: string
  piecesPerSet: number
  pieces: number
  unitPrice: number
  removed: boolean
  original?: { pieces: number; unitPrice: number }
}
export type ReviserProduct = { supplierSku: string; title: string; unitPrice: number | null; minimumPieces: number }

// A supplier's edit of a sent PO, laid out like Shopify's order edit: the products with their quantities and prices,
// products to add, and the terms, ready date and a note beside them. Sending asks the customer to approve.
export function OrderReviser({
  orderId,
  revision,
  reference,
  currency,
  items,
  subtotal: before,
  terms,
  products
}: {
  orderId: string
  revision: number
  reference: string
  currency: string
  items: Array<Omit<Line, "key" | "removed"> & { removed?: boolean }>
  // The products' total on the PO now.
  subtotal: number
  terms: { paymentTerms: string; readyDate: string | null; note: string }
  products: ReviserProduct[]
}) {
  const router = useRouter()
  const [lines, setLines] = useState<Line[]>(() =>
    items.map((item) => ({ ...item, key: item.itemId ?? item.supplierSku, removed: item.removed ?? false }))
  )
  const [paymentTerms, setPaymentTerms] = useState(terms.paymentTerms)
  const [readyDate, setReadyDate] = useState(terms.readyDate ?? "")
  const [note, setNote] = useState(terms.note)
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  const kept = lines.filter((line) => !line.removed)
  const named = (line: Line) => (line.variant ? `${line.name}, ${line.variant}` : line.name)
  const after = kept.reduce((sum, line) => sum + line.pieces * line.unitPrice, 0)
  const available = products.filter(
    (product) =>
      !lines.some((line) => line.supplierSku === product.supplierSku) &&
      matches(query, product.title, product.supplierSku)
  )
  const change = (key: string, next: Partial<Line>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...next } : line)))
  const commercial =
    lines.some(
      (line) =>
        !line.original ||
        line.removed ||
        line.pieces !== line.original.pieces ||
        line.unitPrice !== line.original.unitPrice
    ) || paymentTerms !== terms.paymentTerms
  const termOptions = [...new Set(["", ...(paymentTerms ? [paymentTerms] : []), ...commonPaymentTerms])].map(
    (value) => ({
      value: value || "none",
      label: value || "None"
    })
  )

  async function send() {
    const problem = !kept.length
      ? "Keep at least one product"
      : kept.find((line) => !line.pieces || line.pieces % line.piecesPerSet !== 0)
    if (problem) {
      setError(typeof problem === "string" ? problem : `Order ${problem.name} in multiples of ${problem.piecesPerSet}`)
      return
    }
    setPending(true)
    setError("")
    try {
      const response = await fetch(`/api/orders/${orderId}/proposal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revision,
          proposal: {
            lines: kept.map((line) => ({
              itemId: line.itemId,
              supplierSku: line.supplierSku,
              title: line.name,
              pieces: line.pieces,
              unitPrice: line.unitPrice
            })),
            paymentTerms,
            readyDate: readyDate || null,
            note
          }
        })
      })
      if (!response.ok) {
        throw new Error((await response.json()).error ?? "Couldn't send the changes. Try again.")
      }
      router.push(`/orders/${orderId}`)
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't send the changes. Try again.")
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link href={`/orders/${orderId}`} className="text-sm text-muted-foreground hover:text-foreground">
            {reference}
          </Link>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <h1 className="text-xl font-semibold tracking-tight">Edit order</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" nativeButton={false} render={<Link href={`/orders/${orderId}`} />}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={() => void send()}>
            {commercial ? "Send for approval" : "Save"}
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-3">
            <CardTitle>Products</CardTitle>
            <CardAction>
              <Button size="sm" variant="outline" onClick={() => setAdding(true)} disabled={!products.length}>
                <Plus data-icon="inline-start" />
                Add products
              </Button>
            </CardAction>
          </CardHeader>
          <ul className="divide-y">
            {lines.map((line) => {
              const changed =
                !line.removed &&
                line.original &&
                (line.pieces !== line.original.pieces || line.unitPrice !== line.original.unitPrice)
              return (
                <li
                  key={line.key}
                  className={cn("flex flex-wrap items-center gap-3 px-4 py-3", line.removed && "bg-muted/30")}
                >
                  <div className="min-w-48 flex-1">
                    <p className={cn("font-medium", line.removed && "text-muted-foreground line-through")}>
                      {line.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[line.variant, line.supplierSku].filter(Boolean).join(", ")}
                    </p>
                    <div className="mt-1 flex gap-1">
                      {!line.original && <Badge variant="secondary">Added</Badge>}
                      {changed && <Badge variant="outline">Changed</Badge>}
                      {line.removed && <Badge variant="destructive">Removed</Badge>}
                    </div>
                  </div>
                  {!line.removed && (
                    <>
                      <Input
                        type="number"
                        min={line.piecesPerSet}
                        step={line.piecesPerSet}
                        value={line.pieces || ""}
                        aria-label={`Quantity of ${named(line)}`}
                        className="w-24 text-right tabular-nums"
                        onChange={(event) =>
                          change(line.key, { pieces: Math.max(0, Math.trunc(Number(event.target.value) || 0)) })
                        }
                      />
                      <MoneyInput
                        value={line.unitPrice}
                        onValueChange={(value) => change(line.key, { unitPrice: value ?? 0 })}
                        currency={currency}
                        label={`Unit price of ${named(line)}`}
                        className="w-32"
                      />
                      <span className="w-24 text-right font-medium tabular-nums">
                        {money(line.pieces * line.unitPrice, currency)}
                      </span>
                    </>
                  )}
                  {line.original ? (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={line.removed ? `Restore ${named(line)}` : `Remove ${named(line)}`}
                      onClick={() => change(line.key, { removed: !line.removed })}
                    >
                      {line.removed ? <Undo2 /> : <X />}
                    </Button>
                  ) : (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Remove ${named(line)}`}
                      onClick={() => setLines((current) => current.filter((other) => other.key !== line.key))}
                    >
                      <X />
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>

        <div className="flex flex-col gap-4">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Products now</span>
                <span className="tabular-nums">{money(before, currency)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>After your changes</span>
                <span className="tabular-nums">{money(after, currency)}</span>
              </div>
              {after !== before && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Difference</span>
                  <span className="tabular-nums">
                    {after > before ? "+" : "−"}
                    {money(Math.abs(after - before), currency)}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel htmlFor="revise-terms">Payment terms</FieldLabel>
                  <Select
                    items={termOptions}
                    value={paymentTerms || "none"}
                    onValueChange={(value) => setPaymentTerms(!value || value === "none" ? "" : value)}
                  >
                    <SelectTrigger id="revise-terms" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {termOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="revise-ready">Ready date</FieldLabel>
                  <Input
                    id="revise-ready"
                    type="date"
                    value={readyDate}
                    onChange={(event) => setReadyDate(event.target.value)}
                  />
                  <FieldDescription>
                    When the goods will be ready to ship. It updates without approval.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="revise-note">Note to customer</FieldLabel>
                  <Textarea
                    id="revise-note"
                    value={note}
                    placeholder="Why these changes"
                    onChange={(event) => setNote(event.target.value)}
                  />
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add products</DialogTitle>
            <DialogDescription>At this customer’s prices.</DialogDescription>
          </DialogHeader>
          <InputGroup>
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              value={query}
              placeholder="Search by product or SKU"
              aria-label="Search products"
              onChange={(event) => setQuery(event.target.value)}
            />
          </InputGroup>
          <ul className="-mx-2 max-h-80 overflow-y-auto">
            {available.slice(0, 100).map((product) => (
              <li key={product.supplierSku}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  onClick={() => {
                    setLines((current) => [
                      ...current,
                      {
                        key: product.supplierSku,
                        name: product.title,
                        variant: "",
                        supplierSku: product.supplierSku,
                        piecesPerSet: 1,
                        pieces: product.minimumPieces,
                        unitPrice: product.unitPrice ?? 0,
                        removed: false
                      }
                    ])
                    setAdding(false)
                    setQuery("")
                  }}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{product.title}</span>
                    <span className="block text-xs text-muted-foreground">{product.supplierSku}</span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums">
                    {product.unitPrice === null ? "No price" : `${money(product.unitPrice, currency)} / piece`}
                  </span>
                </button>
              </li>
            ))}
            {!available.length && (
              <li className="px-2 py-6 text-center text-sm text-muted-foreground">No products found.</li>
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  )
}
