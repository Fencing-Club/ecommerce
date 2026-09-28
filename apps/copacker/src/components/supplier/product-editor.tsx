"use client"

import { Ellipsis, ImagePlus, Pencil, Plus, SlidersHorizontal, Star, Trash2, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { PageLink, useCan } from "@/components/access"
import { PageHeader } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { defaultQuantityRules, type PriceBasis, type PriceBreak, type QuantityRules } from "@/lib/catalog-pricing"
import { imageUrl, type ProductImage, variantLabel, variantsProblem } from "@/lib/supplier-product"
import { cn } from "@/lib/utils"
import { MoneyInput, PricingRulesDialog, rulesSummary } from "./pricing-controls"
import { SaveBar, StatusBadge } from "./shared"

const currencies = ["USD", "CNY", "EUR", "GBP", "CAD", "AUD"] as const
type Currency = (typeof currencies)[number]
const basisOptions = [
  { value: "piece", label: "Piece" },
  { value: "sellable_pack", label: "Pack" },
  { value: "case", label: "Case" }
]

export type EditorVariant = {
  key: string
  id?: string
  supplierSku: string
  options: Record<string, string>
  currency: Currency
  priceMinor: number | null
  priceBasis: PriceBasis
  piecesPerSellablePack: number
  sellablePacksPerCase: number | null
  trackInventory: boolean
  onHand: number
  continueSelling: boolean
  priceBreaks: PriceBreak[]
  quantityRules: QuantityRules
  notes: string
}
export type EditorProduct = {
  id?: string
  revision?: number
  title: string
  status: "active" | "archived"
  category: string
  productCode: string
  url: string
  description: string
  optionNames: string[]
  images: ProductImage[]
  variants: EditorVariant[]
}

let nextKey = 0
function newVariant(like?: EditorVariant): EditorVariant {
  nextKey += 1
  return {
    key: `new-${nextKey}`,
    supplierSku: "",
    options: {},
    currency: like?.currency ?? "USD",
    priceMinor: like?.priceMinor ?? null,
    priceBasis: like?.priceBasis ?? "piece",
    piecesPerSellablePack: like?.piecesPerSellablePack ?? 1,
    sellablePacksPerCase: like?.sellablePacksPerCase ?? null,
    trackInventory: like?.trackInventory ?? false,
    onHand: 0,
    continueSelling: like?.continueSelling ?? false,
    priceBreaks: [],
    quantityRules: defaultQuantityRules,
    notes: ""
  }
}

export function blankProduct(): EditorProduct {
  return {
    title: "",
    status: "active",
    category: "",
    productCode: "",
    url: "",
    description: "",
    optionNames: [],
    images: [],
    variants: [newVariant()]
  }
}

function whole(text: string, fallback: number | null) {
  const value = Number(text)
  return text.trim() && Number.isSafeInteger(value) ? value : fallback
}

function uploadLabel(uploading: number, count: number) {
  if (uploading) {
    return `Uploading ${uploading}`
  }
  return count ? "Add" : "Add photos"
}

// The variant grid scrolls sideways inside its card when it's wider than the card. Its first column and the row actions
// stay in view, on the card's own background so the columns scrolling past pass under them. Each cell draws its own
// rule, which a sticky cell would otherwise cover. On a narrow card the option columns hide, and the SKU leads.
const grid = {
  table: "border-separate border-spacing-0 [&_td]:border-b [&_th]:border-b [&_tr:last-child_td]:border-b-0",
  first: "sticky left-0 z-10 pl-4",
  firstWhenNarrow: "@max-xl:sticky @max-xl:left-0 @max-xl:z-10 @max-xl:pl-4",
  last: "sticky right-0 z-10 pr-4",
  option: "hidden @xl:table-cell"
}

// The width a field needs to show the longest of `lengths` characters whole, kept within `least` and `most`, with its
// padding.
function fieldWidth(lengths: number[], least: number, most: number) {
  return `calc(${Math.min(most, Math.max(least, ...lengths)) + 1}ch + 1.5rem)`
}

// Photos: upload several at once, remove one, or make one the main photo.
function Media({ images, onChange }: { images: ProductImage[]; onChange: (images: ProductImage[]) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(0)
  const [error, setError] = useState("")

  async function upload(files: FileList) {
    setError("")
    setUploading(files.length)
    const added: ProductImage[] = []
    for (const file of files) {
      const body = new FormData()
      body.set("file", file)
      const response = await fetch("/api/product-images", { method: "POST", body })
      const result = await response.json()
      if (response.ok) {
        added.push(result)
      } else {
        setError(`${file.name}: ${result.error ?? "Couldn't upload"}`)
      }
      setUploading((count) => count - 1)
    }
    onChange([...images, ...added])
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Media</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {images.map((image, index) => (
            <figure
              key={image.key}
              className={cn(
                "group relative aspect-square overflow-hidden rounded-lg border bg-muted/30",
                index === 0 && "col-span-2 row-span-2"
              )}
            >
              {/* Stored photos come from our own authenticated route. */}
              <img src={imageUrl(image)} alt={image.name} className="size-full object-contain" />
              <div className="absolute inset-x-1 top-1 flex justify-end gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                {index > 0 && (
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="secondary"
                    aria-label={`Make ${image.name} the main photo`}
                    onClick={() => onChange([image, ...images.filter((other) => other.key !== image.key)])}
                  >
                    <Star />
                  </Button>
                )}
                <Button
                  type="button"
                  size="icon-xs"
                  variant="secondary"
                  aria-label={`Remove ${image.name}`}
                  onClick={() => onChange(images.filter((other) => other.key !== image.key))}
                >
                  <X />
                </Button>
              </div>
            </figure>
          ))}
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={uploading > 0}
            className={cn(
              "flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              !images.length && "col-span-3 aspect-auto py-8 sm:col-span-5"
            )}
          >
            <ImagePlus className="size-5" aria-hidden />
            {uploadLabel(uploading, images.length)}
          </button>
        </div>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files?.length) {
              void upload(event.target.files)
            }
            event.target.value = ""
          }}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}

// Everything about one variant, in a side panel: its options, SKU, price, packaging, stock and notes.
function VariantSheet({
  variant,
  optionNames,
  title,
  onClose,
  onSave
}: {
  variant: EditorVariant | null
  optionNames: string[]
  title: string
  onClose: () => void
  onSave: (variant: EditorVariant) => void
}) {
  const prices = useCan("prices")
  const [draft, setDraft] = useState(variant)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [shown, setShown] = useState(variant)
  if (shown !== variant) {
    setShown(variant)
    setDraft(variant)
  }
  const change = (next: Partial<EditorVariant>) => setDraft((current) => (current ? { ...current, ...next } : current))
  const label = draft ? variantLabel(draft.options, optionNames) : null
  const summary = draft ? rulesSummary(draft.priceBreaks, draft.quantityRules, draft.priceBasis) : ""
  return (
    <Sheet open={!!variant} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{label ?? "Variant"}</SheetTitle>
          <SheetDescription className="truncate">{title || "New product"}</SheetDescription>
        </SheetHeader>
        {draft && (
          <FieldGroup className="gap-5 px-4">
            {optionNames.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {optionNames.map((name) => (
                  <Field key={name}>
                    <FieldLabel htmlFor={`variant-option-${name}`}>{name}</FieldLabel>
                    <Input
                      id={`variant-option-${name}`}
                      value={draft.options[name] ?? ""}
                      onChange={(event) => change({ options: { ...draft.options, [name]: event.target.value } })}
                    />
                  </Field>
                ))}
              </div>
            )}
            <Field>
              <FieldLabel htmlFor="variant-sku">
                <span>
                  SKU
                  <span aria-hidden className="text-destructive">
                    *
                  </span>
                </span>
              </FieldLabel>
              <Input
                id="variant-sku"
                required
                value={draft.supplierSku}
                onChange={(event) => change({ supplierSku: event.target.value })}
              />
            </Field>
            {prices && (
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="variant-price">Price</FieldLabel>
                  <MoneyInput
                    label="Price"
                    currency={draft.currency}
                    value={draft.priceMinor}
                    onValueChange={(value) => change({ priceMinor: value })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="variant-currency">Currency</FieldLabel>
                  <Select
                    items={currencies.map((value) => ({ value, label: value }))}
                    value={draft.currency}
                    onValueChange={(value) => value && change({ currency: value as Currency })}
                  >
                    <SelectTrigger id="variant-currency" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currencies.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="variant-basis">Price per</FieldLabel>
                  <Select
                    items={basisOptions}
                    value={draft.priceBasis}
                    onValueChange={(value) => value && change({ priceBasis: value as PriceBasis })}
                  >
                    <SelectTrigger id="variant-basis" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {basisOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>Volume pricing</FieldLabel>
                  <Button type="button" variant="outline" className="justify-start" onClick={() => setRulesOpen(true)}>
                    <SlidersHorizontal data-icon="inline-start" />
                    <span className="truncate">{summary || "Add rules"}</span>
                  </Button>
                </Field>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="variant-pieces">Pieces per pack</FieldLabel>
                <Input
                  id="variant-pieces"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={draft.piecesPerSellablePack}
                  onChange={(event) => change({ piecesPerSellablePack: whole(event.target.value, 1) ?? 1 })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="variant-packs">Packs per case</FieldLabel>
                <Input
                  id="variant-packs"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  placeholder="Unknown"
                  value={draft.sellablePacksPerCase ?? ""}
                  onChange={(event) => change({ sellablePacksPerCase: whole(event.target.value, null) })}
                />
              </Field>
            </div>
            <Field orientation="horizontal">
              <Switch
                id="variant-track"
                checked={draft.trackInventory}
                onCheckedChange={(checked) => change({ trackInventory: checked })}
              />
              <FieldLabel htmlFor="variant-track">Track inventory</FieldLabel>
            </Field>
            {draft.trackInventory && (
              <>
                <Field>
                  <FieldLabel htmlFor="variant-on-hand">On hand</FieldLabel>
                  <Input
                    id="variant-on-hand"
                    type="number"
                    value={draft.onHand}
                    className="w-32"
                    onChange={(event) => change({ onHand: whole(event.target.value, 0) ?? 0 })}
                  />
                  <FieldDescription>Pieces in stock.</FieldDescription>
                </Field>
                <Field orientation="horizontal">
                  <Switch
                    id="variant-continue"
                    checked={draft.continueSelling}
                    onCheckedChange={(checked) => change({ continueSelling: checked })}
                  />
                  <FieldLabel htmlFor="variant-continue">Continue selling when out of stock</FieldLabel>
                </Field>
              </>
            )}
            <Field>
              <FieldLabel htmlFor="variant-notes">Notes</FieldLabel>
              <Textarea
                id="variant-notes"
                value={draft.notes}
                onChange={(event) => change({ notes: event.target.value })}
              />
            </Field>
          </FieldGroup>
        )}
        <SheetFooter>
          <Button type="button" onClick={() => draft && onSave(draft)} disabled={!draft?.supplierSku.trim()}>
            Done
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </SheetFooter>
        {draft && prices && (
          <PricingRulesDialog
            open={rulesOpen}
            onOpenChange={setRulesOpen}
            title={label ? `${title}, ${label}` : title}
            currency={draft.currency}
            basis={draft.priceBasis}
            priceMinor={draft.priceMinor}
            priceBreaks={draft.priceBreaks}
            quantityRules={draft.quantityRules}
            onSave={(value) => value && change(value)}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

// A supplier's product page, laid out like Shopify's: title, description, photos and variants on the left; status,
// organization and catalogs on the right.
export function ProductEditor({
  initial,
  catalogs = [],
  readOnly = false
}: {
  initial: EditorProduct
  catalogs?: Array<{ id: string; title: string; status: "active" | "draft" | "archived" }>
  // For someone who can only view products: the form shows the product with every field and button turned off.
  readOnly?: boolean
}) {
  const router = useRouter()
  const prices = useCan("prices")
  const [saved, setSaved] = useState(initial)
  const [product, setProduct] = useState(initial)
  const [editing, setEditing] = useState<string | null>(null)
  const [newOption, setNewOption] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const dirty = JSON.stringify(product) !== JSON.stringify(saved)
  const change = (next: Partial<EditorProduct>) => setProduct((current) => ({ ...current, ...next }))
  const setVariant = (key: string, next: Partial<EditorVariant>) =>
    change({ variants: product.variants.map((variant) => (variant.key === key ? { ...variant, ...next } : variant)) })

  function addOption() {
    const name = newOption.trim()
    if (!name || product.optionNames.length >= 4 || product.optionNames.includes(name)) {
      return
    }
    change({ optionNames: [...product.optionNames, name] })
    setNewOption("")
  }

  async function save() {
    const variants = product.variants.map(({ key: _key, notes, ...variant }) => ({
      ...variant,
      options: Object.fromEntries(product.optionNames.map((name) => [name, (variant.options[name] ?? "").trim()])),
      supplierSku: variant.supplierSku.trim(),
      notes: notes.trim() || null
    }))
    let problem = variantsProblem({ optionNames: product.optionNames, variants })
    if (variants.some((variant) => !variant.supplierSku)) {
      problem = "Give every variant a SKU"
    }
    if (!product.title.trim()) {
      problem = "Add a title"
    }
    if (problem) {
      setError(problem)
      return
    }
    setPending(true)
    setError("")
    try {
      const response = await fetch("/api/supplier-catalog/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: product.id,
          revision: product.revision,
          title: product.title.trim(),
          status: product.status,
          category: product.category.trim(),
          productCode: product.productCode.trim(),
          url: product.url.trim(),
          description: product.description,
          optionNames: product.optionNames,
          images: product.images,
          variants
        })
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error ?? "Couldn't save the product. Try again.")
      }
      setSaved(product)
      if (product.id) {
        router.refresh()
      } else {
        router.replace(`/products/${result.id}`)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save the product. Try again.")
    } finally {
      setPending(false)
    }
  }

  const editingVariant = product.variants.find((variant) => variant.key === editing) ?? null
  const tracked = product.variants.some((variant) => variant.trackInventory)
  const skuWidth = fieldWidth(
    product.variants.map((variant) => variant.supplierSku.length),
    10,
    40
  )

  // The header row stands alone beside the sidebar's button; the form and its save bar follow it, so the bar stays in
  // view while any part of the form does.
  return (
    <>
      <PageHeader
        parents={[{ label: "Products", href: "/products" }]}
        title={saved.id ? saved.title : "Add product"}
        badge={saved.id ? <StatusBadge status={saved.status} /> : undefined}
      />
      <div className="@container flex flex-col gap-4">
        <fieldset
          disabled={readOnly}
          className="grid min-w-0 items-start gap-4 @4xl:grid-cols-[minmax(0,1fr)_18rem] @6xl:grid-cols-[minmax(0,1fr)_20rem]"
        >
          <div className="flex min-w-0 flex-col gap-4">
            <Card>
              <CardContent>
                <FieldGroup className="gap-4">
                  <Field>
                    <FieldLabel htmlFor="product-title">
                      <span>
                        Title
                        <span aria-hidden className="text-destructive">
                          *
                        </span>
                      </span>
                    </FieldLabel>
                    <Input
                      id="product-title"
                      required
                      maxLength={500}
                      value={product.title}
                      placeholder="Maraging epee blade"
                      onChange={(event) => change({ title: event.target.value })}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="product-description">Description</FieldLabel>
                    <Textarea
                      id="product-description"
                      rows={5}
                      value={product.description}
                      onChange={(event) => change({ description: event.target.value })}
                    />
                    <FieldDescription>Customers see this.</FieldDescription>
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>

            <Media images={product.images} onChange={(images) => change({ images })} />

            <Card className="gap-0 overflow-hidden py-0">
              <div className="flex flex-col gap-3 border-b p-4">
                <CardHeader className="px-0">
                  <CardTitle>Variants</CardTitle>
                  <CardDescription>Options your variants differ by, such as Size or Hand.</CardDescription>
                </CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  {product.optionNames.map((name) => (
                    <Badge key={name} variant="secondary" className="h-7 gap-1 pr-1 text-sm">
                      {name}
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        aria-label={`Remove option ${name}`}
                        onClick={() =>
                          change({
                            optionNames: product.optionNames.filter((other) => other !== name),
                            variants: product.variants.map((variant) => {
                              const { [name]: _removed, ...options } = variant.options
                              return { ...variant, options }
                            })
                          })
                        }
                      >
                        <X />
                      </Button>
                    </Badge>
                  ))}
                  {product.optionNames.length < 4 && (
                    <div className="flex items-center gap-1">
                      <Input
                        value={newOption}
                        placeholder={product.optionNames.length ? "Another option" : "Add an option, such as Size"}
                        aria-label="New option name"
                        className="h-7 w-52"
                        onChange={(event) => setNewOption(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault()
                            addOption()
                          }
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!newOption.trim()}
                        onClick={addOption}
                      >
                        Add
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              {/* An editing grid: when it's wider than the card it scrolls sideways, keeping the first column and the
                row actions in view. */}
              <div className="@container">
                <Table framed={false} className={grid.table}>
                  <TableHeader>
                    <TableRow>
                      {product.optionNames.map((name, index) => (
                        <TableHead key={name} className={cn(grid.option, index === 0 && cn(grid.first, "bg-muted"))}>
                          {name}
                        </TableHead>
                      ))}
                      <TableHead
                        className={cn("bg-muted", product.optionNames.length ? grid.firstWhenNarrow : grid.first)}
                      >
                        SKU
                      </TableHead>
                      {prices && <TableHead className="w-px">Price</TableHead>}
                      {tracked && <TableHead className="hidden text-right @lg:table-cell">On hand</TableHead>}
                      <TableHead className={cn(grid.last, "w-px bg-muted")}>
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {product.variants.map((variant) => {
                      const label = variantLabel(variant.options, product.optionNames)
                      const name = label ?? variant.supplierSku
                      return (
                        <TableRow key={variant.key} className="hover:bg-transparent">
                          {product.optionNames.map((option, index) => (
                            <TableCell
                              key={option}
                              className={cn(grid.option, index === 0 && cn(grid.first, "bg-card"))}
                            >
                              <Input
                                value={variant.options[option] ?? ""}
                                aria-label={`${option} for ${variant.supplierSku || "new variant"}`}
                                aria-invalid={!variant.options[option]?.trim() || undefined}
                                className="h-8"
                                style={{
                                  minWidth: fieldWidth(
                                    product.variants.map((other) => other.options[option]?.length ?? 0),
                                    4,
                                    30
                                  )
                                }}
                                onChange={(event) =>
                                  setVariant(variant.key, {
                                    options: { ...variant.options, [option]: event.target.value }
                                  })
                                }
                              />
                            </TableCell>
                          ))}
                          <TableCell
                            className={cn("bg-card", product.optionNames.length ? grid.firstWhenNarrow : grid.first)}
                          >
                            {/* At most 40% of a narrow card, so the price beside it stays in view. */}
                            <Input
                              value={variant.supplierSku}
                              aria-label={`SKU for ${name || "new variant"}`}
                              aria-invalid={!variant.supplierSku.trim() || undefined}
                              className="h-8 font-mono text-xs"
                              style={{ minWidth: `min(${skuWidth}, 40cqi)` }}
                              onChange={(event) => setVariant(variant.key, { supplierSku: event.target.value })}
                            />
                            {label && (
                              <p className="mt-1 text-xs whitespace-normal text-muted-foreground @xl:hidden">{label}</p>
                            )}
                          </TableCell>
                          {prices && (
                            <TableCell>
                              <MoneyInput
                                label={`Price for ${name || "new variant"}`}
                                currency={variant.currency}
                                value={variant.priceMinor}
                                onValueChange={(value) => setVariant(variant.key, { priceMinor: value })}
                                className="h-8 w-32"
                              />
                            </TableCell>
                          )}
                          {tracked && (
                            <TableCell className="hidden text-right tabular-nums @lg:table-cell">
                              {variant.trackInventory ? variant.onHand.toLocaleString("en-US") : "—"}
                            </TableCell>
                          )}
                          <TableCell className={cn(grid.last, "bg-card")}>
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                render={
                                  <Button
                                    type="button"
                                    size="icon-sm"
                                    variant="ghost"
                                    aria-label={`Actions for ${name || "new variant"}`}
                                  />
                                }
                              >
                                <Ellipsis />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem onClick={() => setEditing(variant.key)}>
                                  <Pencil />
                                  Edit variant
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  disabled={product.variants.length === 1}
                                  onClick={() =>
                                    change({ variants: product.variants.filter((other) => other.key !== variant.key) })
                                  }
                                >
                                  <Trash2 />
                                  Remove variant
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t p-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!product.optionNames.length}
                  onClick={() => {
                    const variant = newVariant(product.variants.at(-1))
                    change({ variants: [...product.variants, variant] })
                    setEditing(variant.key)
                  }}
                >
                  <Plus data-icon="inline-start" />
                  Add variant
                </Button>
                {saved.id && product.variants.some((variant) => !variant.id) && (
                  <p className="text-xs text-muted-foreground">New variants join the catalogs this product is in.</p>
                )}
              </div>
            </Card>
          </div>

          <div className="flex flex-col gap-4">
            <Card size="sm">
              <CardHeader>
                <CardTitle>Status</CardTitle>
              </CardHeader>
              <CardContent>
                <Select
                  items={[
                    { value: "active", label: "Active" },
                    { value: "archived", label: "Archived" }
                  ]}
                  value={product.status}
                  onValueChange={(value) => value && change({ status: value as EditorProduct["status"] })}
                >
                  <SelectTrigger aria-label="Status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
                {product.status === "archived" && (
                  <p className="mt-2 text-xs text-muted-foreground">Customers can’t order archived products.</p>
                )}
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Organization</CardTitle>
              </CardHeader>
              <CardContent>
                <FieldGroup className="gap-3">
                  <Field>
                    <FieldLabel htmlFor="product-category">Category</FieldLabel>
                    <Input
                      id="product-category"
                      value={product.category}
                      onChange={(event) => change({ category: event.target.value })}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="product-code">Product code</FieldLabel>
                    <Input
                      id="product-code"
                      value={product.productCode}
                      onChange={(event) => change({ productCode: event.target.value })}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="product-url">Product page</FieldLabel>
                    <Input
                      id="product-url"
                      type="url"
                      placeholder="https://"
                      value={product.url}
                      onChange={(event) => change({ url: event.target.value })}
                    />
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>
            {saved.id && (
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Catalogs</CardTitle>
                </CardHeader>
                <CardContent>
                  {catalogs.length ? (
                    <ul className="flex flex-col gap-2 text-sm">
                      {catalogs.map((catalog) => (
                        <li key={catalog.id} className="flex items-center justify-between gap-2">
                          <PageLink href={`/catalogs/${catalog.id}`} className="truncate hover:underline">
                            {catalog.title}
                          </PageLink>
                          {catalog.status !== "active" && <StatusBadge status={catalog.status} />}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">Not in any catalog.</p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </fieldset>

        <SaveBar
          dirty={dirty || !saved.id}
          pending={pending}
          error={error}
          onDiscard={() => {
            if (!saved.id) {
              router.push("/products")
              return
            }
            setProduct(saved)
            setError("")
          }}
          onSave={() => void save()}
        />
      </div>

      <VariantSheet
        variant={editingVariant}
        optionNames={product.optionNames}
        title={product.title}
        onClose={() => setEditing(null)}
        onSave={(variant) => {
          setVariant(variant.key, variant)
          setEditing(null)
        }}
      />
    </>
  )
}
