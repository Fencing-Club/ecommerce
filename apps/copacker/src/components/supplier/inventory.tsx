import { useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { useLocale, useTranslations } from "use-intl"
import { PageLink, useCan } from "@/components/access"
import { EmptyState } from "@/components/common"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useErrorMessage } from "@/hooks/use-error-text"
import { useSaveStockMutation, useSetTrackingMutation } from "@/lib/supplier-api"
import { cn } from "@/lib/utils"
import type { InventoryRow } from "@/server/supplier-workspace"
import { IndexToolbar, matches, Pager, ProductThumb, SaveBar } from "./shared"

// A typed count as a whole number, or null for anything else.
function count(text: string) {
  const value = Number(text.trim())
  return text.trim() && Number.isSafeInteger(value) ? value : null
}

// A variant's on hand count, edited in place like Shopify's inventory list: the change shows beside it, green for more
// and red for less, until the page's changes are saved or discarded. The change keeps a place of its own, so the column
// doesn't widen as a count is typed; on a phone's table that place goes to the product instead.
function OnHand({
  row,
  value,
  onChange
}: {
  row: InventoryRow
  value: string | undefined
  onChange: (value: string | undefined) => void
}) {
  const t = useTranslations("supplier.inventory")
  const locale = useLocale()
  const text = value ?? String(row.onHand)
  const next = count(text)
  const delta = next === null ? 0 : next - row.onHand
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="flex justify-end @md:min-w-14">
        {delta !== 0 && (
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums",
              delta > 0 ? "bg-success-soft text-success" : "bg-destructive-soft text-destructive"
            )}
          >
            {delta > 0 ? "+" : "−"}
            {Math.abs(delta).toLocaleString(locale)}
            <span className="sr-only"> {t("from", { count: row.onHand })}</span>
          </span>
        )}
      </span>
      <Input
        type="number"
        step={1}
        inputMode="numeric"
        value={text}
        aria-label={t("onHandFor", { sku: row.supplierSku })}
        aria-invalid={next === null || undefined}
        className={cn(
          "w-24 text-end tabular-nums",
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
  // What the switch does, for the variant: "Track inventory for UF-1".
  label: string
}) {
  const router = useRouter()
  const [setTracking, { isLoading: pending }] = useSetTrackingMutation()
  const [failed, setFailed] = useState(false)
  const editable = useCan("inventory", "edit")
  return (
    <Switch
      size="sm"
      checked={row[field]}
      disabled={pending || !editable}
      aria-label={label}
      aria-invalid={failed}
      onCheckedChange={async (checked) => {
        setFailed(false)
        try {
          await setTracking({ id: row.id, [field]: checked }).unwrap()
          router.invalidate()
        } catch {
          setFailed(true)
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
  const [saveStock, { isLoading: pending }] = useSaveStockMutation()
  const [error, setError] = useState("")
  // Someone who can only view inventory sees each count without a field to change it.
  const editable = useCan("inventory", "edit")
  const t = useTranslations("supplier.inventory")
  const shared = useTranslations("supplier.shared")
  const errorMessage = useErrorMessage()
  const locale = useLocale()
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

  // Save is off while a count isn't a whole number, so every count sent is one.
  async function save() {
    setError("")
    try {
      await saveStock({
        counts: changes.flatMap(({ id, onHand }) => (onHand === null ? [] : [{ id, onHand }]))
      }).unwrap()
      setEdits({})
      router.invalidate()
    } catch (caught) {
      setError(errorMessage(caught, shared("couldNotSave")))
    }
  }

  if (!rows.length) {
    return <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
  }
  const shown = rows.filter((row) => tests[tab](row) && matches(query, row.title, row.variant, row.supplierSku))
  const pages = Math.max(1, Math.ceil(shown.length / pageSize))
  const current = Math.min(page, pages - 1)
  return (
    <div className="@container flex flex-col gap-3">
      <IndexToolbar
        tabs={[
          { value: "all", label: shared("all"), count: rows.length },
          { value: "tracked", label: t("tabs.tracked"), count: rows.filter(tests.tracked).length },
          { value: "short", label: t("tabs.short"), count: rows.filter(tests.short).length },
          { value: "untracked", label: t("tabs.untracked"), count: rows.filter(tests.untracked).length }
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
        placeholder={t("search")}
      />
      {shown.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.product")}</TableHead>
              <TableHead className="hidden @2xl:table-cell">{t("columns.sku")}</TableHead>
              <TableHead className="hidden text-center @4xl:table-cell">{t("columns.tracked")}</TableHead>
              <TableHead className="hidden text-center @4xl:table-cell">{t("columns.sellWhenOut")}</TableHead>
              <TableHead className="hidden text-end @xl:table-cell">{t("columns.committed")}</TableHead>
              <TableHead className="hidden text-end @md:table-cell">{t("columns.available")}</TableHead>
              <TableHead className="text-end">{t("columns.onHand")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.slice(current * pageSize, (current + 1) * pageSize).map((row) => {
              const next = edits[row.id] === undefined ? row.onHand : count(edits[row.id]!)
              const available = next === null ? row.available : next - row.committed
              return (
                <TableRow key={row.id} data-state={next !== row.onHand ? "selected" : undefined}>
                  {/* Long titles wrap, so the counts keep their place beside an open sidebar. */}
                  <TableCell className="whitespace-normal">
                    <div className="flex items-center gap-3">
                      <ProductThumb image={row.image} className="hidden size-9 @sm:flex" />
                      <div className="min-w-0">
                        <PageLink
                          href={`/products/${row.groupId}`}
                          className="focus-ring line-clamp-2 rounded-sm font-medium underline-offset-4 hover:underline"
                        >
                          {row.title}
                        </PageLink>
                        <p className="text-xs text-muted-foreground">
                          {row.variant ?? <span className="@2xl:hidden">{row.supplierSku}</span>}
                        </p>
                        {row.trackInventory && (
                          <p
                            className={cn(
                              "text-xs text-muted-foreground tabular-nums @md:hidden",
                              available < 0 && "font-medium text-destructive"
                            )}
                          >
                            {t("available", { count: available })}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs @2xl:table-cell">{row.supplierSku}</TableCell>
                  <TableCell className="hidden text-center @4xl:table-cell">
                    <Toggle row={row} field="trackInventory" label={t("trackFor", { sku: row.supplierSku })} />
                  </TableCell>
                  <TableCell className="hidden text-center @4xl:table-cell">
                    {row.trackInventory && (
                      <Toggle row={row} field="continueSelling" label={t("continueFor", { sku: row.supplierSku })} />
                    )}
                  </TableCell>
                  <TableCell className="hidden text-end tabular-nums @xl:table-cell">
                    {row.committed.toLocaleString(locale)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "hidden text-end tabular-nums @md:table-cell",
                      row.trackInventory && available < 0 && "font-medium text-destructive"
                    )}
                  >
                    {row.trackInventory ? available.toLocaleString(locale) : "—"}
                  </TableCell>
                  <TableCell className="text-end">
                    {row.trackInventory && editable && (
                      <OnHand row={row} value={edits[row.id]} onChange={(value) => edit(row.id, value)} />
                    )}
                    {row.trackInventory && !editable && (
                      <span className="tabular-nums">{row.onHand.toLocaleString(locale)}</span>
                    )}
                    {!row.trackInventory && <span className="text-muted-foreground">{t("notTracked")}</span>}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      ) : (
        <EmptyState title={t("nothingHere")} description={shared("tryAnother")} />
      )}
      <Pager page={current} pages={pages} total={shown.length} size={pageSize} onPage={setPage} />
      <SaveBar
        dirty={changes.length > 0}
        pending={pending}
        error={error || (invalid ? t("wholeNumbers") : "")}
        message={t("unsavedChanges", { count: changes.length })}
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
