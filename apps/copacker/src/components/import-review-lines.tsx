import {
  Badge,
  Button,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@buildkitgg/shadcn"
import { variantName } from "@repo/copacker-marketplaces/shopify"
import type { CatalogVariant } from "@repo/copacker-marketplaces/shopify"
import { Ellipsis, Plus, Search, X } from "lucide-react"
import { Fragment, useId, useState } from "react"
import { useLocale, useTranslations } from "use-intl"
import { FlushCard } from "@/components/flush-card"
import { FormError, SubmitButton } from "@/components/form-feedback"
import { SearchField } from "@/components/list/search-field"
import { useErrorMessage } from "@/hooks/use-error-text"
import { useMoney } from "@/hooks/use-money"
import { api } from "@/lib/api"
import { insetTable } from "@/lib/controls"
import { currencySymbol } from "@/lib/currency"
import type { ImportProposal } from "@/lib/import-proposal"
import { lineTotals } from "@/lib/import-totals"
import { cn } from "@/lib/utils"
import { WarningNote } from "./common"

const linesApi = api.injectEndpoints({
  endpoints: (build) => ({
    importCatalog: build.query<
      { results: CatalogVariant[]; nextCursor: string | null; complete: boolean },
      { id: string; q: string; cursor?: string }
    >({ query: ({ id, ...params }) => ({ url: `imports/${id}/catalog`, params }), keepUnusedDataFor: 0 })
  })
})

// A line or a charge of the proposal, with the key the review gives it, so its inputs stay with it as others come and
// go. Saving leaves the keys out.
export type Keyed<T> = T & { key: string }
export type ReviewLine = Keyed<ImportProposal["items"][number]>

// A catalog product as the review shows it: the product's title, the variant's, and its SKU.
export type ReviewProduct = { title: string; variant: string; sku: string | null }

export function reviewProduct(variant: CatalogVariant): ReviewProduct {
  return { title: variant.product.title, variant: variant.title, sku: variant.sku }
}

// A cell saving needs that's still empty.
export const blank = (value: string | number | null) => value === null || value === ""

// Focuses the product search when it opens. Defined once, so React calls it only when the search mounts.
const focusOnMount = (input: HTMLInputElement | null) => input?.focus()

// An amount as the document writes it, with the currency's symbol in front once there is one.
export function AmountInput({
  currency,
  className,
  ...props
}: React.ComponentProps<typeof Input> & { currency: string | null }) {
  const locale = useLocale()
  const currencyId = useId()
  return (
    <InputGroup className={className}>
      {currency && (
        <InputGroupAddon>
          <span aria-hidden>{currencySymbol(currency, locale)}</span>
          <span id={currencyId} className="sr-only">
            {currency}
          </span>
        </InputGroupAddon>
      )}
      <InputGroupInput
        {...props}
        aria-describedby={currency ? currencyId : undefined}
        className="text-end tabular-nums"
      />
    </InputGroup>
  )
}

// The importer's notes on the document or on a line.
export function Warnings({ warnings }: { warnings: string[] }) {
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
  const t = useTranslations("orders.review")
  if (product) {
    const variant = variantName(product.variant)
    return (
      <>
        <span className="leading-snug font-medium">{product.title}</span>
        {variant && <Badge variant="secondary">{variant}</Badge>}
        {product.sku ? (
          <span className="text-xs text-muted-foreground">{product.sku}</span>
        ) : (
          <WarningNote>{t("noShopifySku")}</WarningNote>
        )}
      </>
    )
  }
  if (selected) {
    return <span className="text-muted-foreground">{t("detailsUnavailable")}</span>
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <WarningNote>{t("noMatchingProduct")}</WarningNote>
      <Button type="button" variant="outline" size="sm" onClick={onFind}>
        <Search data-icon="inline-start" />
        {t("findProduct")}
      </Button>
    </div>
  )
}

// The import's lines as an editing grid: each line's product, units, pack size, price and the document's line total,
// with its menu, and the catalog search under a line while its product is being found.
export function ImportLines({
  id,
  lines,
  selectedProducts,
  currency,
  checking,
  onEditLine,
  onChoose,
  onAddLine,
  onRemoveLine,
  onSourceDetails
}: {
  // The import's.
  id: string
  lines: ReviewLine[]
  selectedProducts: Record<string, ReviewProduct>
  currency: string | null
  // Once saving has been tried, what a line still needs is marked.
  checking: boolean
  onEditLine: (index: number, change: (line: ReviewLine) => void) => void
  onChoose: (index: number, variant: CatalogVariant) => void
  // Adds an empty line and returns its key.
  onAddLine: () => string
  onRemoveLine: (index: number) => void
  // Opens a line's source details, focusing `trigger` again once they close.
  onSourceDetails: (line: ReviewLine, trigger: HTMLElement | null) => void
}) {
  const t = useTranslations("orders")
  const tr = useTranslations("orders.review")
  const errorMessage = useErrorMessage()
  const money = useMoney()
  // The key of the line whose product is being found, and what's typed in its search.
  const [searchLine, setSearchLine] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [search, catalog] = linesApi.useLazyImportCatalogQuery()
  // The search results for what's typed, with the next catalog page to look through.
  const results = catalog.originalArgs?.q === query ? catalog.data : undefined
  const nextCursor = results?.nextCursor ?? null
  // An amount in the document's currency, or as a plain number until the currency is chosen.
  const format = (minor: number) => (currency ? money(minor, currency) : (minor / 100).toFixed(2))
  const flagged = (value: string | number | null) => checking && blank(value)

  function runSearch(text = query, cursor?: string) {
    if (text.trim() && !catalog.isFetching) {
      void search(cursor ? { id, q: text, cursor } : { id, q: text })
    }
  }
  // Opens the catalog search under a line, already searching for its SKU or description.
  function openSearch(line: ReviewLine) {
    const text = line.sourceSku ?? line.description
    setSearchLine(line.key)
    setQuery(text)
    runSearch(text)
  }

  return (
    <FlushCard className="@5xl:col-start-1 @5xl:row-span-2 @5xl:row-start-1">
      <CardHeader>
        <CardTitle>{tr("lines")}</CardTitle>
      </CardHeader>
      {/* An editing grid: on a phone it scrolls sideways rather than squeezing the inputs. */}
      <Table className={cn(insetTable, "min-w-3xl")}>
        <TableHeader>
          <TableRow>
            <TableHead>{tr("columns.product")}</TableHead>
            <TableHead className="w-24 text-end">{tr("columns.units")}</TableHead>
            <TableHead className="w-20 text-end">{tr("columns.perPack")}</TableHead>
            <TableHead className="w-28 text-end">{tr("columns.pricePerUnit")}</TableHead>
            <TableHead className="w-28 text-end">{tr("columns.lineTotal")}</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">{t("detail.columns.actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((item, index) => {
            const line = index + 1
            const product = item.selectedVariantId ? selectedProducts[item.selectedVariantId] : undefined
            const { computed, printed } = lineTotals(item)
            // Saving checks the document's line total against pieces × price; say so before it does.
            const warnings =
              computed !== null && printed !== null && computed !== printed
                ? [
                    ...item.warnings,
                    tr("lineTotalMismatch", { computed: format(computed), lineTotal: format(printed) })
                  ]
                : item.warnings
            const menuId = `import-line-menu-${index}`
            return (
              <Fragment key={item.key}>
                <TableRow className="hover:bg-transparent">
                  <TableCell className="py-2.5 align-top whitespace-normal">
                    <div className="flex min-w-56 flex-col items-start gap-1">
                      <LineProduct
                        product={product}
                        selected={item.selectedVariantId !== null}
                        onFind={() => openSearch(item)}
                      />
                      <Warnings warnings={warnings} />
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <Input
                      aria-label={tr("unitsOnLine", { line })}
                      required
                      aria-invalid={flagged(item.pieces)}
                      type="number"
                      inputMode="numeric"
                      min="1"
                      step="1"
                      className="text-end tabular-nums"
                      value={item.pieces ?? ""}
                      onChange={(e) => {
                        const value = e.target.value
                        onEditLine(index, (target) => {
                          target.pieces = value ? Number(value) : null
                        })
                      }}
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <Input
                      aria-label={tr("unitsPerPackOnLine", { line })}
                      required
                      aria-invalid={flagged(item.piecesPerSet)}
                      type="number"
                      inputMode="numeric"
                      min="1"
                      step="1"
                      className="text-end tabular-nums"
                      value={item.piecesPerSet ?? ""}
                      onChange={(e) => {
                        const value = e.target.value
                        onEditLine(index, (target) => {
                          target.piecesPerSet = value ? Number(value) : null
                        })
                      }}
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <AmountInput
                      currency={currency}
                      aria-label={tr("pricePerUnitOnLine", { line })}
                      required
                      aria-invalid={flagged(item.pricePerPiece)}
                      inputMode="decimal"
                      autoComplete="off"
                      className="text-end tabular-nums"
                      value={item.pricePerPiece ?? ""}
                      onChange={(e) => {
                        const value = e.target.value
                        onEditLine(index, (target) => {
                          target.pricePerPiece = value || null
                        })
                      }}
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <AmountInput
                      currency={currency}
                      aria-label={tr("lineTotalOnLine", { line })}
                      inputMode="decimal"
                      autoComplete="off"
                      className="text-end tabular-nums"
                      value={item.sourceLineTotal ?? ""}
                      onChange={(e) => {
                        const value = e.target.value
                        onEditLine(index, (target) => {
                          target.sourceLineTotal = value || null
                        })
                      }}
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        id={menuId}
                        render={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="mt-0.5"
                            aria-label={tr("moreForLine", { line })}
                          />
                        }
                      >
                        <Ellipsis />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => onSourceDetails(item, document.getElementById(menuId))}>
                          {tr("sourceDetails")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openSearch(item)}>
                          {item.selectedVariantId ? tr("changeProduct") : tr("findProduct")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={lines.length === 1}
                          onClick={() => {
                            setSearchLine(null)
                            onRemoveLine(index)
                          }}
                        >
                          {tr("removeLine")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
                {searchLine === item.key && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="bg-muted/30 py-3 whitespace-normal">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <SearchField
                            ref={focusOnMount}
                            className="max-w-md"
                            label={tr("findProductForLine", { line })}
                            placeholder={tr("searchPlaceholder")}
                            value={query}
                            onChange={setQuery}
                            onKeyDown={(e) => {
                              // Enter searches rather than saving the whole review.
                              if (e.key === "Enter") {
                                e.preventDefault()
                                runSearch()
                              }
                            }}
                          />
                          <SubmitButton
                            type="button"
                            variant="outline"
                            pending={catalog.isFetching}
                            disabled={!query.trim()}
                            onClick={() => runSearch()}
                          >
                            {tr("search")}
                          </SubmitButton>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="ms-auto"
                            aria-label={tr("closeSearch")}
                            onClick={() => setSearchLine(null)}
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
                                variantName(option.variant),
                                option.sku,
                                result.supplierSku && tr("supplierSku", { sku: result.supplierSku.value })
                              ]
                                .filter(Boolean)
                                .join(", ")
                              return (
                                <li key={result.id}>
                                  <button
                                    type="button"
                                    className="focus-ring flex w-full flex-col items-start px-3 py-2 text-start text-sm hover:bg-muted focus-visible:bg-muted focus-visible:ring-inset"
                                    onClick={() => {
                                      onChoose(index, result)
                                      setSearchLine(null)
                                    }}
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
                            {results.complete ? tr("noMatches") : tr("noMatchesYet")}
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
                              {tr("searchMore")}
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
          disabled={lines.length >= 150}
          onClick={() => {
            setSearchLine(onAddLine())
            setQuery("")
          }}
        >
          <Plus data-icon="inline-start" />
          {tr("addLine")}
        </Button>
      </div>
    </FlushCard>
  )
}
