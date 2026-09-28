"use client"

import { money } from "@repo/aisle"
import type { CatalogVariant } from "@repo/aisle/shopify"
import { FileText, Plus, Search, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { arrayIncludes, objectKeys } from "ts-extras"
import { api, errorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import { priceInMinorUnits, type ImportProposal } from "@/server/import-proposal"
import { FormError, SubmitButton } from "./actions"
import { PageBreadcrumb, PageHeader, WarningNote } from "./common"
import { DateInput, FormLabel, RequiredMark } from "./form-controls"
import { SelectField } from "./form-fields"
import { Button } from "./ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Field, FieldDescription, FieldGroup, FieldTitle } from "./ui/field"
import { Input } from "./ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "./ui/input-group"

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

// A catalog product, as the review page names the ones already chosen.
function productName(product: CatalogVariant) {
  return `${product.product.title} / ${product.title} / ${product.sku ?? "No buyer SKU"}`
}

// The line as the document lists it, such as "SKU AB-1, 10 pairs at 1.20", leaving out what the document doesn't say.
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
  return parts.join(", ")
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
  initialRevision,
  initialProposal,
  initialSelectedProducts,
  suppliers
}: {
  id: string
  initialRevision: number
  initialProposal: ImportProposal
  initialSelectedProducts: Record<string, string>
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
  let totals: { products: number; adjustments: number; total: number; difference: number | null } | null = null
  try {
    const products = proposal.items.reduce((sum, item) => {
      if (item.pieces === null || item.pricePerPiece === null) {
        throw new Error("Incomplete")
      }
      return sum + item.pieces * priceInMinorUnits(item.pricePerPiece)
    }, 0)
    const adjustments = proposal.adjustments.reduce((sum, item) => {
      if (item.amount === null) {
        throw new Error("Incomplete")
      }
      const negative = item.amount.startsWith("-")
      return sum + (negative ? -1 : 1) * priceInMinorUnits(negative ? item.amount.slice(1) : item.amount)
    }, 0)
    totals = {
      products,
      adjustments,
      total: products + adjustments,
      difference:
        proposal.documentTotal === null ? null : products + adjustments - priceInMinorUnits(proposal.documentTotal)
    }
  } catch {
    // Incomplete input is expected while reviewing; never invent a zero amount.
  }
  const currency = proposal.currency
  // An amount in the document's currency, or a dash until the lines and currency are complete.
  const amount = (minor: number | undefined) => (minor !== undefined && currency ? money(minor, currency) : "—")
  function edit(change: (draft: ImportProposal) => void) {
    setProposal((current) => {
      const next = structuredClone(current)
      change(next)
      return next
    })
  }
  return (
    <>
      <PageBreadcrumb
        parents={[
          { label: "Purchase orders", href: "/orders" },
          { label: "Import", href: "/orders/import" }
        ]}
        current="Review"
      />
      <PageHeader title="Review import">
        <Button
          variant="outline"
          nativeButton={false}
          render={<a href={`/api/imports/${id}/source`} target="_blank" rel="noreferrer" aria-label="View PDF" />}
        >
          <FileText data-icon="inline-start" />
          View PDF
        </Button>
      </PageHeader>
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          setError(null)
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
        }}
      >
        <fieldset disabled={busy} className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Purchase order</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Warnings warnings={proposal.warnings} />
              <FieldGroup className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FormLabel htmlFor="import-reference" label="Reference number" required />
                  <Input
                    id="import-reference"
                    required
                    value={proposal.reference ?? ""}
                    onChange={(e) => {
                      const value = e.target.value
                      edit((p) => {
                        p.reference = value
                      })
                    }}
                  />
                </Field>
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
          {proposal.items.map((item, index) => {
            const line = index + 1
            const source = sourceLine(item)
            const product = item.selectedVariantId
              ? (selectedProducts[item.selectedVariantId] ?? "Details unavailable")
              : null
            return (
              <Card key={index}>
                <CardHeader>
                  <CardTitle>Line {line}</CardTitle>
                  {source && <CardDescription>{source}</CardDescription>}
                  <CardAction>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove line ${line}`}
                      disabled={proposal.items.length === 1}
                      onClick={() => {
                        setSearchRow(null)
                        edit((p) => {
                          p.items.splice(index, 1)
                        })
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </CardAction>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <Warnings warnings={item.warnings} />
                  <FieldGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                    <Field className="sm:col-span-2 lg:col-span-5">
                      <FormLabel htmlFor={`import-description-${index}`} label="Description" required />
                      <Input
                        id={`import-description-${index}`}
                        required
                        maxLength={1000}
                        value={item.description}
                        onChange={(e) => {
                          const value = e.target.value
                          edit((p) => {
                            p.items[index]!.description = value
                          })
                        }}
                      />
                    </Field>
                    <Field className="sm:col-span-2 lg:col-span-5">
                      <FieldTitle>
                        <span>
                          Product
                          <RequiredMark />
                        </span>
                      </FieldTitle>
                      <div className="flex items-center gap-3">
                        <span className={cn("min-w-0 flex-1 truncate text-sm", !product && "text-muted-foreground")}>
                          {product ?? "—"}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          aria-label={`Find product for line ${line}`}
                          onClick={() => {
                            setSearchRow(index)
                            setQuery(item.sourceSku ?? item.description)
                          }}
                        >
                          <Search data-icon="inline-start" />
                          Find product
                        </Button>
                      </div>
                      {item.reason && <FieldDescription>{item.reason}</FieldDescription>}
                      {searchRow === index && (
                        <div className="flex flex-col gap-2">
                          <div className="flex gap-2">
                            <InputGroup>
                              <InputGroupAddon>
                                <Search />
                              </InputGroupAddon>
                              <InputGroupInput
                                aria-label={`Catalog search for line ${line}`}
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={(e) => {
                                  // Enter searches rather than saving the whole review.
                                  if (e.key === "Enter") {
                                    e.preventDefault()
                                    if (!catalog.isFetching) {
                                      search({ id, q: query })
                                    }
                                  }
                                }}
                              />
                            </InputGroup>
                            <Button
                              type="button"
                              variant="outline"
                              disabled={catalog.isFetching}
                              onClick={() => search({ id, q: query })}
                            >
                              Search
                            </Button>
                          </div>
                          {catalog.isError && <FormError message={errorMessage(catalog.error)} />}
                          {catalog.originalArgs?.q === query && catalog.data && (
                            <>
                              {catalog.data.results.length > 0 && (
                                <ul className="divide-y overflow-hidden rounded-lg border">
                                  {catalog.data.results.map((result) => (
                                    <li key={result.id}>
                                      <button
                                        type="button"
                                        className="w-full px-3 py-2 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
                                        onClick={() => {
                                          setSelectedProducts((current) => ({
                                            ...current,
                                            [result.id]: productName(result)
                                          }))
                                          edit((p) => {
                                            p.items[index]!.selectedVariantId = result.id
                                            p.items[index]!.reason = "Selected during review"
                                          })
                                          setSearchRow(null)
                                        }}
                                      >
                                        {productName(result)}
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {catalog.data.complete && catalog.data.results.length === 0 && (
                                <p className="text-sm text-muted-foreground">No matches</p>
                              )}
                              {catalog.data.nextCursor && (
                                <div>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={catalog.isFetching}
                                    onClick={() => search({ id, q: query, cursor: catalog.data!.nextCursor! })}
                                  >
                                    Search more
                                  </Button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </Field>
                    <Field>
                      <FormLabel htmlFor={`import-pieces-${index}`} label="Pieces" required />
                      <Input
                        id={`import-pieces-${index}`}
                        required
                        type="number"
                        min="1"
                        step="1"
                        value={item.pieces ?? ""}
                        onChange={(e) => {
                          const value = e.target.value
                          edit((p) => {
                            p.items[index]!.pieces = value ? Number(value) : null
                          })
                        }}
                      />
                    </Field>
                    <Field>
                      <FormLabel htmlFor={`import-pack-${index}`} label="Pieces per set" required />
                      <Input
                        id={`import-pack-${index}`}
                        required
                        type="number"
                        min="1"
                        step="1"
                        value={item.piecesPerSet ?? ""}
                        onChange={(e) => {
                          const value = e.target.value
                          edit((p) => {
                            p.items[index]!.piecesPerSet = value ? Number(value) : null
                          })
                        }}
                      />
                    </Field>
                    <Field>
                      <FormLabel htmlFor={`import-price-${index}`} label="Price per piece" required />
                      <Input
                        id={`import-price-${index}`}
                        required
                        inputMode="decimal"
                        value={item.pricePerPiece ?? ""}
                        onChange={(e) => {
                          const value = e.target.value
                          edit((p) => {
                            p.items[index]!.pricePerPiece = value || null
                          })
                        }}
                      />
                    </Field>
                    <Field>
                      <FormLabel htmlFor={`import-line-total-${index}`} label="Line total" />
                      <Input
                        id={`import-line-total-${index}`}
                        inputMode="decimal"
                        value={item.sourceLineTotal ?? ""}
                        onChange={(e) => {
                          const value = e.target.value
                          edit((p) => {
                            p.items[index]!.sourceLineTotal = value || null
                          })
                        }}
                      />
                    </Field>
                    <Field>
                      <FormLabel htmlFor={`import-source-page-${index}`} label="Page" />
                      <Input
                        id={`import-source-page-${index}`}
                        type="number"
                        min="1"
                        max="50"
                        step="1"
                        value={item.sourcePage ?? ""}
                        onChange={(e) => {
                          const value = e.target.value
                          edit((p) => {
                            p.items[index]!.sourcePage = value ? Number(value) : null
                          })
                        }}
                      />
                    </Field>
                  </FieldGroup>
                </CardContent>
              </Card>
            )
          })}
          <div>
            <Button
              type="button"
              variant="outline"
              disabled={proposal.items.length >= 150}
              onClick={() => {
                setSearchRow(null)
                edit((p) => {
                  p.items.push({
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
              }}
            >
              <Plus data-icon="inline-start" />
              Add line
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Charges and total</CardTitle>
              <CardDescription>Discounts as negative amounts</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {proposal.adjustments.map((charge, index) => (
                <div key={index} className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
                  <Field>
                    <FormLabel htmlFor={`import-charge-description-${index}`} label="Description" required />
                    <Input
                      id={`import-charge-description-${index}`}
                      required
                      value={charge.description}
                      onChange={(e) => {
                        const value = e.target.value
                        edit((p) => {
                          p.adjustments[index]!.description = value
                        })
                      }}
                    />
                  </Field>
                  <Field>
                    <FormLabel htmlFor={`import-charge-amount-${index}`} label="Amount" required />
                    <Input
                      id={`import-charge-amount-${index}`}
                      required
                      inputMode="decimal"
                      value={charge.amount ?? ""}
                      onChange={(e) => {
                        const value = e.target.value
                        edit((p) => {
                          p.adjustments[index]!.amount = value || null
                        })
                      }}
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove charge ${index + 1}`}
                    onClick={() =>
                      edit((p) => {
                        p.adjustments.splice(index, 1)
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    edit((p) => {
                      p.adjustments.push({ description: "", amount: null, sourcePage: 1 })
                    })
                  }
                >
                  <Plus data-icon="inline-start" />
                  Add charge
                </Button>
              </div>
              <div className="flex flex-col gap-4 border-t pt-4 sm:flex-row sm:items-end sm:justify-between">
                <Field className="sm:max-w-48">
                  <FormLabel htmlFor="import-grand-total" label="Document total" />
                  <Input
                    id="import-grand-total"
                    inputMode="decimal"
                    value={proposal.documentTotal ?? ""}
                    onChange={(e) => {
                      const value = e.target.value
                      edit((p) => {
                        p.documentTotal = value || null
                      })
                    }}
                  />
                </Field>
                <dl className="grid grid-cols-[auto_auto] gap-x-8 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Products</dt>
                  <dd className="text-right tabular-nums">{amount(totals?.products)}</dd>
                  <dt className="text-muted-foreground">Charges</dt>
                  <dd className="text-right tabular-nums">{amount(totals?.adjustments)}</dd>
                  <dt className="font-medium">Total</dt>
                  <dd className="text-right font-medium tabular-nums">{amount(totals?.total)}</dd>
                </dl>
              </div>
              {currency && totals && totals.difference !== null && totals.difference !== 0 && (
                <WarningNote className="sm:self-end">
                  {money(Math.abs(totals.difference), currency)} {totals.difference > 0 ? "over" : "under"} the document
                  total
                </WarningNote>
              )}
            </CardContent>
          </Card>
          <FormError message={error ?? undefined} />
          <div>
            <SubmitButton type="submit" pending={busy}>
              Save draft
            </SubmitButton>
          </div>
        </fieldset>
      </form>
    </>
  )
}
