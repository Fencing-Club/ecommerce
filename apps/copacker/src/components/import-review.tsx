"use client"

import { money } from "@repo/aisle"
import type { CatalogVariant } from "@repo/aisle/shopify"
import { Ellipsis, FileText, Plus, Search, Trash2, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { Fragment, useState } from "react"
import { arrayIncludes, objectKeys } from "ts-extras"
import { api, errorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import { priceInMinorUnits, type ImportProposal } from "@/server/import-proposal"
import { FormError, SubmitButton } from "./actions"
import { PageHeader, WarningNote } from "./common"
import { DateInput, FormLabel } from "./form-controls"
import { SelectField } from "./form-fields"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu"
import { Field, FieldGroup } from "./ui/field"
import { Input } from "./ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "./ui/input-group"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table"

const reviewApi = api.injectEndpoints({
  endpoints: (build) => ({
    importState: build.query<{ status: string; orderId: string | null }, string>({
      query: (id) => `imports/${id}`,
      keepUnusedDataFor: 0
    }),
    importCatalog: build.query<
      { results: CatalogVariant[]; nextCursor: string | null; complete: boolean },
      { id: string; q: string; cursor?: string }
    >({ query: ({ id, ...params }) => ({ url: `imports/${id}/catalog`, params }), keepUnusedDataFor: 0 }),
    correctImport: build.mutation<{ revision: number }, { id: string; revision: number; proposal: ImportProposal }>({
      query: ({ id, ...body }) => ({ url: `imports/${id}`, method: "PATCH", body })
    }),
    saveImport: build.mutation<
      { id: string; redirect: string },
      { id: string; revision: number; supplierId: string; reference: string; dueDate: string }
    >({
      query: ({ id, ...body }) => ({
        url: `imports/${id}/save`,
        method: "POST",
        body: { ...body, reviewed: true, destination: "amazon" }
      })
    })
  })
})

type Line = ImportProposal["items"][number]

// A catalog product as the review shows it: the product's title, the variant's, and its SKU.
export type ReviewProduct = { title: string; variant: string; sku: string | null }

function reviewProduct(variant: CatalogVariant): ReviewProduct {
  return { title: variant.product.title, variant: variant.title, sku: variant.sku }
}

// Shopify names a product's only variant "Default Title", which says nothing.
function variantName(product: ReviewProduct) {
  return product.variant === "Default Title" ? null : product.variant
}

// The currencies an import can be in, named as the purchase order editor names them.
const currencyNames: Record<NonNullable<ImportProposal["currency"]>, string> = {
  USD: "US Dollar (USD $)",
  CNY: "Chinese Yuan (CNY ¥)",
  EUR: "Euro (EUR €)",
  GBP: "British Pound (GBP £)",
  CAD: "Canadian Dollar (CAD $)",
  AUD: "Australian Dollar (AUD $)"
}
const currencies = objectKeys(currencyNames)

// The table's first and last columns line up with the card's header.
const edgeTable = "[&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4"

// Focuses the product search when it opens. Defined once, so React calls it only when the search mounts.
const focusOnMount = (input: HTMLInputElement | null) => input?.focus()

// Enter in a field would save the draft, which creates the purchase order, so only Save draft saves. Buttons still
// press, and the product search keeps Enter to search.
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

// A typed amount in minor units, or null while it isn't a whole nonnegative amount with at most two decimals.
function minorUnits(value: string | null) {
  if (value === null) {
    return null
  }
  try {
    return priceInMinorUnits(value)
  } catch {
    return null
  }
}

// The line as the document lists it, such as "SKU AB-1, 10 pairs at 1.20, page 2", leaving out what it doesn't say.
function sourceLine(line: Line) {
  const parts: string[] = line.sourceSku ? [`SKU ${line.sourceSku}`] : []
  const unit = line.sourceUnit ?? "units"
  if (line.sourceQuantity !== null) {
    parts.push(
      line.sourceUnitPrice === null
        ? `${line.sourceQuantity} ${unit}`
        : `${line.sourceQuantity} ${unit} at ${line.sourceUnitPrice}`
    )
  } else if (line.sourceUnitPrice !== null) {
    parts.push(`${line.sourceUnitPrice} each`)
  }
  if (line.sourcePage !== null) {
    parts.push(`page ${line.sourcePage}`)
  }
  return parts.join(", ")
}

// The products, the charges and their total, or null while a line or charge is incomplete: incomplete input is
// expected while reviewing, and a zero would be invented. `difference` is how far the total is from the document's.
function totalsOf(proposal: ImportProposal) {
  let products = 0
  for (const item of proposal.items) {
    const price = minorUnits(item.pricePerPiece)
    if (item.pieces === null || price === null) {
      return null
    }
    products += item.pieces * price
  }
  let adjustments = 0
  for (const charge of proposal.adjustments) {
    const negative = charge.amount?.startsWith("-") ?? false
    const value = minorUnits(negative && charge.amount ? charge.amount.slice(1) : charge.amount)
    if (value === null) {
      return null
    }
    adjustments += negative ? -value : value
  }
  const documentTotal = minorUnits(proposal.documentTotal)
  const total = products + adjustments
  return { products, adjustments, total, difference: documentTotal === null ? null : total - documentTotal }
}

// The product a line is matched to, as the purchase order editor shows it, or a way to find one. A product chosen
// while Shopify couldn't be reached is still chosen; only its details are missing.
function LineProduct({
  product,
  selected,
  onFind
}: {
  product: ReviewProduct | undefined
  selected: boolean
  onFind: () => void
}) {
  if (product) {
    const variant = variantName(product)
    return (
      <>
        <span className="leading-snug font-medium">{product.title}</span>
        {variant && <Badge variant="secondary">{variant}</Badge>}
        {product.sku ? (
          <span className="text-xs text-muted-foreground">{product.sku}</span>
        ) : (
          <WarningNote>No SKU in Shopify</WarningNote>
        )}
      </>
    )
  }
  if (selected) {
    return <span className="text-muted-foreground">Product details unavailable</span>
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <WarningNote>No matching product</WarningNote>
      <Button type="button" variant="outline" size="sm" onClick={onFind}>
        <Search data-icon="inline-start" />
        Find product
      </Button>
    </div>
  )
}

// The importer's notes on the document or on a line.
function Warnings({ warnings }: { warnings: string[] }) {
  if (!warnings.length) {
    return null
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {warnings.map((warning, index) => (
        <li key={index}>
          <WarningNote>{warning}</WarningNote>
        </li>
      ))}
    </ul>
  )
}

export function ImportReview({
  id,
  filename,
  initialRevision,
  initialProposal,
  initialSelectedProducts,
  suppliers
}: {
  id: string
  filename: string
  initialRevision: number
  initialProposal: ImportProposal
  initialSelectedProducts: Record<string, ReviewProduct>
  suppliers: Array<{ id: string; name: string }>
}) {
  const router = useRouter()
  const [proposal, setProposal] = useState(initialProposal)
  const [selectedProducts, setSelectedProducts] = useState(initialSelectedProducts)
  const [revision, setRevision] = useState(initialRevision)
  const [supplierId, setSupplierId] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [searchRow, setSearchRow] = useState<number | null>(null)
  const [query, setQuery] = useState("")
  const [search, catalog] = reviewApi.useLazyImportCatalogQuery()
  const [correct, correcting] = reviewApi.useCorrectImportMutation()
  const [readState, reading] = reviewApi.useLazyImportStateQuery()
  const [save, saving] = reviewApi.useSaveImportMutation()
  const busy = reading.isFetching || correcting.isLoading || saving.isLoading
  const totals = totalsOf(proposal)
  const currency = proposal.currency
  // An amount in the document's currency, or as a plain number until the currency is chosen.
  const format = (minor: number) => (currency ? money(minor, currency) : (minor / 100).toFixed(2))
  // A total, or a dash until the lines, charges and currency are complete.
  const summary = (minor: number | undefined) => (minor !== undefined && currency ? money(minor, currency) : "—")
  // The search results for what's typed, with the next catalog page to look through.
  const results = catalog.originalArgs?.q === query ? catalog.data : undefined
  const nextCursor = results?.nextCursor ?? null

  function edit(change: (draft: ImportProposal) => void) {
    setProposal((current) => {
      const next = structuredClone(current)
      change(next)
      return next
    })
  }
  function editLine(index: number, change: (line: Line) => void) {
    edit((draft) => {
      const line = draft.items[index]
      if (line) {
        change(line)
      }
    })
  }
  function runSearch(text = query, cursor?: string) {
    if (text.trim() && !catalog.isFetching) {
      void search(cursor ? { id, q: text, cursor } : { id, q: text })
    }
  }
  // Opens the catalog search under a line, already searching for its SKU or description.
  function openSearch(index: number) {
    const item = proposal.items[index]
    const text = item ? (item.sourceSku ?? item.description) : ""
    setSearchRow(index)
    setQuery(text)
    runSearch(text)
  }
  function choose(index: number, variant: CatalogVariant) {
    const product = reviewProduct(variant)
    setSelectedProducts((current) => ({ ...current, [variant.id]: product }))
    editLine(index, (line) => {
      line.selectedVariantId = variant.id
      line.reason = "Selected during review"
      // A line added during review has no document text; it takes the product's name.
      if (!line.description.trim()) {
        line.description = [product.title, variantName(product)].filter(Boolean).join(" ")
      }
    })
    setSearchRow(null)
  }
  function addLine() {
    const index = proposal.items.length
    edit((draft) => {
      draft.items.push({
        description: "",
        sourceSku: null,
        sourcePage: null,
        sourceQuantity: null,
        sourceUnit: null,
        sourceUnitPrice: null,
        sourceLineTotal: null,
        selectedVariantId: null,
        candidateVariantIds: [],
        pieces: null,
        piecesPerSet: null,
        pricePerPiece: null,
        reason: "Added during review",
        warnings: []
      })
    })
    setSearchRow(index)
    setQuery("")
  }
  function removeLine(index: number) {
    setSearchRow(null)
    edit((draft) => {
      draft.items.splice(index, 1)
    })
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (!supplierId) {
      setError("Choose a supplier")
      return
    }
    const unnamed = proposal.items.findIndex((item) => !item.description.trim())
    if (unnamed !== -1) {
      setError(`Choose a product for line ${unnamed + 1}`)
      return
    }
    try {
      const current = await readState(id, false).unwrap()
      if (current.status === "saved" && current.orderId) {
        router.push(`/orders/${current.orderId}`)
        router.refresh()
        return
      }
      const corrected = await correct({ id, revision, proposal }).unwrap()
      setRevision(corrected.revision)
      const result = await save({
        id,
        revision: corrected.revision,
        supplierId,
        reference: proposal.reference ?? "",
        dueDate
      }).unwrap()
      router.push(result.redirect)
      router.refresh()
    } catch (failure) {
      setError(errorMessage(failure))
    }
  }

  const formId = "import-review"
  return (
    <>
      <PageHeader
        parents={[
          { label: "Purchase orders", href: "/orders" },
          { label: "Import", href: "/orders/import" }
        ]}
        title={filename}
      >
        <Button
          variant="outline"
          nativeButton={false}
          render={<a href={`/api/imports/${id}/source`} target="_blank" rel="noreferrer" aria-label="View PDF" />}
        >
          <FileText data-icon="inline-start" />
          View PDF
        </Button>
        <SubmitButton type="submit" form={formId} pending={busy}>
          Save draft
        </SubmitButton>
      </PageHeader>
      <FormError message={error ?? undefined} />
      {/* The key handler is delegated from the fields and only keeps Enter from submitting; the form adds no action. */}
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <form id={formId} className="@container" onSubmit={submit} onKeyDown={keepEnterFromSubmitting}>
        {/* One column, or the lines beside the details and cost summary once there's room, as in the editor. */}
        <fieldset
          disabled={busy}
          className="grid min-w-0 items-start gap-4 @5xl:grid-cols-[minmax(0,1fr)_20rem] @5xl:grid-rows-[auto_1fr]"
        >
          <Card className="@5xl:col-start-2 @5xl:row-start-1">
            <CardHeader>
              <CardTitle>Purchase order details</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Warnings warnings={proposal.warnings} />
              <FieldGroup className="grid gap-4 @xl:grid-cols-2 @5xl:grid-cols-1">
                <SelectField
                  id="import-supplier"
                  label="Supplier"
                  required
                  placeholder="Choose a supplier"
                  options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                />
                <Field>
                  <FormLabel htmlFor="import-reference" label="Reference number" required />
                  <Input
                    id="import-reference"
                    required
                    maxLength={80}
                    value={proposal.reference ?? ""}
                    onChange={(e) => {
                      const value = e.target.value
                      edit((p) => {
                        p.reference = value
                      })
                    }}
                  />
                </Field>
                <Field>
                  <FormLabel htmlFor="import-due-date" label="Required by" required />
                  <DateInput
                    id="import-due-date"
                    required
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </Field>
                <SelectField
                  id="import-currency"
                  label="Currency"
                  required
                  placeholder="Choose a currency"
                  options={currencies.map((code) => ({ value: code, label: currencyNames[code] }))}
                  value={currency ?? ""}
                  onChange={(e) => {
                    const value = e.target.value
                    if (arrayIncludes(currencies, value)) {
                      edit((p) => {
                        p.currency = value
                      })
                    }
                  }}
                />
              </FieldGroup>
            </CardContent>
          </Card>

          <Card className="gap-0 overflow-hidden py-0 @5xl:col-start-1 @5xl:row-span-2 @5xl:row-start-1">
            <CardHeader className="border-b p-4">
              <CardTitle>Lines</CardTitle>
            </CardHeader>
            {/* An editing grid: on a phone it scrolls sideways rather than squeezing the inputs. */}
            <Table framed={false} className={edgeTable}>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="w-24 text-right">Units</TableHead>
                  <TableHead className="w-20 text-right">Per pack</TableHead>
                  <TableHead className="w-28 text-right">Price per unit</TableHead>
                  <TableHead className="w-28 text-right">Line total</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {proposal.items.map((item, index) => {
                  const line = index + 1
                  const product = item.selectedVariantId ? selectedProducts[item.selectedVariantId] : undefined
                  const source = sourceLine(item)
                  const price = minorUnits(item.pricePerPiece)
                  const lineTotal = minorUnits(item.sourceLineTotal)
                  const computed = item.pieces !== null && price !== null ? item.pieces * price : null
                  // Saving checks the document's line total against pieces × price; say so before it does.
                  const warnings =
                    computed !== null && lineTotal !== null && computed !== lineTotal
                      ? [
                          ...item.warnings,
                          `Units × price is ${format(computed)}, but the line total is ${format(lineTotal)}`
                        ]
                      : item.warnings
                  return (
                    <Fragment key={index}>
                      <TableRow className="hover:bg-transparent">
                        <TableCell className="py-2.5 align-top whitespace-normal">
                          <div className="flex min-w-56 flex-col items-start gap-1">
                            <LineProduct
                              product={product}
                              selected={item.selectedVariantId !== null}
                              onFind={() => openSearch(index)}
                            />
                            {(item.description || source) && (
                              <p className="mt-1 flex gap-1.5 text-xs text-muted-foreground">
                                <FileText aria-hidden className="mt-px size-3.5 shrink-0" />
                                <span className="min-w-0">
                                  <span className="sr-only">On the document: </span>
                                  {item.description}
                                  {source && <span className="block">{source}</span>}
                                </span>
                              </p>
                            )}
                            {item.reason && <p className="text-xs text-muted-foreground">{item.reason}</p>}
                            <Warnings warnings={warnings} />
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <Input
                            aria-label={`Units on line ${line}`}
                            required
                            type="number"
                            inputMode="numeric"
                            min="1"
                            step="1"
                            className="text-right tabular-nums"
                            value={item.pieces ?? ""}
                            onChange={(e) => {
                              const value = e.target.value
                              editLine(index, (target) => {
                                target.pieces = value ? Number(value) : null
                              })
                            }}
                          />
                        </TableCell>
                        <TableCell className="align-top">
                          <Input
                            aria-label={`Units per pack on line ${line}`}
                            required
                            type="number"
                            inputMode="numeric"
                            min="1"
                            step="1"
                            className="text-right tabular-nums"
                            value={item.piecesPerSet ?? ""}
                            onChange={(e) => {
                              const value = e.target.value
                              editLine(index, (target) => {
                                target.piecesPerSet = value ? Number(value) : null
                              })
                            }}
                          />
                        </TableCell>
                        <TableCell className="align-top">
                          <Input
                            aria-label={`Price per unit on line ${line}`}
                            required
                            inputMode="decimal"
                            autoComplete="off"
                            className="text-right tabular-nums"
                            value={item.pricePerPiece ?? ""}
                            onChange={(e) => {
                              const value = e.target.value
                              editLine(index, (target) => {
                                target.pricePerPiece = value || null
                              })
                            }}
                          />
                        </TableCell>
                        <TableCell className="align-top">
                          <Input
                            aria-label={`Line total on line ${line}`}
                            inputMode="decimal"
                            autoComplete="off"
                            className="text-right tabular-nums"
                            value={item.sourceLineTotal ?? ""}
                            onChange={(e) => {
                              const value = e.target.value
                              editLine(index, (target) => {
                                target.sourceLineTotal = value || null
                              })
                            }}
                          />
                        </TableCell>
                        <TableCell className="align-top">
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  className="mt-0.5"
                                  aria-label={`More for line ${line}`}
                                />
                              }
                            >
                              <Ellipsis />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => openSearch(index)}>
                                {item.selectedVariantId ? "Change product" : "Find product"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="destructive"
                                disabled={proposal.items.length === 1}
                                onClick={() => removeLine(index)}
                              >
                                Remove line
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                      {searchRow === index && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={6} className="bg-muted/30 py-3 whitespace-normal">
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-2">
                                <InputGroup className="max-w-md">
                                  <InputGroupAddon>
                                    <Search />
                                  </InputGroupAddon>
                                  <InputGroupInput
                                    ref={focusOnMount}
                                    aria-label={`Find a product for line ${line}`}
                                    placeholder="Product, SKU or supplier SKU"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    onKeyDown={(e) => {
                                      // Enter searches rather than saving the whole review.
                                      if (e.key === "Enter") {
                                        e.preventDefault()
                                        runSearch()
                                      }
                                    }}
                                  />
                                </InputGroup>
                                <SubmitButton
                                  type="button"
                                  variant="outline"
                                  pending={catalog.isFetching}
                                  disabled={!query.trim()}
                                  onClick={() => runSearch()}
                                >
                                  Search
                                </SubmitButton>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  className="ml-auto"
                                  aria-label="Close search"
                                  onClick={() => setSearchRow(null)}
                                >
                                  <X />
                                </Button>
                              </div>
                              {catalog.isError && <FormError message={errorMessage(catalog.error)} />}
                              {results && results.results.length > 0 && (
                                <ul className="divide-y overflow-hidden rounded-lg border bg-background">
                                  {results.results.map((result) => {
                                    const option = reviewProduct(result)
                                    const details = [
                                      variantName(option),
                                      option.sku,
                                      result.supplierSku && `Supplier SKU ${result.supplierSku.value}`
                                    ]
                                      .filter(Boolean)
                                      .join(", ")
                                    return (
                                      <li key={result.id}>
                                        <button
                                          type="button"
                                          className="flex w-full flex-col items-start px-3 py-2 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
                                          onClick={() => choose(index, result)}
                                        >
                                          <span className="font-medium">{option.title}</span>
                                          {details && <span className="text-xs text-muted-foreground">{details}</span>}
                                        </button>
                                      </li>
                                    )
                                  })}
                                </ul>
                              )}
                              {results && !results.results.length && (
                                <p className="text-sm text-muted-foreground">
                                  {results.complete ? "No matches" : "No matches yet"}
                                </p>
                              )}
                              {nextCursor && (
                                <div>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={catalog.isFetching}
                                    onClick={() => runSearch(query, nextCursor)}
                                  >
                                    Search more
                                  </Button>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
            <div className="border-t p-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={proposal.items.length >= 150}
                onClick={addLine}
              >
                <Plus data-icon="inline-start" />
                Add line
              </Button>
            </div>
          </Card>

          <Card className="@5xl:col-start-2 @5xl:row-start-2">
            <CardHeader>
              <CardTitle>Cost summary</CardTitle>
              <CardDescription>Discounts as negative amounts</CardDescription>
              <CardAction>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={proposal.adjustments.length >= 50}
                  onClick={() =>
                    edit((p) => {
                      p.adjustments.push({ description: "", amount: null, sourcePage: 1 })
                    })
                  }
                >
                  <Plus data-icon="inline-start" />
                  Add charge
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {proposal.adjustments.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {proposal.adjustments.map((charge, index) => (
                    <li key={index} className="grid grid-cols-[minmax(0,1fr)_7rem_auto] items-center gap-2">
                      <Input
                        aria-label={`Charge ${index + 1}`}
                        placeholder="Description"
                        required
                        maxLength={255}
                        value={charge.description}
                        onChange={(e) => {
                          const value = e.target.value
                          edit((p) => {
                            const target = p.adjustments[index]
                            if (target) {
                              target.description = value
                            }
                          })
                        }}
                      />
                      <Input
                        aria-label={`Amount of charge ${index + 1}`}
                        placeholder="0.00"
                        required
                        inputMode="decimal"
                        autoComplete="off"
                        className="text-right tabular-nums"
                        value={charge.amount ?? ""}
                        onChange={(e) => {
                          const value = e.target.value
                          edit((p) => {
                            const target = p.adjustments[index]
                            if (target) {
                              target.amount = value || null
                            }
                          })
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove charge ${index + 1}`}
                        onClick={() =>
                          edit((p) => {
                            p.adjustments.splice(index, 1)
                          })
                        }
                      >
                        <Trash2 />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <dl
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2",
                  proposal.adjustments.length > 0 && "border-t pt-4"
                )}
              >
                <dt className="text-muted-foreground">Products</dt>
                <dd className="text-right tabular-nums">{summary(totals?.products)}</dd>
                <dt className="text-muted-foreground">Charges</dt>
                <dd className="text-right tabular-nums">{summary(totals?.adjustments)}</dd>
                <dt className="font-medium">Total</dt>
                <dd className="text-right font-medium tabular-nums">{summary(totals?.total)}</dd>
                <dt>
                  <label htmlFor="import-document-total" className="text-muted-foreground">
                    Document total
                  </label>
                </dt>
                <dd>
                  <Input
                    id="import-document-total"
                    inputMode="decimal"
                    autoComplete="off"
                    className="w-28 text-right tabular-nums"
                    value={proposal.documentTotal ?? ""}
                    onChange={(e) => {
                      const value = e.target.value
                      edit((p) => {
                        p.documentTotal = value || null
                      })
                    }}
                  />
                </dd>
              </dl>
              {currency && totals && totals.difference !== null && totals.difference !== 0 && (
                <WarningNote>
                  {money(Math.abs(totals.difference), currency)} {totals.difference > 0 ? "over" : "under"} the document
                  total
                </WarningNote>
              )}
            </CardContent>
          </Card>
        </fieldset>
      </form>
    </>
  )
}
