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
import { IndexToolbar, matches, Pager, ProductThumb, SaveBar } from "./shared"

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

// A typed count as a whole number, or null for anything else.
function count(text: string) {
  const value = Number(text.trim())
  return text.trim() && Number.isSafeInteger(value) ? value : null
}

// A variant's on hand count, edited in place like Shopify's inventory list: the change shows beside it, green for more
// and red for less, until the page's changes are saved or discarded.
function OnHand({
  row,
  value,
  onChange
}: {
  row: InventoryRow
  value: string | undefined
  onChange: (value: string | undefined) => void
}) {
  const text = value ?? String(row.onHand)
  const next = count(text)
  const delta = next === null ? 0 : next - row.onHand
  return (
    <div className="flex items-center justify-end gap-2">
      {delta !== 0 && (
        <span
          className={cn(
            "rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums",
            delta > 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
          )}
        >
          {delta > 0 ? "+" : "−"}
          {Math.abs(delta).toLocaleString("en-US")}
          <span className="sr-only"> from {row.onHand.toLocaleString("en-US")}</span>
        </span>
      )}
      <Input
        type="number"
        step={1}
        inputMode="numeric"
        value={text}
        aria-label={`On hand for ${row.supplierSku}`}
        aria-invalid={next === null || undefined}
        className={cn(
          "w-24 text-right tabular-nums",
          delta > 0 && "border-success focus-visible:border-success",
          delta < 0 && "border-destructive focus-visible:border-destructive"
        )}
        onChange={(event) => onChange(event.target.value === String(row.onHand) ? undefined : event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onChange(undefined)
          }
        }}
      />
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
  const router = useRouter()
  const [tab, setTab] = useState<Tab>(initialTab && initialTab in tests ? (initialTab as Tab) : "all")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)
  // Counts typed but not saved, by variant.
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const changes = rows.flatMap((row) => {
    const text = edits[row.id]
    const next = text === undefined ? row.onHand : count(text)
    return row.trackInventory && text !== undefined && next !== row.onHand ? [{ id: row.id, onHand: next }] : []
  })
  const invalid = changes.some((change) => change.onHand === null)

  function edit(id: string, value: string | undefined) {
    setError("")
    setEdits((current) => {
      const { [id]: _previous, ...rest } = current
      return value === undefined ? rest : { ...rest, [id]: value }
    })
  }

  async function save() {
    setPending(true)
    setError("")
    try {
      await post("/api/supplier-catalog/stock", { counts: changes })
      setEdits({})
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save. Try again.")
    } finally {
      setPending(false)
    }
  }

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
            {shown.slice(current * pageSize, (current + 1) * pageSize).map((row) => {
              const next = edits[row.id] === undefined ? row.onHand : count(edits[row.id]!)
              const available = next === null ? row.available : next - row.committed
              return (
                <TableRow key={row.id} data-state={next !== row.onHand ? "selected" : undefined}>
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
                      row.trackInventory && available < 0 && "font-medium text-destructive"
                    )}
                  >
                    {row.trackInventory ? available.toLocaleString("en-US") : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.trackInventory ? (
                      <OnHand row={row} value={edits[row.id]} onChange={(value) => edit(row.id, value)} />
                    ) : (
                      <span className="text-muted-foreground">Not tracked</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      ) : (
        <EmptyState title="Nothing here" description="Try another tab or search." />
      )}
      <Pager page={current} pages={pages} total={shown.length} size={pageSize} onPage={setPage} />
      <SaveBar
        dirty={changes.length > 0}
        pending={pending}
        error={error || (invalid ? "Enter whole numbers to save" : "")}
        message={`${changes.length} unsaved ${changes.length === 1 ? "change" : "changes"}`}
        canSave={!invalid}
        onDiscard={() => {
          setEdits({})
          setError("")
        }}
        onSave={() => void save()}
      />
    </div>
  )
}
