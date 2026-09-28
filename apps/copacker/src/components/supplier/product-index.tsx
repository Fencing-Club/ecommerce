"use client"

import { money } from "@repo/aisle"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { EmptyState } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { type PriceBasis, unitName } from "@/lib/catalog-pricing"
import type { ProductImage } from "@/lib/supplier-product"
import { cn } from "@/lib/utils"
import { IndexToolbar, matches, Pager, ProductThumb, StatusBadge } from "./shared"

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

// A product's prices, as one price or a range, per its unit when every variant shares one.
export function priceRange(variants: ProductRow["variants"]) {
  const priced = variants.filter((variant) => variant.priceMinor !== null)
  if (!priced.length) {
    return null
  }
  const currencies = new Set(priced.map((variant) => variant.currency))
  if (currencies.size > 1) {
    return "Several currencies"
  }
  const currency = priced[0]!.currency
  const prices = priced.map((variant) => variant.priceMinor!)
  const low = Math.min(...prices)
  const high = Math.max(...prices)
  const bases = new Set(priced.map((variant) => variant.priceBasis))
  const per = bases.size === 1 ? ` / ${unitName(priced[0]!.priceBasis)}` : ""
  return `${money(low, currency)}${high === low ? "" : ` – ${money(high, currency)}`}${per}`
}

// Stock across a product's tracked variants, like Shopify's "120 in stock for 4 variants".
function Inventory({ variants }: { variants: ProductRow["variants"] }) {
  const tracked = variants.filter((variant) => variant.trackInventory)
  if (!tracked.length) {
    return <span className="text-muted-foreground">Not tracked</span>
  }
  const onHand = tracked.reduce((sum, variant) => sum + variant.onHand, 0)
  return (
    <span>
      <span className={cn("tabular-nums", onHand <= 0 && "text-destructive")}>
        {onHand.toLocaleString("en-US")} in stock
      </span>
      {variants.length > 1 && (
        <span className="text-muted-foreground">
          {" "}
          for {tracked.length} variant{tracked.length === 1 ? "" : "s"}
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
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

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
        throw new Error((await response.json()).error ?? "Couldn't save. Try again.")
      }
      setSelected(new Set())
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save. Try again.")
    } finally {
      setPending(false)
    }
  }

  if (!products.length) {
    return (
      <EmptyState
        title="Add your first product"
        description="Customers order from your products. Add them one at a time or import a spreadsheet."
      >
        <Button nativeButton={false} render={<Link href="/products/new" />}>
          Add product
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
          { value: "all", label: "All", count: counts.all },
          { value: "active", label: "Active", count: counts.active },
          { value: "archived", label: "Archived", count: counts.archived }
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
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" disabled={pending} onClick={() => void setActive(true)}>
              Set as active
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => void setActive(false)}>
              Archive
            </Button>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {rows.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  aria-label="Select all products on this page"
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
              <TableHead>Product</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Inventory</TableHead>
              <TableHead className="hidden @3xl:table-cell">Category</TableHead>
              <TableHead className="hidden text-right @4xl:table-cell">Catalogs</TableHead>
              <TableHead className="text-right">Price</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((product) => {
              const price = priceRange(product.variants)
              return (
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
                  <TableCell className="max-w-md">
                    <Link href={`/products/${product.id}`} className="flex items-center gap-3 hover:underline">
                      <ProductThumb image={product.images[0] ?? null} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{product.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {product.variants.length > 1
                            ? `${product.variants.length} variants`
                            : product.variants[0]?.supplierSku}
                        </span>
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={product.status} />
                  </TableCell>
                  <TableCell>
                    <Inventory variants={product.variants} />
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground @3xl:table-cell">
                    {product.category ?? "—"}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums @4xl:table-cell">{product.catalogs}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {price ?? <span className="text-warning">No price</span>}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      ) : (
        <EmptyState title="No products found" description="Try another search or tab." />
      )}
      <Pager page={current} pages={pages} total={shown.length} size={pageSize} onPage={setPage} />
    </div>
  )
}
