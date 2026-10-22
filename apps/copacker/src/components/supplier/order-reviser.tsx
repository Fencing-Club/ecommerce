import { commonPaymentTerms } from "@repo/copacker-shipments"
import { Link, useRouter } from "@tanstack/react-router"
import { CircleAlert, Plus, Search, Undo2, X } from "lucide-react"
import { useState } from "react"
import { useTranslations } from "use-intl"
import { PageHeader, StatusBadge } from "@/components/common"
import { DateInput } from "@/components/form-controls"
import { SelectControl } from "@/components/form-select"
import { MoneyInput } from "@/components/money-input"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Textarea } from "@/components/ui/textarea"
import { useErrorMessage } from "@/hooks/use-error-text"
import { useMoney } from "@/hooks/use-money"
import { useProposeChangesMutation } from "@/lib/supplier-api"
import { cn } from "@/lib/utils"
import type { LineChange } from "./proposal-panel"
import { ChangeBadge } from "./proposal-panel"
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

// How a line differs from the purchase order: added, removed, or a new quantity or price.
function lineChange(line: Line): LineChange | null {
  if (line.removed) {
    return "removed"
  }
  if (!line.original) {
    return "added"
  }
  return line.pieces !== line.original.pieces || line.unitPrice !== line.original.unitPrice ? "changed" : null
}

// A supplier's edit of a sent purchase order, laid out like Shopify's order edit: the products with their quantities
// and prices, products to add, and the terms, ready date and a note beside them. Anything but the ready date goes to
// the customer for approval, as the server decides too; the ready date alone saves straight away.
export function OrderReviser({
  orderId,
  revision,
  reference,
  customer,
  currency,
  items,
  subtotal: before,
  current,
  terms,
  proposalPending,
  products
}: {
  orderId: string
  revision: number
  reference: string
  // The buyer's name.
  customer: string
  currency: string
  items: Array<Omit<Line, "key" | "removed"> & { removed?: boolean }>
  // The products' total on the purchase order now.
  subtotal: number
  // The purchase order's terms now, which the changes are measured against.
  current: { paymentTerms: string; readyDate: string | null }
  // Where the edit starts: a pending proposal's terms and note, or the purchase order's own.
  terms: { paymentTerms: string; readyDate: string | null; note: string }
  // Whether the edit starts from changes the customer hasn't answered yet, which sending replaces.
  proposalPending: boolean
  products: ReviserProduct[]
}) {
  const router = useRouter()
  const t = useTranslations("supplier.orderReviser")
  const shared = useTranslations("supplier.shared")
  const money = useMoney()
  const errorMessage = useErrorMessage()
  const [proposeChanges] = useProposeChangesMutation()
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
    setLines((rows) => rows.map((line) => (line.key === key ? { ...line, ...next } : line)))
  // Products, quantities, prices and payment terms need the customer's approval.
  const commercial = lines.some((line) => lineChange(line) !== null) || paymentTerms !== current.paymentTerms
  const readyChanged = (readyDate || null) !== current.readyDate
  const termOptions = [...new Set(["", current.paymentTerms, terms.paymentTerms, ...commonPaymentTerms])].map(
    (value) => ({ value, label: value || shared("none") })
  )
  // The primary button says what happens: changes for approval are sent, a ready date alone is saved.
  const action = commercial
    ? { idle: t("sendForApproval"), busy: t("sending") }
    : { idle: t("save"), busy: t("saving") }

  async function send() {
    const problem = !kept.length
      ? t("keepOne")
      : kept.find((line) => !line.pieces || line.pieces % line.piecesPerSet !== 0)
    if (problem) {
      setError(
        typeof problem === "string" ? problem : t("multiples", { name: problem.name, count: problem.piecesPerSet })
      )
      return
    }
    if (!commercial && !readyChanged) {
      setError(t("noChanges"))
      return
    }
    setPending(true)
    setError("")
    try {
      await proposeChanges({
        orderId,
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
      }).unwrap()
      await router.invalidate()
      await router.navigate({ href: `/orders/${orderId}` })
    } catch (caught) {
      setError(errorMessage(caught, t("sendFailed")))
      setPending(false)
    }
  }

  return (
    <>
      <PageHeader
        parents={[
          { label: t("orders"), href: "/orders" },
          { label: reference, href: `/orders/${orderId}` }
        ]}
        title={t("editOrder")}
        badge={proposalPending ? <StatusBadge tone="info">{t("awaitingApproval")}</StatusBadge> : undefined}
      >
        <Button variant="outline" nativeButton={false} render={<Link to="/orders/$id" params={{ id: orderId }} />}>
          {shared("cancel")}
        </Button>
        <Button disabled={pending} onClick={() => void send()}>
          {pending ? action.busy : action.idle}
        </Button>
      </PageHeader>

      {error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="@container gap-0 py-0">
          <CardHeader className="border-b pt-4">
            <CardTitle>{t("products")}</CardTitle>
            <CardAction>
              <Button
                size="sm"
                variant="outline"
                className="-my-1"
                onClick={() => setAdding(true)}
                disabled={!products.length}
              >
                <Plus data-icon="inline-start" />
                {t("addProducts")}
              </Button>
            </CardAction>
          </CardHeader>
          {/* The columns' names, as a table's header band, once each line fits on one line. */}
          <div
            aria-hidden
            className="hidden h-10 items-center gap-3 border-b bg-muted px-4 text-sm font-medium @min-[40rem]:flex"
          >
            <span className="flex-1">{t("columns.product")}</span>
            <span className="w-24 text-end">{t("columns.quantity")}</span>
            <span className="w-32 text-end">{t("columns.unitPrice")}</span>
            <span className="w-24 text-end">{t("columns.total")}</span>
            <span className="w-7" />
          </div>
          <ul className="divide-y">
            {lines.map((line) => {
              const mark = lineChange(line)
              return (
                <li
                  key={line.key}
                  className={cn(
                    "flex flex-wrap items-center gap-3 px-4 py-3 @min-[40rem]:flex-nowrap",
                    line.removed && "bg-muted/30"
                  )}
                >
                  <div className="min-w-48 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className={cn("font-medium", line.removed && "text-muted-foreground line-through")}>
                        {line.name}
                      </p>
                      {mark && <ChangeBadge change={mark} />}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {[line.variant, line.supplierSku].filter(Boolean).join(", ")}
                    </p>
                  </div>
                  {!line.removed && (
                    <>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={line.piecesPerSet}
                        step={line.piecesPerSet}
                        value={line.pieces || ""}
                        aria-label={t("quantityOf", { name: named(line) })}
                        className="w-24 text-end tabular-nums"
                        onChange={(event) =>
                          change(line.key, { pieces: Math.max(0, Math.trunc(Number(event.target.value) || 0)) })
                        }
                      />
                      <MoneyInput
                        value={line.unitPrice}
                        onValueChange={(value) => change(line.key, { unitPrice: value ?? 0 })}
                        currency={currency}
                        label={t("unitPriceOf", { name: named(line) })}
                        className="w-32"
                      />
                      <span className="w-24 text-end font-medium tabular-nums">
                        {money(line.pieces * line.unitPrice, currency)}
                      </span>
                    </>
                  )}
                  {line.original ? (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={
                        line.removed ? t("restore", { name: named(line) }) : t("remove", { name: named(line) })
                      }
                      onClick={() => change(line.key, { removed: !line.removed })}
                    >
                      {line.removed ? <Undo2 /> : <X />}
                    </Button>
                  ) : (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t("remove", { name: named(line) })}
                      onClick={() => setLines((rows) => rows.filter((other) => other.key !== line.key))}
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
              <CardTitle>{t("summary")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("productsNow")}</span>
                <span className="tabular-nums">{money(before, currency)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>{t("afterChanges")}</span>
                <span className="tabular-nums">{money(after, currency)}</span>
              </div>
              {after !== before && (
                <div className="flex justify-between text-muted-foreground">
                  <span>{t("difference")}</span>
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
              <CardTitle>{t("details")}</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel htmlFor="revise-terms">{t("paymentTerms")}</FieldLabel>
                  <SelectControl
                    id="revise-terms"
                    options={termOptions}
                    value={paymentTerms}
                    onValueChange={(value) => setPaymentTerms(value ?? "")}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="revise-ready">{t("readyDate")}</FieldLabel>
                  <DateInput
                    id="revise-ready"
                    value={readyDate}
                    onChange={(event) => setReadyDate(event.target.value)}
                  />
                  <FieldDescription>{t("readyHint")}</FieldDescription>
                </Field>
                {/* The note goes with changes for approval; a new ready date alone saves without one. */}
                {commercial && (
                  <Field>
                    <FieldLabel htmlFor="revise-note">{t("noteTo", { customer })}</FieldLabel>
                    <Textarea
                      id="revise-note"
                      value={note}
                      placeholder={t("notePlaceholder")}
                      onChange={(event) => setNote(event.target.value)}
                    />
                  </Field>
                )}
              </FieldGroup>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("addProducts")}</DialogTitle>
            <DialogDescription>{t("atPrices", { customer })}</DialogDescription>
          </DialogHeader>
          <InputGroup>
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              value={query}
              placeholder={t("search")}
              aria-label={t("searchLabel")}
              onChange={(event) => setQuery(event.target.value)}
            />
          </InputGroup>
          <ul className="-mx-2 max-h-80 overflow-y-auto">
            {available.slice(0, 100).map((product) => (
              <li key={product.supplierSku}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-start hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  onClick={() => {
                    setLines((rows) => [
                      ...rows,
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
                    {product.unitPrice === null
                      ? shared("noPrice")
                      : t("perPiece", { price: money(product.unitPrice, currency) })}
                  </span>
                </button>
              </li>
            ))}
            {!available.length && (
              <li className="px-2 py-6 text-center text-sm text-muted-foreground">{t("noneFound")}</li>
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}
