import {
  ArrowDownUp,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  Ellipsis,
  ExternalLink,
  Factory,
  FileUp,
  MapPin,
  Package,
  Plus,
  PlusCircle,
  Search,
  Ship,
  User,
  SlidersHorizontal,
  X
} from "lucide-react"
import { useState } from "react"
import { PageHeader, StatusBadge } from "@/components/common"
import { SelectControl } from "@/components/form-select"
import { TabLinks } from "@/components/tab-links"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { useMoney } from "@/hooks/use-money"
import { cn } from "@/lib/utils"
import { type LogisticsRow, purchaseOrderListRows, shipmentListRows } from "./fixtures/logistics-lists"

type Kind = "orders" | "shipments"
type Filters = { supplier: string; destination: string; forwarder: string; source: string; status: string }
const emptyFilters: Filters = { supplier: "", destination: "", forwarder: "", source: "", status: "" }
const viewNames = {
  orders: ["Needs you", "Drafts", "Active", "Closed", "All"],
  shipments: ["Needs you", "Active", "Received", "All"]
}
const columns = {
  orders: ["Purchase order", "Supplier", "Route", "Shipped", "Total", "Status"],
  shipments: ["Shipment", "Supplier", "Route", "Cartons", "Ready", "Status", "Waiting on"]
}
function inView(row: LogisticsRow, view: string) {
  if (view === "Active") {
    return !["Drafts", "Closed", "Received"].includes(row.view)
  }
  return view === "All" || (view === "Needs you" ? row.needsYou : row.view === view)
}

function FilterMenu({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" className={cn("text-xs", value && "border-primary bg-primary-soft text-primary")} />
        }
      >
        <PlusCircle className="size-3.5" />
        {label}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60">
        <DropdownMenuItem onClick={() => onChange("")}>All {label.toLowerCase()}s</DropdownMenuItem>
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option}
            checked={value === option}
            onCheckedChange={(checked) => onChange(checked ? option : "")}
          >
            {option}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function exportRows(rows: LogisticsRow[], kind: Kind) {
  const fields =
    kind === "orders"
      ? (["reference", "supplier", "destination", "quantity", "shipped", "total", "status"] as const)
      : (["reference", "supplier", "origin", "destination", "cartons", "ready", "status", "waiting"] as const)
  const csv = [
    fields.map((field) => (field === "total" ? "total_usd" : field)).join(","),
    ...rows.map((row) =>
      fields
        .map((field) => {
          const value = field === "total" ? (row.total / 100).toFixed(2) : String(row[field])
          return `"${value.replaceAll('"', '""')}"`
        })
        .join(",")
    )
  ].join("\r\n")
  const href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
  const link = document.createElement("a")
  link.href = href
  link.download = `${kind}.csv`
  link.click()
  URL.revokeObjectURL(href)
}

// Design review surface. Local state exercises the lists without changing live orders or shipments.
export function LogisticsList({
  kind,
  initialView,
  initialQuery = "",
  initialSupplier = "",
  initialStatus = "",
  empty = false
}: {
  kind: Kind
  initialView?: string
  initialQuery?: string
  initialSupplier?: string
  initialStatus?: string
  empty?: boolean
}) {
  const isOrder = kind === "orders"
  const title = isOrder ? "Purchase orders" : "Shipments"
  const fixtureRows = isOrder ? purchaseOrderListRows : shipmentListRows
  const allRows = empty ? [] : fixtureRows
  const emptyDescription = isOrder
    ? "Create a purchase order to get started."
    : "Shipments will appear here when products are grouped into shipments."
  const [view, setView] = useState(initialView ?? (isOrder ? "Needs you" : "All"))
  const [query, setQuery] = useState(initialQuery)
  const [filters, setFilters] = useState({ ...emptyFilters, supplier: initialSupplier, status: initialStatus })
  const [hidden, setHidden] = useState<string[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [sort, setSort] = useState("")
  const [page, setPage] = useState(0)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [filtersOpen, setFiltersOpen] = useState(false)
  const money = useMoney()
  const rows = allRows.filter(
    (row) =>
      inView(row, view) &&
      `${row.reference} ${row.supplier} ${row.detail}`.toLowerCase().includes(query.toLowerCase()) &&
      (!filters.supplier || row.supplier === filters.supplier) &&
      (!filters.destination || row.destination === filters.destination) &&
      (!filters.forwarder || row.origin === filters.forwarder) &&
      (!filters.source || row.source === filters.source) &&
      (!filters.status || row.status === filters.status) &&
      (isOrder || ((!from || row.ready >= from) && (!to || row.ready <= to)))
  )
  if (sort) {
    rows.sort((a, b) => {
      if (sort === "Reference") {
        return b.reference.localeCompare(a.reference)
      }
      if (sort === "Supplier") {
        return a.supplier.localeCompare(b.supplier)
      }
      return b.ready.localeCompare(a.ready)
    })
  }
  const currentPage = Math.min(page, Math.max(0, Math.ceil(rows.length / 11) - 1))
  const visible = rows.slice(currentPage * 11, (currentPage + 1) * 11)
  const shownColumns = columns[kind].filter((column) => !hidden.includes(column))
  const activeFilters = query || Object.values(filters).some(Boolean) || from || to
  const filterCount =
    Object.entries(filters).filter(([key, value]) => key !== "supplier" && value).length + Number(Boolean(from || to))
  const extraFilters = isOrder
    ? (["status", "destination", "forwarder"] as const)
    : (["status", "destination", "forwarder", "source"] as const)
  function options(key: keyof Filters) {
    return [...new Set(allRows.map((row) => (key === "forwarder" ? row.origin : row[key])))].sort()
  }
  function updateFilter(key: keyof Filters, value: string) {
    setFilters({ ...filters, [key]: value })
    setPage(0)
  }
  function clearFilters() {
    setQuery("")
    setFilters(emptyFilters)
    setFrom("")
    setTo("")
    setPage(0)
  }
  function date(value: string) {
    return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC"
    })
  }
  function cell(row: LogisticsRow, column: string) {
    switch (column) {
      case "Purchase order":
      case "Shipment":
        return (
          <>
            <a href={`/${kind}/${row.id}`} className="inline-flex items-center gap-1.5 font-medium hover:underline">
              {row.reference}
              {row.source === "Amazon" && <ExternalLink className="size-3" />}
            </a>
            {(isOrder || row.detail) && (
              <div
                className={cn("mt-0.5 text-xs text-muted-foreground", row.tone === "destructive" && "text-destructive")}
              >
                {isOrder ? `${row.products} products` : row.detail}
              </div>
            )}
          </>
        )
      case "Supplier":
        return <span className={cn(row.source === "Amazon" && "text-muted-foreground")}>{row.supplier}</span>
      case "Route":
        return (
          <span className="flex items-center gap-1.5 text-[13px]">
            {isOrder ? (
              <>
                {row.origin === "Direct" ? <MapPin className="size-3.5" /> : <Factory className="size-3.5" />}
                {row.destination.startsWith("Amazon") ? `Amazon via ${row.origin}` : row.destination}
              </>
            ) : (
              <>
                <span className="text-muted-foreground">{row.origin}</span>
                <ArrowRight className="size-3.5 text-muted-foreground" />
                {row.destination}
              </>
            )}
          </span>
        )
      case "Shipped":
        return (
          <div className="min-w-32 text-xs text-muted-foreground">
            {row.shipped} of {row.quantity} shipped
            <progress
              aria-label={`${row.reference} shipped`}
              max={row.quantity}
              value={row.shipped}
              className="mt-1 block h-1 w-full appearance-none overflow-hidden rounded-full border-0 bg-muted [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-info [&::-moz-progress-bar]:bg-info"
            />
          </div>
        )
      case "Total":
        return money(row.total)
      case "Cartons":
        return row.cartons
      case "Ready":
        return date(row.ready)
      case "Status":
        return <StatusBadge tone={row.tone}>{row.status}</StatusBadge>
      case "Waiting on": {
        const Icon = { Supplier: Factory, Forwarder: Ship, You: User, Amazon: Package, Done: Check }[row.waiting]
        return (
          <span className="flex items-center gap-1.5 text-[13px]">
            <Icon className="size-3.5 text-muted-foreground" />
            {row.waiting}
          </span>
        )
      }
    }
  }
  return (
    <div className="@container/list flex min-w-0 flex-col gap-6">
      <PageHeader title={title}>
        {isOrder ? (
          <>
            <Button nativeButton={false} variant="outline" render={<a aria-label="Import" href="/orders/import" />}>
              <FileUp />
              Import
            </Button>
            <Button nativeButton={false} render={<a aria-label="Create purchase order" href="/orders/new" />}>
              <Plus />
              Create purchase order
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={() => exportRows(rows, kind)}>
            <Download />
            Export
          </Button>
        )}
      </PageHeader>
      <TabLinks
        label={`${title} views`}
        tabs={viewNames[kind].map((name) => ({
          label: name,
          href: `/${kind}?view=${encodeURIComponent(name)}`,
          current: view === name,
          count: allRows.filter((row) => inView(row, name)).length,
          attention: name === "Needs you"
        }))}
        onSelect={(href) => {
          setView(new URL(href, "https://copacker.ai").searchParams.get("view") ?? "All")
          setPage(0)
          setSelected([])
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full @min-[760px]/list:w-80">
          <Search className="pointer-events-none absolute start-3 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            aria-label={`Search ${title.toLowerCase()}`}
            placeholder={
              isOrder ? "Search reference, supplier, or Amazon ID" : "Search purchase order, shipment, or Amazon ID"
            }
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(0)
            }}
            className="h-[34px] ps-8 text-xs md:text-xs"
          />
        </div>
        <FilterMenu
          label="Supplier"
          value={filters.supplier}
          options={options("supplier")}
          onChange={(value) => updateFilter("supplier", value)}
        />
        <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
          <PopoverTrigger render={<Button variant="outline" className="text-xs" />}>
            <SlidersHorizontal className="size-3.5" />
            Filters{filterCount > 0 && <span className="rounded-full bg-muted px-1.5 tabular-nums">{filterCount}</span>}
          </PopoverTrigger>
          <PopoverContent align="start" aria-label="List filters" className="w-72 max-w-[calc(100vw-2rem)] gap-3 p-4">
            {extraFilters.map((key) => (
              <div key={key} className="grid gap-1.5">
                <label htmlFor={`list-filter-${key}`} className="text-xs font-medium">
                  {key[0].toUpperCase() + key.slice(1)}
                </label>
                <SelectControl
                  id={`list-filter-${key}`}
                  value={filters[key]}
                  placeholder="Any"
                  options={options(key).map((value) => ({ value, label: value }))}
                  onValueChange={(value) => updateFilter(key, value ?? "")}
                />
              </div>
            ))}
            {!isOrder && (
              <fieldset className="grid gap-2">
                <legend className="mb-1.5 text-xs font-medium">Ready date</legend>
                <label htmlFor="list-ready-from" className="grid gap-1 text-xs">
                  From
                  <Input
                    id="list-ready-from"
                    type="date"
                    value={from}
                    onChange={(event) => {
                      setFrom(event.target.value)
                      setPage(0)
                    }}
                  />
                </label>
                <label htmlFor="list-ready-to" className="grid gap-1 text-xs">
                  To
                  <Input
                    id="list-ready-to"
                    type="date"
                    value={to}
                    min={from}
                    onChange={(event) => {
                      setTo(event.target.value)
                      setPage(0)
                    }}
                  />
                </label>
              </fieldset>
            )}
            <div className="flex justify-between gap-2 border-t pt-3">
              <Button variant="ghost" onClick={clearFilters}>
                Clear filters
              </Button>
              <Button onClick={() => setFiltersOpen(false)}>Done</Button>
            </div>
          </PopoverContent>
        </Popover>
        <div className="ms-auto flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  className="text-xs"
                  aria-label={`Sort by ${sort || (isOrder ? "Reference" : "Ready date")}`}
                />
              }
            >
              <ArrowDownUp />
              <span className="hidden @min-[480px]/list:inline">{sort || (isOrder ? "Reference" : "Ready date")}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-44">
              {[isOrder ? "Reference" : "Ready date", "Supplier"].map((value) => (
                <DropdownMenuItem
                  key={value}
                  onClick={() => {
                    setSort(value)
                    setPage(0)
                  }}
                >
                  {value}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Columns"
                  className="hidden @min-[640px]/list:inline-flex"
                />
              }
            >
              <Columns3 />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {columns[kind].slice(1).map((column) => (
                <DropdownMenuCheckboxItem
                  key={column}
                  checked={!hidden.includes(column)}
                  onCheckedChange={(checked) =>
                    setHidden(checked ? hidden.filter((value) => value !== column) : [...hidden, column])
                  }
                >
                  {column}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {activeFilters && (
        <div className="-mt-3 flex flex-wrap items-center gap-2" aria-label="Applied filters">
          {(Object.keys(emptyFilters) as Array<keyof Filters>)
            .filter((key) => filters[key])
            .map((key) => (
              <Button
                key={key}
                variant="outline"
                size="sm"
                className="max-w-full text-xs"
                aria-label={`Remove ${key} filter`}
                onClick={() => updateFilter(key, "")}
              >
                <span className="truncate">
                  {key[0].toUpperCase() + key.slice(1)}: {filters[key]}
                </span>
                <X className="size-3" />
              </Button>
            ))}
          {(from || to) && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              aria-label="Remove ready date filter"
              onClick={() => {
                setFrom("")
                setTo("")
                setPage(0)
              }}
            >
              Ready date: {from ? date(from) : "Any"} to {to ? date(to) : "Any"}
              <X className="size-3" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      )}
      {selected.length > 0 && (
        <div className="flex items-center gap-3 text-sm">
          <output>{selected.length} selected</output>
          <Button
            variant="outline"
            onClick={() =>
              exportRows(
                allRows.filter((row) => selected.includes(row.id)),
                kind
              )
            }
          >
            <Download />
            Export selected
          </Button>
          <Button variant="ghost" onClick={() => setSelected([])}>
            Clear selection
          </Button>
        </div>
      )}
      <section className="min-w-0" aria-label={`${title} table`}>
        <Table
          className={cn(
            "[&_th]:h-[34px] [&_th]:px-4 [&_th]:text-xs [&_th]:text-muted-foreground [&_td]:px-4 [&_td]:py-2.5",
            "table-fixed @min-[640px]/list:table-auto @max-[480px]/list:block"
          )}
        >
          <TableHeader className="@max-[480px]/list:hidden">
            <TableRow>
              {isOrder && (
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Select all visible purchase orders"
                    checked={visible.length > 0 && visible.every((row) => selected.includes(row.id))}
                    indeterminate={
                      visible.some((row) => selected.includes(row.id)) &&
                      !visible.every((row) => selected.includes(row.id))
                    }
                    onCheckedChange={(checked) =>
                      setSelected(
                        checked
                          ? [...new Set([...selected, ...visible.map((row) => row.id)])]
                          : selected.filter((id) => !visible.some((row) => row.id === id))
                      )
                    }
                  />
                </TableHead>
              )}
              {shownColumns.map((column) => (
                <TableHead
                  key={column}
                  className={cn(
                    ![columns[kind][0], "Status"].includes(column) && "hidden @min-[640px]/list:table-cell",
                    ["Cartons", "Total", "Status"].includes(column) && "text-end",
                    column === "Status" && "w-48 @min-[640px]/list:w-auto @min-[640px]/list:text-start"
                  )}
                >
                  {column}
                </TableHead>
              ))}
              {!isOrder && (
                <TableHead className="w-10">
                  <span className="sr-only">Actions</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody className="@max-[480px]/list:block">
            {visible.map((row) => (
              <TableRow
                key={row.id}
                data-state={selected.includes(row.id) ? "selected" : undefined}
                className={cn(
                  "h-[60px] @max-[480px]/list:relative @max-[480px]/list:block @max-[480px]/list:h-auto",
                  isOrder && "@max-[480px]/list:ps-8"
                )}
              >
                {isOrder && (
                  <TableCell className="@max-[480px]/list:absolute @max-[480px]/list:start-0 @max-[480px]/list:top-0">
                    <Checkbox
                      aria-label={`Select ${row.reference}`}
                      checked={selected.includes(row.id)}
                      onCheckedChange={(checked) =>
                        setSelected(checked ? [...selected, row.id] : selected.filter((id) => id !== row.id))
                      }
                    />
                  </TableCell>
                )}
                {shownColumns.map((column) => (
                  <TableCell
                    key={column}
                    className={cn(
                      "whitespace-normal",
                      column === "Ready" && "whitespace-nowrap",
                      column === "Status" && "@min-[640px]/list:text-start",
                      column === columns[kind][0] && "@max-[480px]/list:block @max-[480px]/list:pe-12",
                      column === "Status" &&
                        "@max-[480px]/list:flex @max-[480px]/list:items-center @max-[480px]/list:justify-between @max-[480px]/list:gap-2 @max-[480px]/list:pt-0",
                      ![columns[kind][0], "Status"].includes(column) && "hidden @min-[640px]/list:table-cell",
                      ["Cartons", "Total", "Status"].includes(column) && "text-end tabular-nums"
                    )}
                  >
                    {cell(row, column)}
                    {column === columns[kind][0] && (
                      <div className="mt-1 space-y-1 text-xs text-muted-foreground @min-[640px]/list:hidden">
                        {!hidden.includes("Supplier") && <div>{row.supplier}</div>}
                        {!hidden.includes("Route") && (
                          <div>{row.origin === "Direct" ? row.destination : `${row.origin} → ${row.destination}`}</div>
                        )}
                      </div>
                    )}
                    {column === "Status" && (
                      <div className="mt-2 text-xs @min-[640px]/list:hidden">
                        {isOrder ? money(row.total) : `${row.cartons} cartons`}
                        <div className="mt-1 text-muted-foreground">
                          {isOrder ? `${row.shipped} of ${row.quantity} shipped` : `Ready ${date(row.ready)}`}
                        </div>
                      </div>
                    )}
                  </TableCell>
                ))}
                {!isOrder && (
                  <TableCell className="w-10 @max-[480px]/list:absolute @max-[480px]/list:end-0 @max-[480px]/list:top-0">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.reference}`} />}
                      >
                        <Ellipsis />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem render={<a aria-label="View shipment" href={`/shipments/${row.id}`} />}>
                          View shipment
                        </DropdownMenuItem>
                        {row.source === "Purchase order" && (
                          <DropdownMenuItem
                            render={
                              <a aria-label="View purchase order" href={`/orders/${row.reference.split(",")[0]}`} />
                            }
                          >
                            View purchase order
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!visible.length && (
          <div className="flex flex-col items-center gap-3 rounded-b-lg border border-t-0 px-6 py-14 text-center">
            <Package className="size-8 text-muted-foreground" />
            <h2 className="font-medium">
              {empty ? `No ${title.toLowerCase()} yet` : `No matching ${title.toLowerCase()}`}
            </h2>
            <p className="text-sm text-muted-foreground">
              {empty ? emptyDescription : "Try another search or change your filters."}
            </p>
            {!empty && (
              <Button
                variant="outline"
                onClick={() => {
                  clearFilters()
                  setView("All")
                  setFrom("")
                  setTo("")
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        )}
      </section>
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          {rows.length > 11 || !isOrder
            ? `Showing ${rows.length ? currentPage * 11 + 1 : 0}–${Math.min((currentPage + 1) * 11, rows.length)} of ${rows.length} ${title.toLowerCase()}`
            : `${rows.length} purchase ${rows.length === 1 ? "order" : "orders"}`}
        </span>
        {(!isOrder || rows.length > 11) && (
          <div className="flex gap-2">
            <Button
              aria-label="Previous page"
              variant="outline"
              size="icon"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              aria-label="Next page"
              variant="outline"
              size="icon"
              disabled={(currentPage + 1) * 11 >= rows.length}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
