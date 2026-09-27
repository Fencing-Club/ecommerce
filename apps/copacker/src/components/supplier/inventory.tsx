"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { EmptyState } from "@/components/common"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import type { InventoryRow } from "@/server/supplier-workspace"
import { IndexToolbar, matches, Pager, ProductThumb } from "./shared"

async function post(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  })
  if (!response.ok) {
    throw new Error((await response.json()).error ?? "Couldn't save. Try again.")
  }
}

// A variant's on hand count, saved when it loses focus or Enter is pressed, like Shopify's inventory list.
function OnHand({ row }: { row: InventoryRow }) {
  const router = useRouter()
  const [value, setValue] = useState(String(row.onHand))
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  async function save() {
    const onHand = Number(value)
    if (!value.trim() || !Number.isSafeInteger(onHand)) {
      setValue(String(row.onHand))
      return
    }
    if (onHand === row.onHand) {
      return
    }
    setPending(true)
    setError("")
    try {
      await post("/api/supplier-catalog/stock", { id: row.id, onHand })
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save. Try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Input
        type="number"
        step={1}
        value={value}
        disabled={pending}
        aria-label={`On hand for ${row.supplierSku}`}
        aria-invalid={!!error}
        className="w-24 text-right tabular-nums"
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => void save()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur()
          }
          if (event.key === "Escape") {
            setValue(String(row.onHand))
          }
        }}
      />
      {error && <output className="text-xs text-destructive">{error}</output>}
    </div>
  )
}

function Toggle({
  row,
  field,
  label
}: {
  row: InventoryRow
  field: "trackInventory" | "continueSelling"
  label: string
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  return (
    <Switch
      size="sm"
      checked={row[field]}
      disabled={pending}
      aria-label={`${label} for ${row.supplierSku}`}
      aria-invalid={failed}
      onCheckedChange={async (checked) => {
        setPending(true)
        setFailed(false)
        try {
          await post("/api/supplier-catalog/tracking", { id: row.id, [field]: checked })
          router.refresh()
        } catch {
          setFailed(true)
        } finally {
          setPending(false)
        }
      }}
    />
  )
}

type Tab = "all" | "tracked" | "short" | "untracked"
const tests: Record<Tab, (row: InventoryRow) => boolean> = {
  all: () => true,
  tracked: (row) => row.trackInventory,
  short: (row) => row.trackInventory && row.available < 0,
  untracked: (row) => !row.trackInventory
}
const pageSize = 100

export function InventoryTable({ rows, initialTab }: { rows: InventoryRow[]; initialTab?: string }) {
  const [tab, setTab] = useState<Tab>(initialTab && initialTab in tests ? (initialTab as Tab) : "all")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)
  if (!rows.length) {
    return <EmptyState title="No products yet" description="Add products to count their stock here." />
  }
  const shown = rows.filter((row) => tests[tab](row) && matches(query, row.title, row.variant, row.supplierSku))
  const pages = Math.max(1, Math.ceil(shown.length / pageSize))
  const current = Math.min(page, pages - 1)
  return (
    <div className="@container flex flex-col gap-3">
      <IndexToolbar
        tabs={[
          { value: "all", label: "All", count: rows.length },
          { value: "tracked", label: "Tracked", count: rows.filter(tests.tracked).length },
          { value: "short", label: "Short", count: rows.filter(tests.short).length },
          { value: "untracked", label: "Not tracked", count: rows.filter(tests.untracked).length }
        ]}
        tab={tab}
        onTabChange={(value) => {
          setTab(value)
          setPage(0)
        }}
        query={query}
        onQueryChange={(value) => {
          setQuery(value)
          setPage(0)
        }}
        placeholder="Search by product or SKU"
      />
      {shown.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="hidden @2xl:table-cell">SKU</TableHead>
              <TableHead className="hidden text-center @4xl:table-cell">Tracked</TableHead>
              <TableHead className="hidden text-center @4xl:table-cell">Sell when out</TableHead>
              <TableHead className="hidden text-right @xl:table-cell">Committed</TableHead>
              <TableHead className="text-right">Available</TableHead>
              <TableHead className="text-right">On hand</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.slice(current * pageSize, (current + 1) * pageSize).map((row) => (
              <TableRow key={row.id}>
                <TableCell className="max-w-80">
                  <Link href={`/products/${row.groupId}`} className="flex items-center gap-3 hover:underline">
                    <ProductThumb image={row.image} className="size-9" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{row.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {row.variant ?? <span className="@2xl:hidden">{row.supplierSku}</span>}
                      </span>
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="hidden font-mono text-xs @2xl:table-cell">{row.supplierSku}</TableCell>
                <TableCell className="hidden text-center @4xl:table-cell">
                  <Toggle row={row} field="trackInventory" label="Track inventory" />
                </TableCell>
                <TableCell className="hidden text-center @4xl:table-cell">
                  {row.trackInventory && <Toggle row={row} field="continueSelling" label="Continue selling" />}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums @xl:table-cell">
                  {row.committed.toLocaleString("en-US")}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    row.trackInventory && row.available < 0 && "font-medium text-destructive"
                  )}
                >
                  {row.trackInventory ? row.available.toLocaleString("en-US") : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {row.trackInventory ? (
                    <OnHand key={`${row.id}:${row.revision}`} row={row} />
                  ) : (
                    <span className="text-muted-foreground">Not tracked</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <EmptyState title="Nothing here" description="Try another tab or search." />
      )}
      <Pager page={current} pages={pages} total={shown.length} size={pageSize} onPage={setPage} />
    </div>
  )
}
