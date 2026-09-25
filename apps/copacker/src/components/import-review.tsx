"use client"

import { money } from "@repo/aisle"
import type { CatalogVariant } from "@repo/aisle/shopify"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { api, errorMessage } from "@/lib/api"
import { priceInMinorUnits, type ImportProposal } from "@/server/import-proposal"
import { FormError } from "./actions"
import { Button } from "./ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Input } from "./ui/input"
import { sx } from "@/styles/sprinkles.css"

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
        body: { ...body, reviewed: true, destination: "awd_us" }
      })
    })
  })
})

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
  function edit(change: (draft: ImportProposal) => void) {
    setProposal((current) => {
      const next = structuredClone(current)
      change(next)
      return next
    })
  }
  return (
    <form
      className={sx({ display: "flex", flexDirection: "column", gap: 6 })}
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
      <fieldset disabled={busy} className={sx({ display: "flex", flexDirection: "column", gap: 6 })}>
        <Card>
          <CardHeader>
            <CardTitle>Review imported purchase order</CardTitle>
          </CardHeader>
          <CardContent className={sx({ display: "flex", flexDirection: "column", gap: 4 })}>
            <a href={`/api/imports/${id}/source`} target="_blank" rel="noreferrer">
              View original PDF
            </a>
            <p>
              Confirm every item and amount against the document. Quantities and prices below are per individual piece.
              This creates an AWD USA draft only.
            </p>
            {proposal.warnings.map((warning, index) => (
              <p key={index}>{warning}</p>
            ))}
            <label htmlFor="import-reference">
              PO reference
              <Input
                id="import-reference"
                required
                value={proposal.reference ?? ""}
                onChange={(e) =>
                  edit((p) => {
                    p.reference = e.target.value
                  })
                }
              />
            </label>
            <label>
              Supplier
              <select required value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Choose supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="import-due-date">
              Required date
              <Input
                id="import-due-date"
                required
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </label>
            <label>
              Currency
              <select
                required
                value={proposal.currency ?? ""}
                onChange={(e) =>
                  edit((p) => {
                    const currency = e.target.value
                    if (
                      currency === "USD" ||
                      currency === "CNY" ||
                      currency === "EUR" ||
                      currency === "GBP" ||
                      currency === "CAD" ||
                      currency === "AUD"
                    ) {
                      p.currency = currency
                    }
                  })
                }
              >
                <option value="">Choose currency</option>
                {["USD", "CNY", "EUR", "GBP", "CAD", "AUD"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </CardContent>
        </Card>
        {proposal.items.map((item, index) => (
          <Card key={index}>
            <CardHeader>
              <CardTitle>{item.description || `Item ${index + 1}`}</CardTitle>
            </CardHeader>
            <CardContent className={sx({ display: "flex", flexDirection: "column", gap: 4 })}>
              <p>
                {item.sourcePage === null ? "No source page recorded" : `Page ${item.sourcePage}`} / Source SKU:{" "}
                {item.sourceSku ?? "Not provided"} / {item.sourceQuantity ?? "Unknown"} {item.sourceUnit ?? "units"} at{" "}
                {item.sourceUnitPrice ?? "unknown price"}
              </p>
              <label htmlFor={`import-description-${index}`}>
                Item description
                <Input
                  id={`import-description-${index}`}
                  required
                  maxLength={1000}
                  value={item.description}
                  onChange={(e) =>
                    edit((p) => {
                      p.items[index]!.description = e.target.value
                    })
                  }
                />
              </label>
              <label htmlFor={`import-source-page-${index}`}>
                Document page (optional)
                <Input
                  id={`import-source-page-${index}`}
                  type="number"
                  min="1"
                  max="50"
                  step="1"
                  value={item.sourcePage ?? ""}
                  onChange={(e) =>
                    edit((p) => {
                      p.items[index]!.sourcePage = e.target.value ? Number(e.target.value) : null
                    })
                  }
                />
              </label>
              <p>
                Selected product:{" "}
                {item.selectedVariantId
                  ? (selectedProducts[item.selectedVariantId] ??
                    "Catalog details unavailable. Find the product to verify the selection.")
                  : "Choose a catalog product"}
              </p>
              <p>{item.reason}</p>
              {item.warnings.map((warning, i) => (
                <p key={i}>{warning}</p>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSearchRow(index)
                  setQuery(item.sourceSku ?? item.description)
                }}
              >
                Find product for line {index + 1}
              </Button>
              {searchRow === index && (
                <div className={sx({ display: "flex", flexDirection: "column", gap: 2 })}>
                  <Input
                    aria-label={`Catalog search for line ${index + 1}`}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <Button type="button" disabled={catalog.isFetching} onClick={() => search({ id, q: query })}>
                    Search catalog
                  </Button>
                  {catalog.isError && <FormError message={errorMessage(catalog.error)} />}
                  {catalog.originalArgs?.q === query && catalog.data && (
                    <p>
                      {catalog.data.complete
                        ? "End of catalog reached."
                        : "More catalog pages remain. Continue to check all possible matches."}
                    </p>
                  )}
                  {catalog.originalArgs?.q === query && catalog.data?.nextCursor && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={catalog.isFetching}
                      onClick={() => search({ id, q: query, cursor: catalog.data!.nextCursor! })}
                    >
                      Search next catalog page
                    </Button>
                  )}

                  {catalog.originalArgs?.q === query &&
                    catalog.data?.results.map((product) => (
                      <Button
                        key={product.id}
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setSelectedProducts((current) => ({
                            ...current,
                            [product.id]: `${product.product.title} / ${product.title} / ${product.sku ?? "No buyer SKU"}`
                          }))
                          edit((p) => {
                            p.items[index]!.selectedVariantId = product.id
                            p.items[index]!.reason =
                              `Selected ${product.product.title} / ${product.title} / ${product.sku}`
                          })
                          setSearchRow(null)
                        }}
                      >
                        {product.product.title} / {product.title} / {product.sku}
                      </Button>
                    ))}
                </div>
              )}
              <label htmlFor={`import-pieces-${index}`}>
                Pieces
                <Input
                  id={`import-pieces-${index}`}
                  required
                  type="number"
                  min="1"
                  step="1"
                  value={item.pieces ?? ""}
                  onChange={(e) =>
                    edit((p) => {
                      p.items[index]!.pieces = e.target.value ? Number(e.target.value) : null
                    })
                  }
                />
              </label>
              <label htmlFor={`import-pack-${index}`}>
                Pieces per sellable set
                <Input
                  id={`import-pack-${index}`}
                  required
                  type="number"
                  min="1"
                  step="1"
                  value={item.piecesPerSet ?? ""}
                  onChange={(e) =>
                    edit((p) => {
                      p.items[index]!.piecesPerSet = e.target.value ? Number(e.target.value) : null
                    })
                  }
                />
              </label>
              <label htmlFor={`import-price-${index}`}>
                Price per piece
                <Input
                  id={`import-price-${index}`}
                  required
                  inputMode="decimal"
                  value={item.pricePerPiece ?? ""}
                  onChange={(e) =>
                    edit((p) => {
                      p.items[index]!.pricePerPiece = e.target.value || null
                    })
                  }
                />
              </label>
              <label htmlFor={`import-line-total-${index}`}>
                Document line total
                <Input
                  id={`import-line-total-${index}`}
                  inputMode="decimal"
                  value={item.sourceLineTotal ?? ""}
                  onChange={(e) =>
                    edit((p) => {
                      p.items[index]!.sourceLineTotal = e.target.value || null
                    })
                  }
                />
              </label>
              <Button
                type="button"
                variant="outline"
                disabled={proposal.items.length === 1}
                onClick={() => {
                  setSearchRow(null)
                  edit((p) => {
                    p.items.splice(index, 1)
                  })
                }}
              >
                Remove line {index + 1}
              </Button>
            </CardContent>
          </Card>
        ))}
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
                reason: "Added during review. Select a catalog product and confirm the quantity and price.",
                warnings: []
              })
            })
          }}
        >
          Add missing item
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Charges and document total</CardTitle>
          </CardHeader>
          <CardContent className={sx({ display: "flex", flexDirection: "column", gap: 4 })}>
            {proposal.adjustments.map((charge, index) => (
              <div key={index}>
                <label htmlFor={`import-charge-description-${index}`}>
                  Charge description
                  <Input
                    id={`import-charge-description-${index}`}
                    required
                    value={charge.description}
                    onChange={(e) =>
                      edit((p) => {
                        p.adjustments[index]!.description = e.target.value
                      })
                    }
                  />
                </label>
                <label htmlFor={`import-charge-amount-${index}`}>
                  Amount (negative for discounts)
                  <Input
                    id={`import-charge-amount-${index}`}
                    required
                    inputMode="decimal"
                    value={charge.amount ?? ""}
                    onChange={(e) =>
                      edit((p) => {
                        p.adjustments[index]!.amount = e.target.value || null
                      })
                    }
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    edit((p) => {
                      p.adjustments.splice(index, 1)
                    })
                  }
                >
                  Remove charge
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                edit((p) => {
                  p.adjustments.push({ description: "", amount: null, sourcePage: 1 })
                })
              }
            >
              Add charge or discount
            </Button>
            <label htmlFor="import-grand-total">
              Document grand total
              <Input
                id="import-grand-total"
                inputMode="decimal"
                value={proposal.documentTotal ?? ""}
                onChange={(e) =>
                  edit((p) => {
                    p.documentTotal = e.target.value || null
                  })
                }
              />
            </label>
            {error && <FormError message={error} />}
            {totals && proposal.currency ? (
              <output>
                Products: {money(totals.products, proposal.currency)} / Charges and discounts:{" "}
                {money(totals.adjustments, proposal.currency)} / Total: {money(totals.total, proposal.currency)}
                {totals.difference !== null && totals.difference !== 0 && (
                  <p>
                    Difference from document: {money(totals.difference, proposal.currency)}. Correct the amounts before
                    saving.
                  </p>
                )}
              </output>
            ) : (
              <p>Complete quantities, prices and currency to calculate the total.</p>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Confirm review and save draft"}
            </Button>
          </CardContent>
        </Card>
      </fieldset>
    </form>
  )
}
