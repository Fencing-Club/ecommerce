"use client"

import { ChevronDown, Download, Ellipsis, Pencil, SlidersHorizontal, Trash2 } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { useId, useState } from "react"
import { EmptyState, PageHeader } from "@/components/common"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor
} from "@/components/ui/combobox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useMoney } from "@/hooks/use-money"
import { adjustPrice, type CatalogEntry, catalogPricing } from "@/lib/catalog-pricing"
import { cn } from "@/lib/utils"
import type { CatalogEditorData } from "@/server/catalogs"
import { currencySymbol, moneyText, parseMoney, PricingRulesDialog, useRulesSummary } from "./pricing-controls"
import { IndexToolbar, matches, Pager, ProductThumb, SaveBar, StatusBadge } from "./shared"

type Product = CatalogEditorData["products"][number]
type Variant = Product["variants"][number]
type Status = "active" | "draft" | "archived"
type Settings = {
  title: string
  status: Status
  direction: "decrease" | "increase"
  percent: string
  includeNewProducts: boolean
  customerIds: string[]
}

const statuses = ["active", "draft", "archived"] as const
// Read with the percentage after it, as one phrase: Decrease by 10%.
const directions = ["decrease", "increase"] as const
const pageSize = 25
const emptyEntry: CatalogEntry = { priceMinor: null, priceBreaks: null, quantityRules: null }
// The products table runs edge to edge in its card. On a narrow card the rules hide, and the price ends each row.
const columns = {
  price: "@max-2xl:pe-4",
  rules: "hidden pe-4 @2xl:table-cell"
}

function initialSettings(catalog: CatalogEditorData["catalog"], customers: CatalogEditorData["customers"]): Settings {
  const bps = catalog?.adjustmentBasisPoints ?? 0
  return {
    title: catalog?.title ?? "",
    status: catalog?.status ?? "active",
    direction: bps > 0 ? "increase" : "decrease",
    percent: bps ? String(Math.abs(bps) / 100) : "0",
    includeNewProducts: catalog?.includeNewProducts ?? true,
    customerIds: customers.filter((customer) => customer.assigned).map((customer) => customer.id)
  }
}

// The adjustment in basis points, or null when it isn't a valid percentage.
function basisPoints(settings: Settings) {
  const percent = Number(settings.percent.trim() || "0")
  if (
    !/^\d{0,4}(?:\.\d{0,2})?$/.test(settings.percent.trim()) ||
    percent > (settings.direction === "decrease" ? 100 : 1000)
  ) {
    return null
  }
  return Math.round(percent * 100) * (settings.direction === "decrease" ? -1 : 1)
}

function AdjustmentHelp({ bps, direction }: { bps: number | null; direction: Settings["direction"] }) {
  const t = useTranslations("supplier.catalogEditor")
  const money = useMoney()
  if (bps === null) {
    return t("enterRange", { max: direction === "decrease" ? 100 : 1000 })
  }
  return bps
    ? t("adjustmentExample", { before: money(10_000), after: money(adjustPrice(10_000, bps)) })
    : t("adjustmentRule")
}

function overridden(entry: CatalogEntry | undefined) {
  return !!entry && (entry.priceMinor !== null || entry.priceBreaks !== null || entry.quantityRules !== null)
}

// Prices as one amount or a range, or null for none.
function usePriceText() {
  const shared = useTranslations("supplier.shared")
  const money = useMoney()
  return (prices: number[], currency: string) => {
    if (!prices.length) {
      return null
    }
    const low = Math.min(...prices)
    const high = Math.max(...prices)
    return low === high
      ? money(low, currency)
      : shared("range", { low: money(low, currency), high: money(high, currency) })
  }
}

// What a fixed price replaces, the product's own price or the catalog's adjusted one, for one variant or several.
const basisText = {
  adjusted: {
    one: "adjustedPrice",
    several: "adjustedPrices",
    useOne: "useAdjustedPrice",
    useSeveral: "useAdjustedPrices"
  },
  product: { one: "productPrice", several: "productPrices", useOne: "useProductPrice", useSeveral: "useProductPrices" }
} as const

// Catalog prices as text: each variant's fixed price, or its own price moved by the catalog's adjustment. The button
// opens a field to fix the price of the row's variants, one or all of a product's, or to go back to adjusted prices. A
// product the catalog leaves out shows what its prices would be.
function PriceCell({
  name,
  variants,
  entries,
  adjustment,
  readOnly,
  onChange
}: {
  // The product, with the variant on a variant's row.
  name: string
  variants: Variant[]
  entries: Map<string, CatalogEntry>
  adjustment: number
  // Shows the price without the button that changes it.
  readOnly: boolean
  onChange: (variantIds: string[], priceMinor: number | null) => void
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const t = useTranslations("supplier.catalogEditor")
  const shared = useTranslations("supplier.shared")
  const locale = useLocale()
  const priceText = usePriceText()
  const currency = variants[0]!.currency
  if (variants.some((variant) => variant.currency !== currency)) {
    return <span className="text-muted-foreground">{t("severalCurrencies")}</span>
  }
  const included = variants.filter((variant) => entries.has(variant.id))
  const shown = priceText(
    (included.length ? included : variants).flatMap(
      (variant) => catalogPricing(variant, adjustment, entries.get(variant.id) ?? null).priceMinor ?? []
    ),
    currency
  )
  const fixed = included.flatMap((variant) => entries.get(variant.id)?.priceMinor ?? [])
  const allFixed = included.length > 0 && fixed.length === included.length
  const several = included.length > 1
  const basis = adjustment ? basisText.adjusted : basisText.product
  const adjusted = priceText(
    included.flatMap((variant) => (variant.priceMinor === null ? [] : [adjustPrice(variant.priceMinor, adjustment)])),
    currency
  )
  const typed = parseMoney(text)
  if (readOnly) {
    return (
      <span className="tabular-nums">
        {allFixed && <span className="me-1.5 text-xs text-muted-foreground">{t("fixed")}</span>}
        {shown ?? <span className="text-muted-foreground">{shared("noPrice")}</span>}
      </span>
    )
  }

  function commit(priceMinor: number | null) {
    onChange(
      included.map((variant) => variant.id),
      priceMinor
    )
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          // A fixed price every variant here shares fills the field; mixed or no fixed prices leave it blank.
          setText(allFixed && new Set(fixed).size === 1 ? moneyText(fixed[0]) : "")
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            disabled={!included.length}
            aria-label={t(allFixed ? "fixedPriceFor" : "priceFor", { name, price: shown ?? t("noPriceLower") })}
            className="-me-2 font-normal tabular-nums"
          />
        }
      >
        {allFixed && <span className="text-xs text-muted-foreground">{t("fixed")}</span>}
        {shown ?? <span className="text-muted-foreground">{shared("noPrice")}</span>}
        <Pencil data-icon="inline-end" className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (typed !== undefined) {
              commit(typed)
            }
          }}
        >
          <Field>
            <FieldLabel htmlFor={id}>{t("fixedPrice", { count: included.length })}</FieldLabel>
            <InputGroup>
              <InputGroupAddon>
                <InputGroupText>{currencySymbol(currency, locale)}</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                id={id}
                inputMode="decimal"
                autoComplete="off"
                value={text}
                aria-invalid={typed === undefined || undefined}
                className="text-end tabular-nums"
                onChange={(event) => setText(event.target.value)}
              />
            </InputGroup>
            <FieldDescription>
              {adjusted ? t(several ? basis.several : basis.one, { prices: adjusted }) : t("noProductPrice")}
            </FieldDescription>
          </Field>
          <div className="flex flex-wrap justify-end gap-2">
            {fixed.length > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => commit(null)}>
                {t(several ? basis.useSeveral : basis.useOne)}
              </Button>
            )}
            <Button type="submit" size="sm" disabled={typed === undefined}>
              {shared("done")}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}

// A catalog's form, laid out like Shopify's: its title, status and customers; its pricing; and its products, where
// each variant can have a fixed price, volume pricing and quantity rules of its own.
export function CatalogEditor({
  data,
  readOnly = false
}: {
  data: CatalogEditorData
  // For someone who can only view catalogs: the catalog shows as it's saved, with its searching and paging but nothing
  // that changes it.
  readOnly?: boolean
}) {
  const router = useRouter()
  const { catalog, products, customers } = data
  const [saved, setSaved] = useState(() => ({
    settings: initialSettings(catalog, customers),
    // A new catalog starts with every product, as Shopify's does.
    entries: new Map<string, CatalogEntry>(
      catalog
        ? data.entries.map(({ productId, ...entry }) => [productId, entry])
        : products.flatMap((product) => product.variants.map((variant) => [variant.id, emptyEntry] as const))
    )
  }))
  const [settings, setSettings] = useState(saved.settings)
  const [entries, setEntries] = useState(saved.entries)
  const [tab, setTab] = useState<"included" | "excluded" | "all">("included")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<{ product: Product; variant: Variant } | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [confirmDelete, setConfirmDelete] = useState(false)
  const anchor = useComboboxAnchor()
  const t = useTranslations("supplier.catalogEditor")
  const shared = useTranslations("supplier.shared")
  const rulesSummary = useRulesSummary()
  const statusOptions = statuses.map((value) => ({ value, label: shared(`status.${value}`) }))
  const directionOptions = directions.map((value) => ({
    value,
    label: value === "decrease" ? t("decreaseBy") : t("increaseBy")
  }))

  const bps = basisPoints(settings)
  const adjustment = bps ?? 0
  const dirty =
    JSON.stringify(settings) !== JSON.stringify(saved.settings) ||
    JSON.stringify([...entries].toSorted()) !== JSON.stringify([...saved.entries].toSorted())
  const included = (product: Product) => product.variants.some((variant) => entries.has(variant.id))
  const shown = products.filter(
    (product) =>
      (tab === "all" || (tab === "included") === included(product)) &&
      matches(query, product.title, ...product.variants.flatMap((variant) => [variant.supplierSku, variant.label]))
  )
  const pages = Math.max(1, Math.ceil(shown.length / pageSize))
  const current = Math.min(page, pages - 1)
  const rows = shown.slice(current * pageSize, (current + 1) * pageSize)
  const chosen = rows.filter((product) => selected.has(product.id))
  const includedCount = products.filter(included).length

  function change(next: Partial<Settings>) {
    setSettings((currentSettings) => ({ ...currentSettings, ...next }))
  }

  function setEntry(variantId: string, next: Partial<CatalogEntry>) {
    setEntries((currentEntries) => {
      const copy = new Map(currentEntries)
      copy.set(variantId, { ...(copy.get(variantId) ?? emptyEntry), ...next })
      return copy
    })
  }

  function include(list: Product[], value: boolean) {
    setEntries((currentEntries) => {
      const copy = new Map(currentEntries)
      for (const product of list) {
        for (const variant of product.variants) {
          if (value && !copy.has(variant.id)) {
            copy.set(variant.id, emptyEntry)
          } else if (!value) {
            copy.delete(variant.id)
          }
        }
      }
      return copy
    })
    setSelected(new Set())
  }

  function clearOverrides(list: Product[]) {
    setEntries((currentEntries) => {
      const copy = new Map(currentEntries)
      for (const variant of list.flatMap((product) => product.variants)) {
        if (copy.has(variant.id)) {
          copy.set(variant.id, emptyEntry)
        }
      }
      return copy
    })
    setSelected(new Set())
  }

  async function save() {
    if (!settings.title.trim()) {
      setError(t("addTitle"))
      return
    }
    if (bps === null) {
      setError(settings.direction === "decrease" ? t("decreaseRange") : t("increaseRange"))
      return
    }
    setPending(true)
    setError("")
    try {
      const response = await fetch("/api/catalogs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(catalog && { id: catalog.id, revision: catalog.revision }),
          title: settings.title.trim(),
          status: settings.status,
          adjustmentBasisPoints: bps,
          includeNewProducts: settings.includeNewProducts,
          customerIds: settings.customerIds,
          products: [...entries].map(([productId, entry]) => ({ productId, ...entry }))
        })
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error ?? t("saveFailed"))
      }
      setSaved({ settings, entries })
      if (catalog) {
        router.refresh()
      } else {
        router.replace(`/catalogs/${result.id}`)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("saveFailed"))
    } finally {
      setPending(false)
    }
  }

  async function remove() {
    if (!catalog) {
      return
    }
    setPending(true)
    const response = await fetch(`/api/catalogs/${catalog.id}`, { method: "DELETE" })
    if (response.ok) {
      setSaved({ settings, entries })
      router.push("/catalogs")
      router.refresh()
    } else {
      setError((await response.json()).error ?? t("deleteFailed"))
      setPending(false)
      setConfirmDelete(false)
    }
  }

  // The price customers pay for a variant: its fixed price, or its own adjusted.
  const pricing = (variant: Variant) => catalogPricing(variant, adjustment, entries.get(variant.id) ?? null)

  // Fixes the price of the variants the catalog includes among these, or with null returns them to adjusted prices.
  function setPrices(variantIds: string[], priceMinor: number | null) {
    setEntries((currentEntries) => {
      const copy = new Map(currentEntries)
      for (const variantId of variantIds) {
        const entry = copy.get(variantId)
        if (entry) {
          copy.set(variantId, { ...entry, priceMinor })
        }
      }
      return copy
    })
  }

  // A product's prices on its own row, all its variants at once, or one variant's on the variant's row.
  function priceCell(product: Product, variants: Variant[]) {
    const label = variants.length === 1 ? variants[0]!.label : null
    return (
      <PriceCell
        name={label ? `${product.title}, ${label}` : product.title}
        variants={variants}
        entries={entries}
        adjustment={adjustment}
        readOnly={readOnly}
        onChange={setPrices}
      />
    )
  }

  function rulesCell(product: Product, variant: Variant) {
    const entry = entries.get(variant.id)
    const effective = pricing(variant)
    const summary = rulesSummary(effective.priceBreaks, effective.quantityRules, variant.priceBasis)
    const own = !!entry && (entry.priceBreaks !== null || entry.quantityRules !== null)
    const label = t("rulesFor", { name: variant.label ? `${product.title}, ${variant.label}` : product.title })
    if (readOnly) {
      return <span className="text-muted-foreground">{summary || "—"}</span>
    }
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={!entry}
        aria-label={
          summary
            ? t("rulesForSummary", {
                name: variant.label ? `${product.title}, ${variant.label}` : product.title,
                summary
              })
            : label
        }
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

  // The header row stands alone beside the sidebar's button; the form and its save bar follow it, so the bar stays in
  // view while any part of the form does.
  return (
    <>
      <PageHeader
        parents={[{ label: t("catalogs"), href: "/catalogs" }]}
        title={catalog ? saved.settings.title : t("newCatalog")}
        badge={catalog ? <StatusBadge status={saved.settings.status} /> : undefined}
      >
        {catalog && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label={shared("moreActions")} />}>
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                disabled={dirty}
                render={
                  <a
                    href={`/api/catalogs/${catalog.id}/export?format=xlsx`}
                    download
                    aria-label={shared("exportExcel")}
                  />
                }
              >
                <Download />
                {shared("exportExcel")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={dirty}
                render={
                  <a href={`/api/catalogs/${catalog.id}/export?format=pdf`} download aria-label={t("exportPdf")} />
                }
              >
                <Download />
                {t("exportPdf")}
              </DropdownMenuItem>
              {!readOnly && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
                    <Trash2 />
                    {t("delete")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </PageHeader>
      <div className="flex flex-col gap-4">
        <fieldset disabled={readOnly} className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
                <Field>
                  <FieldLabel htmlFor="catalog-title">
                    <span>
                      {t("title")}
                      <span aria-hidden className="text-destructive">
                        *
                      </span>
                    </span>
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id="catalog-title"
                      required
                      maxLength={255}
                      value={settings.title}
                      onChange={(event) => change({ title: event.target.value })}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupText className="tabular-nums">{settings.title.length}/255</InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                </Field>
                <Field>
                  <FieldLabel htmlFor="catalog-status">{t("status")}</FieldLabel>
                  <Select
                    items={statusOptions}
                    value={settings.status}
                    onValueChange={(value) => value && change({ status: value as Status })}
                  >
                    <SelectTrigger id="catalog-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field>
                <FieldLabel>{t("customers")}</FieldLabel>
                {customers.length ? (
                  <Combobox
                    items={customers}
                    multiple
                    value={customers.filter((customer) => settings.customerIds.includes(customer.id))}
                    onValueChange={(value) => change({ customerIds: value.map((customer) => customer.id) })}
                    itemToStringLabel={(customer) => customer.name}
                    isItemEqualToValue={(item, value) => item.id === value.id}
                  >
                    <ComboboxChips ref={anchor}>
                      <ComboboxValue>
                        {(value: typeof customers) => (
                          <>
                            {value.map((customer) => (
                              <ComboboxChip key={customer.id}>{customer.name}</ComboboxChip>
                            ))}
                            <ComboboxChipsInput
                              placeholder={value.length ? "" : t("addCustomers")}
                              aria-label={t("addCustomers")}
                            />
                          </>
                        )}
                      </ComboboxValue>
                    </ComboboxChips>
                    <ComboboxContent anchor={anchor}>
                      <ComboboxEmpty>{t("noCustomersFound")}</ComboboxEmpty>
                      <ComboboxList>
                        {(customer: (typeof customers)[number]) => (
                          <ComboboxItem key={customer.id} value={customer}>
                            <span className="flex min-w-0 flex-col">
                              <span className="truncate">{customer.name}</span>
                              {customer.otherCatalog && (
                                <span className="truncate text-xs text-muted-foreground">
                                  {t("movesFrom", { catalog: customer.otherCatalog })}
                                </span>
                              )}
                            </span>
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                ) : (
                  <FieldDescription>{t("customersAppear")}</FieldDescription>
                )}
                {settings.status !== "active" && settings.customerIds.length > 0 && (
                  <FieldDescription>{t("inactiveNote")}</FieldDescription>
                )}
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("pricing")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Field>
                <FieldLabel htmlFor="catalog-adjustment">{t("priceAdjustment")}</FieldLabel>
                {/* One phrase: Decrease by 10%. */}
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    items={directionOptions}
                    value={settings.direction}
                    onValueChange={(value) => value && change({ direction: value as Settings["direction"] })}
                  >
                    <SelectTrigger aria-label={t("adjustmentDirection")} className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {directionOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <InputGroup className="w-24">
                    <InputGroupInput
                      id="catalog-adjustment"
                      inputMode="decimal"
                      value={settings.percent}
                      aria-invalid={bps === null || undefined}
                      className="text-end tabular-nums"
                      onChange={(event) => change({ percent: event.target.value })}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupText>%</InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                </div>
                <FieldDescription>
                  <AdjustmentHelp bps={bps} direction={settings.direction} />
                </FieldDescription>
              </Field>
            </CardContent>
          </Card>
        </fieldset>

        <Card className="@container gap-0 py-0">
          <div className="flex flex-col gap-3 border-b p-4">
            {/* The switch moves under the title when the two don't fit on one line, instead of squeezing its label. */}
            <CardHeader className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-0">
              <CardTitle>{t("products")}</CardTitle>
              <div className="flex items-center gap-2 text-sm">
                <Switch
                  id="catalog-include-new"
                  aria-labelledby="catalog-include-new-label"
                  disabled={readOnly}
                  checked={settings.includeNewProducts}
                  onCheckedChange={(checked) => change({ includeNewProducts: checked })}
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
                setPage(0)
                setSelected(new Set())
              }}
              query={query}
              onQueryChange={(value) => {
                setQuery(value)
                setPage(0)
              }}
              placeholder={t("searchProducts")}
            />
            {selected.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                <span className="font-medium">{shared("selected", { count: selected.size })}</span>
                <div className="ms-auto flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      include(
                        products.filter((row) => selected.has(row.id)),
                        true
                      )
                    }
                  >
                    {t("include")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      include(
                        products.filter((row) => selected.has(row.id)),
                        false
                      )
                    }
                  >
                    {t("exclude")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => clearOverrides(products.filter((row) => selected.has(row.id)))}
                  >
                    {t("clearOverrides")}
                  </Button>
                </div>
              </div>
            )}
          </div>
          {rows.length ? (
            <Table framed={false}>
              <TableHeader>
                <TableRow>
                  {!readOnly && (
                    <TableHead className="w-10 ps-4">
                      <Checkbox
                        aria-label={shared("selectAllOnPage")}
                        checked={chosen.length > 0 && chosen.length === rows.length}
                        indeterminate={chosen.length > 0 && chosen.length < rows.length}
                        onCheckedChange={(checked) =>
                          setSelected(checked ? new Set([...selected, ...rows.map((row) => row.id)]) : new Set())
                        }
                      />
                    </TableHead>
                  )}
                  <TableHead>{t("columns.product")}</TableHead>
                  <TableHead className={cn("text-end", columns.price)}>{t("columns.price")}</TableHead>
                  <TableHead className={columns.rules}>{t("columns.rules")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((product) => {
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
                              const next = new Set(selected)
                              if (checked) {
                                next.add(product.id)
                              } else {
                                next.delete(product.id)
                              }
                              setSelected(next)
                            }}
                          />
                        </TableCell>
                      )}
                      <TableCell className={cn("whitespace-normal", readOnly && "ps-4")}>
                        <div className="flex items-center gap-3">
                          <ProductThumb
                            image={product.image}
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
                                  const next = new Set(expanded)
                                  if (open) {
                                    next.delete(product.id)
                                  } else {
                                    next.add(product.id)
                                  }
                                  setExpanded(next)
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
                            <TableCell className={cn("text-end", columns.price)}>
                              {priceCell(product, [variant])}
                            </TableCell>
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
          {pages > 1 && (
            <div className="border-t p-4">
              <Pager page={current} pages={pages} total={shown.length} size={pageSize} onPage={setPage} />
            </div>
          )}
        </Card>

        <SaveBar
          dirty={dirty || !catalog}
          pending={pending}
          error={error}
          onDiscard={() => {
            if (!catalog) {
              router.push("/catalogs")
              return
            }
            setSettings(saved.settings)
            setEntries(saved.entries)
            setError("")
          }}
          onSave={() => void save()}
        />
      </div>

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
              setEntry(editing.variant.id, value ?? { priceBreaks: null, quantityRules: null })
            }
          }}
        />
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle", { title: saved.settings.title })}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{shared("cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={() => void remove()}>
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
