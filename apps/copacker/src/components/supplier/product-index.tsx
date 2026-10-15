"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useLocale, useTranslations } from "use-intl"
import { useCan } from "@/components/access"
import { EmptyState, WarningNote } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useMoney } from "@/hooks/use-money"
import type { PriceBasis } from "@/lib/catalog-pricing"
import type { ProductImage } from "@/lib/supplier-product"
import { cn } from "@/lib/utils"
import { IndexToolbar, matches, Pager, ProductThumb, rowLink, StatusBadge } from "./shared"

export type ProductRow = {
  id: string
  title: string
  category: string | null
  productCode: string | null
  images: ProductImage[]
  status: "active" | "archived"
  catalogs: number
  variants: Array<{
    supplierSku: string
    currency: string
    priceMinor: number | null
    priceBasis: PriceBasis
    trackInventory: boolean
    onHand: number
  }>
}

const pageSize = 50

// Beside an open sidebar (about 730px) the table shows each product with its status, stock and price. Wider, it adds the
// category, then the catalog count. A phone keeps the product and its price, with an archived badge under the title.
const columns = {
  status: "hidden @md:table-cell",
  inventory: "hidden @lg:table-cell",
  category: "hidden text-muted-foreground @3xl:table-cell",
  catalogs: "hidden text-end tabular-nums @4xl:table-cell"
}

// A product's prices, as one price or a range. The column says Price, so a price per piece shows alone; a price per
// pack or case names its unit when every variant shares it.
function usePriceRange() {
  const t = useTranslations("supplier.productIndex")
  const shared = useTranslations("supplier.shared")
  const money = useMoney()
  return (variants: ProductRow["variants"]) => {
    const priced = variants.filter((variant) => variant.priceMinor !== null)
    if (!priced.length) {
      return null
    }
    const currencies = new Set(priced.map((variant) => variant.currency))
    if (currencies.size > 1) {
      return t("severalCurrencies")
    }
    const currency = priced[0]!.currency
    const prices = priced.map((variant) => variant.priceMinor!)
    const low = Math.min(...prices)
    const high = Math.max(...prices)
    const bases = new Set(priced.map((variant) => variant.priceBasis))
    const basis = priced[0]!.priceBasis
    const price =
      high === low ? money(low, currency) : shared("range", { low: money(low, currency), high: money(high, currency) })
    return bases.size === 1 && basis !== "piece" ? t("pricePer", { price, basis }) : price
  }
}

// Stock across a product's tracked variants, like Shopify's "120 in stock for 4 variants". On a narrow table the
// variant count folds under the stock.
function Inventory({ variants }: { variants: ProductRow["variants"] }) {
  const t = useTranslations("supplier.productIndex")
  const tracked = variants.filter((variant) => variant.trackInventory)
  if (!tracked.length) {
    return <span className="text-muted-foreground">{t("notTracked")}</span>
  }
  const onHand = tracked.reduce((sum, variant) => sum + variant.onHand, 0)
  return (
    <span className="flex flex-col @4xl:flex-row @4xl:gap-1">
      <span className={cn("tabular-nums", onHand <= 0 && "text-destructive")}>{t("inStock", { count: onHand })}</span>{" "}
      {variants.length > 1 && (
        <span className="text-xs text-muted-foreground @4xl:text-sm">
          {t("forVariants", { count: tracked.length })}
        </span>
      )}
    </span>
  )
}

export function ProductIndex({ products }: { products: ProductRow[] }) {
  const router = useRouter()
  const [tab, setTab] = useState<"all" | "active" | "archived">("all")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Choosing products is for archiving or restoring them, which changes them.
  const editable = useCan("products", "edit")
  const prices = useCan("prices")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const t = useTranslations("supplier.productIndex")
  const shared = useTranslations("supplier.shared")
  const locale = useLocale()
  const priceRange = usePriceRange()

  const shown = products.filter(
    (product) =>
      (tab === "all" || product.status === tab) &&
      matches(
        query,
        product.title,
        product.category,
        product.productCode,
        ...product.variants.map((variant) => variant.supplierSku)
      )
  )
  const pages = Math.max(1, Math.ceil(shown.length / pageSize))
  const current = Math.min(page, pages - 1)
  const rows = shown.slice(current * pageSize, (current + 1) * pageSize)
  const chosen = rows.filter((product) => selected.has(product.id))
  const allChosen = rows.length > 0 && chosen.length === rows.length

  async function setActive(active: boolean) {
    setPending(true)
    setError("")
    try {
      const response = await fetch("/api/supplier-catalog/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], active })
      })
      if (!response.ok) {
        throw new Error((await response.json()).error ?? shared("couldNotSave"))
      }
      setSelected(new Set())
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : shared("couldNotSave"))
    } finally {
      setPending(false)
    }
  }

  if (!products.length) {
    return (
      <EmptyState title={t("emptyTitle")} description={t("emptyDescription")}>
        <Button nativeButton={false} render={<Link href="/products/new" />}>
          {t("addProduct")}
        </Button>
      </EmptyState>
    )
  }

  const counts = {
    all: products.length,
    active: products.filter((product) => product.status === "active").length,
    archived: products.filter((product) => product.status === "archived").length
  }

  return (
    <div className="@container flex flex-col gap-3">
      <IndexToolbar
        tabs={[
          { value: "all", label: shared("all"), count: counts.all },
          { value: "active", label: shared("status.active"), count: counts.active },
          { value: "archived", label: shared("status.archived"), count: counts.archived }
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
        placeholder={t("search")}
      />
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <span className="font-medium">{shared("selected", { count: selected.size })}</span>
          <div className="ms-auto flex gap-2">
            <Button size="sm" variant="outline" disabled={pending} onClick={() => void setActive(true)}>
              {t("setActive")}
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => void setActive(false)}>
              {t("archive")}
            </Button>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {rows.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              {editable && (
                <TableHead className="w-10">
                  <Checkbox
                    aria-label={shared("selectAllOnPage")}
                    checked={allChosen}
                    indeterminate={chosen.length > 0 && !allChosen}
                    onCheckedChange={(checked) => {
                      const next = new Set(selected)
                      for (const product of rows) {
                        if (checked) {
                          next.add(product.id)
                        } else {
                          next.delete(product.id)
                        }
                      }
                      setSelected(next)
                    }}
                  />
                </TableHead>
              )}
              <TableHead>{t("columns.product")}</TableHead>
              <TableHead className={columns.status}>{t("columns.status")}</TableHead>
              <TableHead className={columns.inventory}>{t("columns.inventory")}</TableHead>
              <TableHead className={columns.category}>{t("columns.category")}</TableHead>
              <TableHead className={columns.catalogs}>{t("columns.catalogs")}</TableHead>
              {prices && <TableHead className="text-end">{t("columns.price")}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((product) => {
              const price = priceRange(product.variants)
              return (
                <TableRow
                  key={product.id}
                  className="relative"
                  data-state={selected.has(product.id) ? "selected" : undefined}
                >
                  {editable && (
                    <TableCell className="relative z-10">
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
                  <TableCell className="whitespace-normal">
                    <div className="flex items-center gap-3">
                      <ProductThumb image={product.images[0] ?? null} className="hidden @sm:flex" />
                      <div className="flex min-w-0 flex-col">
                        <Link href={`/products/${product.id}`} className={cn("line-clamp-2 font-medium", rowLink)}>
                          {product.title}
                        </Link>
                        <span className="truncate text-xs text-muted-foreground">
                          {product.variants.length > 1
                            ? shared("variantCount", { count: product.variants.length })
                            : product.variants[0]?.supplierSku}
                        </span>
                        {product.status === "archived" && (
                          <span className="mt-1 @md:hidden">
                            <StatusBadge status="archived" />
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className={columns.status}>
                    <StatusBadge status={product.status} />
                  </TableCell>
                  <TableCell className={columns.inventory}>
                    <Inventory variants={product.variants} />
                  </TableCell>
                  <TableCell className={columns.category}>{product.category ?? "—"}</TableCell>
                  <TableCell className={columns.catalogs}>{product.catalogs.toLocaleString(locale)}</TableCell>
                  {prices && (
                    <TableCell className="text-end tabular-nums">
                      {price ?? <WarningNote>{shared("noPrice")}</WarningNote>}
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      ) : (
        <EmptyState title={t("noneFound")} description={t("noneFoundDescription")} />
      )}
      <Pager page={current} pages={pages} total={shown.length} size={pageSize} onPage={setPage} />
    </div>
  )
}
