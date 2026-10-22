import { orderCurrencies, type OrderCurrency } from "@repo/copacker-shipments"
import { useRouter } from "@tanstack/react-router"
import { Ellipsis, ImagePlus, Pencil, Plus, SlidersHorizontal, Star, Trash2, X } from "lucide-react"
import { useRef, useState } from "react"
import { useLocale, useTranslations } from "use-intl"
import { PageLink, useCan } from "@/components/access"
import { fileName, PageHeader } from "@/components/common"
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
import { useErrorMessage } from "@/hooks/use-error-text"
import type { PriceBreak } from "@/lib/catalog-pricing"
import type { QuantityRules } from "@/lib/catalog-pricing"
import { defaultQuantityRules, type PriceBasis } from "@/lib/catalog-pricing"
import { useSaveProductMutation, useUploadProductImageMutation } from "@/lib/supplier-api"
import type { ProductImage } from "@/lib/supplier-product"
import { imageUrl, variantLabel, variantsProblem } from "@/lib/supplier-product"
import { cn } from "@/lib/utils"
import { MoneyInput, PricingRulesDialog, useRulesSummary } from "./pricing-controls"
import { SaveBar, StatusBadge } from "./shared"

const bases = ["piece", "sellable_pack", "case"] as const satisfies readonly PriceBasis[]

export type EditorVariant = {
  key: string
  id?: string
  supplierSku: string
  options: Record<string, string>
  currency: OrderCurrency
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

function blankProduct(): EditorProduct {
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

// The variant grid scrolls sideways inside its card when it's wider than the card. Its first column and the row actions
// stay in view, on the card's own background so the columns scrolling past pass under them. Each cell draws its own
// rule, which a sticky cell would otherwise cover. On a narrow card the option columns hide, and the SKU leads.
const grid = {
  table: "border-separate border-spacing-0 [&_td]:border-b [&_th]:border-b [&_tr:last-child_td]:border-b-0",
  first: "sticky start-0 z-10 ps-4",
  firstWhenNarrow: "@max-xl:sticky @max-xl:start-0 @max-xl:z-10 @max-xl:ps-4",
  last: "sticky end-0 z-10 pe-4",
  option: "hidden @xl:table-cell"
}

// The width a field needs to show the longest of `lengths` characters whole, kept within `least` and `most`, with its
// padding.
function fieldWidth(lengths: number[], least: number, most: number) {
  return `calc(${Math.min(most, Math.max(least, ...lengths)) + 1}ch + 1.5rem)`
}

function uploadLabel(
  uploading: number,
  count: number,
  t: ReturnType<typeof useTranslations<"supplier.productEditor">>
) {
  if (uploading) {
    return t("uploading", { count: uploading })
  }
  return count ? t("add") : t("addPhotos")
}

// Photos: upload several at once, remove one, or make one the main photo.
function Media({ images, onChange }: { images: ProductImage[]; onChange: (images: ProductImage[]) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(0)
  // The last photo that didn't upload, and why.
  const [failed, setFailed] = useState<{ name: string; error: string } | null>(null)
  const [uploadImage] = useUploadProductImageMutation()
  const t = useTranslations("supplier.productEditor")
  const errorMessage = useErrorMessage()

  // A photo that fails, even one that never reaches the server, is skipped: the rest still upload, and every photo that
  // did is kept.
  async function upload(files: File[]) {
    setFailed(null)
    setUploading(files.length)
    const added: ProductImage[] = []
    for (const file of files) {
      try {
        added.push(await uploadImage(file).unwrap())
      } catch (caught) {
        setFailed({ name: file.name, error: errorMessage(caught, t("couldNotUpload")) })
      } finally {
        setUploading((count) => count - 1)
      }
    }
    onChange([...images, ...added])
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("media")}</CardTitle>
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
                    aria-label={t("makeMain", { name: image.name })}
                    onClick={() => onChange([image, ...images.filter((other) => other.key !== image.key)])}
                  >
                    <Star />
                  </Button>
                )}
                <Button
                  type="button"
                  size="icon-xs"
                  variant="secondary"
                  aria-label={t("removePhoto", { name: image.name })}
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
            {uploadLabel(uploading, images.length, t)}
          </button>
        </div>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          hidden
          onChange={(event) => {
            // Copied first: clearing the input, so the same photos can be chosen again, empties its own file list.
            const files = Array.from(event.target.files ?? [])
            event.target.value = ""
            if (files.length) {
              void upload(files)
            }
          }}
        />
        {failed && <p className="text-sm text-destructive">{t.rich("fileError", { ...failed, file: fileName })}</p>}
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
  const t = useTranslations("supplier.productEditor")
  const shared = useTranslations("supplier.shared")
  const rulesSummary = useRulesSummary()
  const change = (next: Partial<EditorVariant>) => setDraft((current) => (current ? { ...current, ...next } : current))
  const label = draft ? variantLabel(draft.options, optionNames) : null
  const summary = draft ? rulesSummary(draft.priceBreaks, draft.quantityRules, draft.priceBasis) : ""
  return (
    <Sheet open={!!variant} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{label ?? t("variant")}</SheetTitle>
          <SheetDescription className="truncate">{title || t("newProduct")}</SheetDescription>
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
                  {t("sku")}
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
                  <FieldLabel htmlFor="variant-price">{t("price")}</FieldLabel>
                  <MoneyInput
                    label={t("price")}
                    currency={draft.currency}
                    value={draft.priceMinor}
                    onValueChange={(value) => change({ priceMinor: value })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="variant-currency">{t("currency")}</FieldLabel>
                  <Select
                    items={orderCurrencies.map((value) => ({ value, label: value }))}
                    value={draft.currency}
                    onValueChange={(value) => value && change({ currency: value as OrderCurrency })}
                  >
                    <SelectTrigger id="variant-currency" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {orderCurrencies.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="variant-basis">{t("pricePer")}</FieldLabel>
                  <Select
                    items={bases.map((value) => ({ value, label: t(`basis.${value}`) }))}
                    value={draft.priceBasis}
                    onValueChange={(value) => value && change({ priceBasis: value as PriceBasis })}
                  >
                    <SelectTrigger id="variant-basis" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {bases.map((value) => (
                        <SelectItem key={value} value={value}>
                          {t(`basis.${value}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>{t("volumePricing")}</FieldLabel>
                  <Button type="button" variant="outline" className="justify-start" onClick={() => setRulesOpen(true)}>
                    <SlidersHorizontal data-icon="inline-start" />
                    <span className="truncate">{summary || t("addRules")}</span>
                  </Button>
                </Field>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="variant-pieces">{t("piecesPerPack")}</FieldLabel>
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
                <FieldLabel htmlFor="variant-packs">{t("packsPerCase")}</FieldLabel>
                <Input
                  id="variant-packs"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  placeholder={t("unknown")}
                  value={draft.sellablePacksPerCase ?? ""}
                  onChange={(event) => change({ sellablePacksPerCase: whole(event.target.value, null) })}
                />
              </Field>
            </div>
            <Field orientation="horizontal">
              <Switch
                id="variant-track"
                aria-labelledby="variant-track-label"
                checked={draft.trackInventory}
                onCheckedChange={(checked) => change({ trackInventory: checked })}
              />
              <FieldLabel id="variant-track-label" htmlFor="variant-track">
                {t("trackInventory")}
              </FieldLabel>
            </Field>
            {draft.trackInventory && (
              <>
                <Field>
                  <FieldLabel htmlFor="variant-on-hand">{t("onHand")}</FieldLabel>
                  <Input
                    id="variant-on-hand"
                    type="number"
                    value={draft.onHand}
                    className="w-32"
                    onChange={(event) => change({ onHand: whole(event.target.value, 0) ?? 0 })}
                  />
                  <FieldDescription>{t("piecesInStock")}</FieldDescription>
                </Field>
                <Field orientation="horizontal">
                  <Switch
                    id="variant-continue"
                    aria-labelledby="variant-continue-label"
                    checked={draft.continueSelling}
                    onCheckedChange={(checked) => change({ continueSelling: checked })}
                  />
                  <FieldLabel id="variant-continue-label" htmlFor="variant-continue">
                    {t("continueSelling")}
                  </FieldLabel>
                </Field>
              </>
            )}
            <Field>
              <FieldLabel htmlFor="variant-notes">{t("notes")}</FieldLabel>
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
            {shared("done")}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            {shared("cancel")}
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
  // The product to edit; a new product starts blank.
  initial?: EditorProduct
  catalogs?: Array<{ id: string; title: string; status: "active" | "draft" | "archived" }>
  // For someone who can only view products: the form shows the product with every field and button turned off.
  readOnly?: boolean
}) {
  const router = useRouter()
  const prices = useCan("prices")
  const [saved, setSaved] = useState(() => initial ?? blankProduct())
  const [product, setProduct] = useState(saved)
  const [editing, setEditing] = useState<string | null>(null)
  const [newOption, setNewOption] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [saveProduct] = useSaveProductMutation()
  const t = useTranslations("supplier.productEditor")
  const shared = useTranslations("supplier.shared")
  const pricing = useTranslations("supplier.pricing")
  const errorMessage = useErrorMessage()
  const locale = useLocale()
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
    let problem = variantsProblem({ optionNames: product.optionNames, variants }, pricing)
    if (variants.some((variant) => !variant.supplierSku)) {
      problem = t("giveSku")
    }
    if (!product.title.trim()) {
      problem = t("addTitle")
    }
    if (problem) {
      setError(problem)
      return
    }
    setPending(true)
    setError("")
    try {
      const { id } = await saveProduct({
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
      }).unwrap()
      setSaved(product)
      if (product.id) {
        router.invalidate()
      } else {
        router.navigate({ href: `/products/${id}`, replace: true })
      }
    } catch (caught) {
      setError(errorMessage(caught, t("saveFailed")))
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
        parents={[{ label: t("products"), href: "/products" }]}
        title={saved.id ? saved.title : t("addProduct")}
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
                        {t("title")}
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
                      placeholder={t("titlePlaceholder")}
                      onChange={(event) => change({ title: event.target.value })}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="product-description">{t("description")}</FieldLabel>
                    <Textarea
                      id="product-description"
                      rows={5}
                      value={product.description}
                      onChange={(event) => change({ description: event.target.value })}
                    />
                    <FieldDescription>{t("customersSee")}</FieldDescription>
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>

            <Media images={product.images} onChange={(images) => change({ images })} />

            <Card className="gap-0 overflow-hidden py-0">
              <div className="flex flex-col gap-3 border-b p-4">
                <CardHeader className="px-0">
                  <CardTitle>{t("variants")}</CardTitle>
                  <CardDescription>{t("variantsDescription")}</CardDescription>
                </CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  {product.optionNames.map((name) => (
                    <Badge key={name} variant="secondary" className="h-7 gap-1 pe-1 text-sm">
                      {name}
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        aria-label={t("removeOption", { name })}
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
                        placeholder={product.optionNames.length ? t("anotherOption") : t("addOption")}
                        aria-label={t("newOptionName")}
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
                        {t("add")}
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
                        {t("sku")}
                      </TableHead>
                      {prices && <TableHead className="w-px">{t("price")}</TableHead>}
                      {tracked && <TableHead className="hidden text-end @lg:table-cell">{t("onHand")}</TableHead>}
                      <TableHead className={cn(grid.last, "w-px bg-muted")}>
                        <span className="sr-only">{t("actions")}</span>
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
                                aria-label={
                                  variant.supplierSku
                                    ? t("optionFor", { option, sku: variant.supplierSku })
                                    : t("optionForNew", { option })
                                }
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
                              aria-label={name ? t("skuFor", { name }) : t("skuForNew")}
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
                                label={name ? t("priceFor", { name }) : t("priceForNew")}
                                currency={variant.currency}
                                value={variant.priceMinor}
                                onValueChange={(value) => setVariant(variant.key, { priceMinor: value })}
                                className="h-8 w-32"
                              />
                            </TableCell>
                          )}
                          {tracked && (
                            <TableCell className="hidden text-end tabular-nums @lg:table-cell">
                              {variant.trackInventory ? variant.onHand.toLocaleString(locale) : "—"}
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
                                    aria-label={name ? t("actionsFor", { name }) : t("actionsForNew")}
                                  />
                                }
                              >
                                <Ellipsis />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem onClick={() => setEditing(variant.key)}>
                                  <Pencil />
                                  {t("editVariant")}
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
                                  {t("removeVariant")}
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
                  {t("addVariant")}
                </Button>
                {saved.id && product.variants.some((variant) => !variant.id) && (
                  <p className="text-xs text-muted-foreground">{t("newVariantsJoin")}</p>
                )}
              </div>
            </Card>
          </div>

          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>{t("status")}</CardTitle>
              </CardHeader>
              <CardContent>
                <Select
                  items={[
                    { value: "active", label: shared("status.active") },
                    { value: "archived", label: shared("status.archived") }
                  ]}
                  value={product.status}
                  onValueChange={(value) => value && change({ status: value as EditorProduct["status"] })}
                >
                  <SelectTrigger aria-label={t("status")} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{shared("status.active")}</SelectItem>
                    <SelectItem value="archived">{shared("status.archived")}</SelectItem>
                  </SelectContent>
                </Select>
                {product.status === "archived" && (
                  <p className="mt-2 text-xs text-muted-foreground">{t("archivedNote")}</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("organization")}</CardTitle>
              </CardHeader>
              <CardContent>
                <FieldGroup className="gap-3">
                  <Field>
                    <FieldLabel htmlFor="product-category">{t("category")}</FieldLabel>
                    <Input
                      id="product-category"
                      value={product.category}
                      onChange={(event) => change({ category: event.target.value })}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="product-code">{t("productCode")}</FieldLabel>
                    <Input
                      id="product-code"
                      value={product.productCode}
                      onChange={(event) => change({ productCode: event.target.value })}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="product-url">{t("productPage")}</FieldLabel>
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
              <Card>
                <CardHeader>
                  <CardTitle>{t("catalogs")}</CardTitle>
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
                    <p className="text-sm text-muted-foreground">{t("notInCatalog")}</p>
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
              router.navigate({ href: "/products" })
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
