import { useRouter } from "@tanstack/react-router"
import { Ellipsis, Pencil, Plus, Trash2, X } from "lucide-react"
import { useState } from "react"
import { useLocale, useTranslations } from "use-intl"
import { PageLink, useCan } from "@/components/access"
import { PageHeader } from "@/components/common"
import { RequiredMark } from "@/components/form-controls"
import { SaveBar } from "@/components/list/save-bar"
import { OptionSelect } from "@/components/option-select"
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useDraft } from "@/hooks/use-draft"
import { useErrorMessage } from "@/hooks/use-error-text"
import { defaultQuantityRules } from "@/lib/catalog-pricing"
import { useSaveProductMutation } from "@/lib/supplier-api"
import type { ProductImage } from "@/lib/supplier-product"
import { variantLabel, variantsProblem } from "@/lib/supplier-product"
import { cn } from "@/lib/utils"
import { MoneyInput } from "./pricing-controls"
import { ProductMedia } from "./product-media"
import { StatusBadge } from "./shared"
import { type EditorVariant, VariantSheet } from "./variant-sheet"

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
  const { draft: product, saved, change, dirty, reset, markSaved } = useDraft(() => initial ?? blankProduct())
  // The key of the variant open in the sheet.
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
  const setVariant = (key: string, next: Partial<EditorVariant>) =>
    change((current) => ({
      variants: current.variants.map((variant) => (variant.key === key ? { ...variant, ...next } : variant))
    }))

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
      markSaved()
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
                        <RequiredMark />
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

            <ProductMedia images={product.images} onChange={(images) => change({ images })} />

            <Card flush>
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
                <OptionSelect
                  options={[
                    { value: "active", label: shared("status.active") },
                    { value: "archived", label: shared("status.archived") }
                  ]}
                  value={product.status}
                  onChange={(status) => change({ status })}
                  label={t("status")}
                  className="w-full"
                />
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
            reset()
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
