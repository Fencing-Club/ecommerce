"use client"

import { money } from "@repo/aisle"
import { ChevronDown, ChevronRight, Download, Ellipsis, SlidersHorizontal, Trash2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { EmptyState } from "@/components/common"
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
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { adjustPrice, type CatalogEntry, catalogPricing } from "@/lib/catalog-pricing"
import { cn } from "@/lib/utils"
import type { CatalogEditorData } from "@/server/catalogs"
import { MoneyInput, moneyText, PricingRulesDialog, rulesSummary } from "./pricing-controls"
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

const statusOptions = [
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" }
]
const directionOptions = [
  { value: "decrease", label: "Decrease" },
  { value: "increase", label: "Increase" }
]
const pageSize = 25
const emptyEntry: CatalogEntry = { priceMinor: null, priceBreaks: null, quantityRules: null }

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

function adjustmentHelp(bps: number | null, direction: Settings["direction"]) {
  if (bps === null) {
    return direction === "decrease" ? "Enter 0 to 100." : "Enter 0 to 1,000."
  }
  const rule = "Applies to every price you don’t fix below."
  return bps ? `${rule} ${money(10_000)} becomes ${money(adjustPrice(10_000, bps))}.` : rule
}

function overridden(entry: CatalogEntry | undefined) {
  return !!entry && (entry.priceMinor !== null || entry.priceBreaks !== null || entry.quantityRules !== null)
}

// A catalog's form, laid out like Shopify's: its title, status and customers; its pricing; and its products, where
// each variant can have a fixed price, volume pricing and quantity rules of its own.
export function CatalogEditor({ data }: { data: CatalogEditorData }) {
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
      setError("Add a title")
      return
    }
    if (bps === null) {
      setError(settings.direction === "decrease" ? "Decrease by 0 to 100%" : "Increase by 0 to 1,000%")
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
        throw new Error(result.error ?? "Couldn't save the catalog. Try again.")
      }
      setSaved({ settings, entries })
      if (catalog) {
        router.refresh()
      } else {
        router.replace(`/catalogs/${result.id}`)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save the catalog. Try again.")
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
      setError((await response.json()).error ?? "Couldn't delete the catalog. Try again.")
      setPending(false)
      setConfirmDelete(false)
    }
  }

  // The price customers pay for a variant: its fixed price, or its own adjusted.
  const pricing = (variant: Variant) => catalogPricing(variant, adjustment, entries.get(variant.id) ?? null)

  function priceCell(product: Product, variant: Variant) {
    const entry = entries.get(variant.id)
    const adjusted = variant.priceMinor === null ? null : adjustPrice(variant.priceMinor, adjustment)
    return (
      <MoneyInput
        value={entry?.priceMinor ?? null}
        onValueChange={(value) => setEntry(variant.id, { priceMinor: value })}
        currency={variant.currency}
        placeholder={adjusted === null ? "No price" : moneyText(adjusted)}
        label={`Price for ${variant.label ? `${product.title}, ${variant.label}` : product.title}`}
        disabled={!entry}
        className={cn("w-32", entry?.priceMinor !== null && entry && "border-primary/60")}
      />
    )
  }

  function rulesCell(product: Product, variant: Variant) {
    const entry = entries.get(variant.id)
    const effective = pricing(variant)
    const summary = rulesSummary(effective.priceBreaks, effective.quantityRules, variant.priceBasis)
    const own = !!entry && (entry.priceBreaks !== null || entry.quantityRules !== null)
    const label = `Quantity rules and volume pricing for ${variant.label ? `${product.title}, ${variant.label}` : product.title}`
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={!entry}
        aria-label={summary ? `${label}: ${summary}` : label}
        className="max-w-56 justify-start text-left text-muted-foreground"
        onClick={() => setEditing({ product, variant })}
      >
        <SlidersHorizontal data-icon="inline-start" className={cn(own && "text-primary")} />
        <span className="truncate">{summary || "Add"}</span>
      </Button>
    )
  }

  const editingEntry = editing ? entries.get(editing.variant.id) : undefined
  const editingPricing = editing ? pricing(editing.variant) : null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link href="/catalogs" className="text-sm text-muted-foreground hover:text-foreground">
            Catalogs
          </Link>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {catalog ? saved.settings.title : "New catalog"}
          </h1>
          {catalog && <StatusBadge status={saved.settings.status} />}
        </div>
        {catalog && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="More actions" />}>
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                disabled={dirty}
                render={
                  <a href={`/api/catalogs/${catalog.id}/export?format=xlsx`} download aria-label="Export to Excel" />
                }
              >
                <Download />
                Export to Excel
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={dirty}
                render={
                  <a href={`/api/catalogs/${catalog.id}/export?format=pdf`} download aria-label="Export to PDF" />
                }
              >
                <Download />
                Export to PDF
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 />
                Delete catalog
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <Field>
              <FieldLabel htmlFor="catalog-title">
                <span>
                  Title
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
              <FieldLabel htmlFor="catalog-status">Status</FieldLabel>
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
            <FieldLabel>Customers</FieldLabel>
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
                          placeholder={value.length ? "" : "Add customers"}
                          aria-label="Add customers"
                        />
                      </>
                    )}
                  </ComboboxValue>
                </ComboboxChips>
                <ComboboxContent anchor={anchor}>
                  <ComboboxEmpty>No customers found.</ComboboxEmpty>
                  <ComboboxList>
                    {(customer: (typeof customers)[number]) => (
                      <ComboboxItem key={customer.id} value={customer}>
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate">{customer.name}</span>
                          {customer.otherCatalog && (
                            <span className="truncate text-xs text-muted-foreground">
                              Moves from {customer.otherCatalog}
                            </span>
                          )}
                        </span>
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            ) : (
              <FieldDescription>Customers appear once a buyer adds you as their supplier.</FieldDescription>
            )}
            {settings.status !== "active" && settings.customerIds.length > 0 && (
              <FieldDescription>
                Customers see every active product at its own price until the catalog is active.
              </FieldDescription>
            )}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
        </CardHeader>
        <CardContent>
          <Field>
            <FieldLabel htmlFor="catalog-adjustment">Price adjustment</FieldLabel>
            <div className="flex flex-wrap items-center gap-2">
              <InputGroup className="w-32">
                <InputGroupAddon>
                  <InputGroupText>{settings.direction === "decrease" ? "−" : "+"}</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  id="catalog-adjustment"
                  inputMode="decimal"
                  value={settings.percent}
                  aria-invalid={bps === null || undefined}
                  className="text-right tabular-nums"
                  onChange={(event) => change({ percent: event.target.value })}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>%</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <Select
                items={directionOptions}
                value={settings.direction}
                onValueChange={(value) => value && change({ direction: value as Settings["direction"] })}
              >
                <SelectTrigger aria-label="Adjustment direction" className="w-32">
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
            </div>
            <FieldDescription>{adjustmentHelp(bps, settings.direction)}</FieldDescription>
          </Field>
        </CardContent>
      </Card>

      <Card className="gap-3">
        <CardHeader>
          <CardTitle>Products</CardTitle>
          <CardAction>
            <div className="flex items-center gap-2 text-sm">
              <Switch
                id="catalog-include-new"
                checked={settings.includeNewProducts}
                onCheckedChange={(checked) => change({ includeNewProducts: checked })}
              />
              <label htmlFor="catalog-include-new">Automatically include new products</label>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent className="@container flex flex-col gap-3">
          <IndexToolbar
            tabs={[
              { value: "included", label: "Included", count: includedCount },
              { value: "excluded", label: "Excluded", count: products.length - includedCount },
              { value: "all", label: "All", count: products.length }
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
            placeholder="Search products"
          />
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              <span className="font-medium">{selected.size} selected</span>
              <div className="ml-auto flex flex-wrap gap-2">
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
                  Include
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
                  Exclude
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => clearOverrides(products.filter((row) => selected.has(row.id)))}
                >
                  Clear price overrides
                </Button>
              </div>
            </div>
          )}
          {rows.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label="Select all products on this page"
                      checked={chosen.length > 0 && chosen.length === rows.length}
                      indeterminate={chosen.length > 0 && chosen.length < rows.length}
                      onCheckedChange={(checked) =>
                        setSelected(checked ? new Set([...selected, ...rows.map((row) => row.id)]) : new Set())
                      }
                    />
                  </TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="w-36">Price</TableHead>
                  <TableHead className="hidden @2xl:table-cell">Rules</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((product) => {
                  const single = product.variants.length === 1 ? product.variants[0]! : null
                  const open = expanded.has(product.id)
                  const isIncluded = included(product)
                  const prices = product.variants.flatMap((variant) => {
                    const price = pricing(variant).priceMinor
                    return price === null ? [] : [price]
                  })
                  const currency = product.variants[0]!.currency
                  return [
                    <TableRow key={product.id} data-state={selected.has(product.id) ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox
                          aria-label={`Select ${product.title}`}
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
                      <TableCell className="max-w-96">
                        <div className="flex items-center gap-3">
                          <ProductThumb image={product.image} className={cn(!isIncluded && "opacity-50")} />
                          <div className="min-w-0">
                            <p className={cn("truncate font-medium", !isIncluded && "text-muted-foreground")}>
                              {product.title}
                            </p>
                            {single ? (
                              <p className="truncate text-xs text-muted-foreground">{single.supplierSku}</p>
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
                                {product.variants.length} variants
                                <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
                              </button>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {single ? (
                          priceCell(product, single)
                        ) : (
                          <span className={cn("tabular-nums", !isIncluded && "text-muted-foreground")}>
                            {prices.length
                              ? `${money(Math.min(...prices), currency)}${
                                  Math.max(...prices) === Math.min(...prices)
                                    ? ""
                                    : ` – ${money(Math.max(...prices), currency)}`
                                }`
                              : "No price"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden @2xl:table-cell">
                        {single ? (
                          rulesCell(product, single)
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {product.variants.some((variant) => overridden(entries.get(variant.id)))
                              ? "Set per variant"
                              : ""}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>,
                    ...(open && !single
                      ? product.variants.map((variant) => (
                          <TableRow key={variant.id} className="bg-muted/20">
                            <TableCell />
                            <TableCell className="max-w-96 pl-14">
                              <p className={cn("truncate", !entries.has(variant.id) && "text-muted-foreground")}>
                                {variant.label ?? variant.supplierSku}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">{variant.supplierSku}</p>
                            </TableCell>
                            <TableCell>{priceCell(product, variant)}</TableCell>
                            <TableCell className="hidden @2xl:table-cell">{rulesCell(product, variant)}</TableCell>
                          </TableRow>
                        ))
                      : [])
                  ]
                })}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title={products.length ? "No products here" : "No products yet"}
              description={products.length ? "Try another tab or search." : "Add products before building a catalog."}
            />
          )}
          <Pager page={current} pages={pages} total={shown.length} size={pageSize} onPage={setPage} />
        </CardContent>
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
            <AlertDialogTitle>Delete {saved.settings.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its customers will see every active product at its own price. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={() => void remove()}>
              Delete catalog
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
