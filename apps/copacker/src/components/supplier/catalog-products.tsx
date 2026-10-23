import {
  Button,
  CardHeader,
  CardTitle,
  Checkbox,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@buildkitgg/shadcn-baseui-kit"
import { useSet } from "@mantine/hooks"
import { ChevronDown, SlidersHorizontal } from "lucide-react"
import { useState } from "react"
import { useTranslations } from "use-intl"
import { EmptyState } from "@/components/common"
import { FlushCard } from "@/components/flush-card"
import { IndexToolbar } from "@/components/list/index-toolbar"
import { matches } from "@/components/list/matches"
import { Pager } from "@/components/list/pager"
import { SelectionBar } from "@/components/list/selection-bar"
import { usePagedRows } from "@/components/list/use-paged-rows"
import { NoValue } from "@/components/no-value"
import { ProductThumb } from "@/components/product-thumb"
import { type CatalogEntry, catalogPricing } from "@/lib/catalog-pricing"
import { imageUrl } from "@/lib/supplier-product"
import { cn } from "@/lib/utils"
import type { CatalogEditorData } from "@/server/catalogs"
import { CatalogPriceCell, type CatalogVariant } from "./catalog-price-cell"
import { PricingRulesDialog, useRulesSummary } from "./pricing-controls"

type Product = CatalogEditorData["products"][number]
// A catalog's entries by variant: a variant it includes, with any price, volume pricing or rules of its own.
export type CatalogEntries = ReadonlyMap<string, CatalogEntry>

export const emptyEntry: CatalogEntry = { priceMinor: null, priceBreaks: null, quantityRules: null }
const pageSize = 25
// The products table runs edge to edge in its card. On a narrow card the rules hide, and the price ends each row.
const columns = {
  price: "@max-2xl:pe-4",
  rules: "hidden pe-4 @2xl:table-cell"
}

function overridden(entry: CatalogEntry | undefined) {
  return !!entry && (entry.priceBreaks !== null || entry.quantityRules !== null || entry.priceMinor !== null)
}

// A catalog's products: which it includes, and each variant's price, volume pricing and quantity rules, to fix one at a
// time or several at once. `onEntriesChange` gets how to change the entries.
export function CatalogProducts({
  products,
  entries,
  onEntriesChange,
  adjustment,
  includeNewProducts,
  onIncludeNewProductsChange,
  readOnly
}: {
  products: Product[]
  entries: CatalogEntries
  onEntriesChange: (update: (entries: CatalogEntries) => Map<string, CatalogEntry>) => void
  // The catalog's adjustment in basis points, for the prices it doesn't fix.
  adjustment: number
  includeNewProducts: boolean
  onIncludeNewProductsChange: (include: boolean) => void
  // Searching and paging, without anything that changes the catalog.
  readOnly: boolean
}) {
  const [tab, setTab] = useState<"included" | "excluded" | "all">("included")
  const [query, setQuery] = useState("")
  const expanded = useSet<string>()
  const selected = useSet<string>()
  const [editing, setEditing] = useState<{ product: Product; variant: CatalogVariant } | null>(null)
  const t = useTranslations("supplier.catalogEditor")
  const shared = useTranslations("supplier.shared")
  const rulesSummary = useRulesSummary()

  const included = (product: Product) => product.variants.some((variant) => entries.has(variant.id))
  const shown = products.filter(
    (product) =>
      (tab === "all" || (tab === "included") === included(product)) &&
      matches(query, product.title, ...product.variants.flatMap((variant) => [variant.supplierSku, variant.label]))
  )
  const paged = usePagedRows(shown, pageSize)
  const chosen = paged.rows.filter((product) => selected.has(product.id))
  const includedCount = products.filter(included).length
  const selectedProducts = products.filter((row) => selected.has(row.id))

  // Each entry of these products' variants, changed.
  function changeEntries(list: Product[], change: (copy: Map<string, CatalogEntry>, variantId: string) => void) {
    onEntriesChange((current) => {
      const copy = new Map(current)
      for (const variant of list.flatMap((product) => product.variants)) {
        change(copy, variant.id)
      }
      return copy
    })
    selected.clear()
  }

  function include(list: Product[], value: boolean) {
    changeEntries(list, (copy, variantId) => {
      if (value && !copy.has(variantId)) {
        copy.set(variantId, emptyEntry)
      } else if (!value) {
        copy.delete(variantId)
      }
    })
  }

  function clearOverrides(list: Product[]) {
    changeEntries(list, (copy, variantId) => {
      if (copy.has(variantId)) {
        copy.set(variantId, emptyEntry)
      }
    })
  }

  // Fixes the price of the variants the catalog includes among these, or with null returns them to adjusted prices.
  function setPrices(variantIds: string[], priceMinor: number | null) {
    onEntriesChange((current) => {
      const copy = new Map(current)
      for (const variantId of variantIds) {
        const entry = copy.get(variantId)
        if (entry) {
          copy.set(variantId, { ...entry, priceMinor })
        }
      }
      return copy
    })
  }

  // The price customers pay for a variant: its fixed price, or its own adjusted.
  const pricing = (variant: CatalogVariant) => catalogPricing(variant, adjustment, entries.get(variant.id) ?? null)

  // A product's prices on its own row, all its variants at once, or one variant's on the variant's row.
  function priceCell(product: Product, variants: CatalogVariant[]) {
    const label = variants.length === 1 ? variants[0]!.label : null
    return (
      <CatalogPriceCell
        name={label ? `${product.title}, ${label}` : product.title}
        variants={variants}
        entries={entries}
        adjustment={adjustment}
        readOnly={readOnly}
        onChange={setPrices}
      />
    )
  }

  function rulesCell(product: Product, variant: CatalogVariant) {
    const entry = entries.get(variant.id)
    const effective = pricing(variant)
    const summary = rulesSummary(effective.priceBreaks, effective.quantityRules, variant.priceBasis)
    const own = !!entry && (entry.priceBreaks !== null || entry.quantityRules !== null)
    const name = variant.label ? `${product.title}, ${variant.label}` : product.title
    if (readOnly) {
      return summary ? <span className="text-muted-foreground">{summary}</span> : <NoValue />
    }
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={!entry}
        aria-label={summary ? t("rulesForSummary", { name, summary }) : t("rulesFor", { name })}
        className="max-w-56 justify-start text-start text-muted-foreground"
        onClick={() => setEditing({ product, variant })}
      >
        <SlidersHorizontal data-icon="inline-start" className={cn(own && "text-primary")} />
        <span className="truncate">{summary || t("addRules")}</span>
      </Button>
    )
  }

  const editingEntry = editing ? entries.get(editing.variant.id) : undefined
  const editingPricing = editing ? pricing(editing.variant) : null

  return (
    <FlushCard className="@container">
      <div className="flex flex-col gap-3 border-b p-4">
        {/* The switch moves under the title when the two don't fit on one line, instead of squeezing its label. */}
        <CardHeader className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-0">
          <CardTitle>{t("products")}</CardTitle>
          <div className="flex items-center gap-2 text-sm">
            <Switch
              id="catalog-include-new"
              aria-labelledby="catalog-include-new-label"
              disabled={readOnly}
              checked={includeNewProducts}
              onCheckedChange={onIncludeNewProductsChange}
            />
            <label id="catalog-include-new-label" htmlFor="catalog-include-new">
              {t("includeNew")}
            </label>
          </div>
        </CardHeader>
        <IndexToolbar
          tabs={[
            { value: "included", label: t("included"), count: includedCount },
            { value: "excluded", label: t("excluded"), count: products.length - includedCount },
            { value: "all", label: shared("all"), count: products.length }
          ]}
          tab={tab}
          onTabChange={(value) => {
            setTab(value)
            paged.reset()
            selected.clear()
          }}
          query={query}
          onQueryChange={(value) => {
            setQuery(value)
            paged.reset()
          }}
          placeholder={t("searchProducts")}
        />
        <SelectionBar count={selected.size}>
          <Button size="sm" variant="outline" onClick={() => include(selectedProducts, true)}>
            {t("include")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => include(selectedProducts, false)}>
            {t("exclude")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => clearOverrides(selectedProducts)}>
            {t("clearOverrides")}
          </Button>
        </SelectionBar>
      </div>
      {paged.rows.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              {!readOnly && (
                <TableHead className="w-10 ps-4">
                  <Checkbox
                    aria-label={shared("selectAllOnPage")}
                    checked={chosen.length > 0 && chosen.length === paged.rows.length}
                    indeterminate={chosen.length > 0 && chosen.length < paged.rows.length}
                    onCheckedChange={(checked) => {
                      if (!checked) {
                        selected.clear()
                        return
                      }
                      for (const row of paged.rows) {
                        selected.add(row.id)
                      }
                    }}
                  />
                </TableHead>
              )}
              <TableHead>{t("columns.product")}</TableHead>
              <TableHead className={cn("text-end", columns.price)}>{t("columns.price")}</TableHead>
              <TableHead className={columns.rules}>{t("columns.rules")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.rows.map((product) => {
              const single = product.variants.length === 1 ? product.variants[0]! : null
              const open = expanded.has(product.id)
              const isIncluded = included(product)
              return [
                <TableRow key={product.id} data-state={selected.has(product.id) ? "selected" : undefined}>
                  {!readOnly && (
                    <TableCell className="ps-4">
                      <Checkbox
                        aria-label={shared("select", { name: product.title })}
                        checked={selected.has(product.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            selected.add(product.id)
                          } else {
                            selected.delete(product.id)
                          }
                        }}
                      />
                    </TableCell>
                  )}
                  <TableCell className={cn("whitespace-normal", readOnly && "ps-4")}>
                    <div className="flex items-center gap-3">
                      <ProductThumb
                        url={product.image && imageUrl(product.image)}
                        className={cn("hidden @sm:flex", !isIncluded && "opacity-50")}
                      />
                      <div className="min-w-0">
                        <p className={cn("line-clamp-2 font-medium", !isIncluded && "text-muted-foreground")}>
                          {product.title}
                        </p>
                        {single ? (
                          <p className="text-xs text-muted-foreground">{single.supplierSku}</p>
                        ) : (
                          <button
                            type="button"
                            aria-expanded={open}
                            className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              if (open) {
                                expanded.delete(product.id)
                              } else {
                                expanded.add(product.id)
                              }
                            }}
                          >
                            {shared("variantCount", { count: product.variants.length })}
                            <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
                          </button>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className={cn("text-end", columns.price)}>
                    {priceCell(product, product.variants)}
                  </TableCell>
                  <TableCell className={columns.rules}>
                    {single ? (
                      rulesCell(product, single)
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {product.variants.some((variant) => overridden(entries.get(variant.id)))
                          ? t("setPerVariant")
                          : ""}
                      </span>
                    )}
                  </TableCell>
                </TableRow>,
                ...(open && !single
                  ? product.variants.map((variant) => (
                      <TableRow key={variant.id} className="bg-muted/20">
                        {!readOnly && <TableCell className="ps-4" />}
                        <TableCell className="ps-6 whitespace-normal @sm:ps-14">
                          <p className={cn(!entries.has(variant.id) && "text-muted-foreground")}>
                            {variant.label ?? variant.supplierSku}
                          </p>
                          <p className="text-xs text-muted-foreground">{variant.supplierSku}</p>
                        </TableCell>
                        <TableCell className={cn("text-end", columns.price)}>{priceCell(product, [variant])}</TableCell>
                        <TableCell className={columns.rules}>{rulesCell(product, variant)}</TableCell>
                      </TableRow>
                    ))
                  : [])
              ]
            })}
          </TableBody>
        </Table>
      ) : (
        <EmptyState
          title={products.length ? t("noProductsHere") : t("noProductsYet")}
          description={products.length ? shared("tryAnother") : t("addProductsFirst")}
        />
      )}
      {paged.pager.pages > 1 && (
        <div className="border-t p-4">
          <Pager {...paged.pager} />
        </div>
      )}

      {editing && editingPricing && (
        <PricingRulesDialog
          open
          onOpenChange={(open) => !open && setEditing(null)}
          title={editing.variant.label ? `${editing.product.title}, ${editing.variant.label}` : editing.product.title}
          currency={editing.variant.currency}
          basis={editing.variant.priceBasis}
          priceMinor={editingPricing.priceMinor}
          priceBreaks={editingPricing.priceBreaks}
          quantityRules={editingPricing.quantityRules}
          inherited={
            editingEntry && (editingEntry.priceBreaks !== null || editingEntry.quantityRules !== null)
              ? { priceBreaks: editing.variant.priceBreaks, quantityRules: editing.variant.quantityRules }
              : undefined
          }
          onSave={(value) => {
            // Done without changes keeps following the product.
            const same =
              value &&
              JSON.stringify(value) ===
                JSON.stringify({
                  priceBreaks: editingPricing.priceBreaks,
                  quantityRules: editingPricing.quantityRules
                })
            if (!same) {
              const variantId = editing.variant.id
              const next = value ?? { priceBreaks: null, quantityRules: null }
              onEntriesChange((current) =>
                new Map(current).set(variantId, { ...(current.get(variantId) ?? emptyEntry), ...next })
              )
            }
          }}
        />
      )}
    </FlushCard>
  )
}
