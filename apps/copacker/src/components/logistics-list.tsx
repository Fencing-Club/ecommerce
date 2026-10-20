import { Link } from "@tanstack/react-router"
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
  Package,
  PlusCircle,
  Search,
  Ship,
  SlidersHorizontal,
  Truck,
  User,
  X
} from "lucide-react"
import { parseAsStringLiteral, useQueryState } from "nuqs"
import { useState } from "react"
import { useFormatter, useTranslations } from "use-intl"
import { PageHeader, Status, useStatusLabel } from "@/components/common"
import { SelectControl } from "@/components/form-select"
import { TabLinks } from "@/components/tab-links"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { csvCell } from "@/lib/csv"
import { cn } from "@/lib/utils"

// Who a row waits on next. "done" once nobody does.
export type ListParty = "buyer" | "supplier" | "forwarder" | "amazon" | "carrier" | "done"
export type ListStage = "draft" | "active" | "closed" | "cancelled"
export type ListViewer = "buyer" | "supplier" | "forwarder"

// A purchase order or shipment as its list shows it. The server works out the status, stage and who it waits on.
export type LogisticsRow = {
  id: string
  href: string
  // A shipment made in Seller Central opens there.
  external?: boolean
  reference: string
  // A shipment's number among its purchase order's shipments.
  number?: number
  // An Amazon shipment ID, a forwarder's tracking or the shipment's name in Seller Central.
  detail?: string
  // The supplier for a buyer or forwarder, the customer for a supplier; none for a Seller Central shipment.
  partner: string | null
  // The forwarder the goods pass through; none when they go direct.
  forwarder: string | null
  destination: string
  status: string
  stage: ListStage
  waiting: ListParty
  source: "order" | "amazon"
  // A shipment's purchase order.
  orderHref?: string
  // Purchase orders
  products?: number
  shipped?: number
  quantity?: number
  total?: string | null
  // Shipments
  cartons?: number
  ready?: string | null
}

type Kind = "orders" | "shipments"
const views = {
  orders: ["needsYou", "draft", "active", "closed", "all"],
  shipments: ["needsYou", "active", "received", "all"]
} as const
type View = (typeof views)[Kind][number]
const allViews = ["needsYou", "draft", "active", "closed", "received", "all"] as const
const columnKeys = {
  orders: ["reference", "partner", "route", "shipped", "total", "status"],
  shipments: ["reference", "partner", "route", "cartons", "ready", "status", "waiting"]
} as const
type Column = (typeof columnKeys)[Kind][number]
const filterKeys = ["partner", "status", "destination", "forwarder", "source"] as const
type FilterKey = (typeof filterKeys)[number]
type Filters = Record<FilterKey, string>
const noFilters: Filters = { partner: "", status: "", destination: "", forwarder: "", source: "" }
const pageSize = 25
const waitingIcons = { buyer: User, supplier: Factory, forwarder: Ship, amazon: Package, carrier: Truck, done: Check }

function inView(row: LogisticsRow, view: View, viewer: ListViewer) {
  switch (view) {
    case "needsYou":
      return row.waiting === viewer
    case "draft":
      return row.stage === "draft"
    case "active":
      return row.stage === "active"
    case "closed":
    case "received":
      return row.stage === "closed"
    case "all":
      return true
  }
}

// Only a buyer has drafts, and a forwarder never acts on a purchase order itself.
function shownViews(kind: Kind, viewer: ListViewer): View[] {
  return views[kind].filter(
    (view) =>
      (view !== "draft" || viewer === "buyer") && (view !== "needsYou" || kind === "shipments" || viewer === "buyer")
  )
}

function download(name: string, lines: string[][]) {
  const csv = lines.map((line) => line.map(csvCell).join(",")).join("\r\n")
  const href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
  const link = document.createElement("a")
  link.href = href
  link.download = `${name}.csv`
  link.click()
  URL.revokeObjectURL(href)
}

function FilterMenu({
  label,
  allLabel,
  value,
  options,
  onChange
}: {
  label: string
  allLabel: string
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
        <DropdownMenuItem onClick={() => onChange("")}>{allLabel}</DropdownMenuItem>
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

// The purchase order and shipment lists: views kept in the URL, then search, filters, sorting, columns, selection,
// export and pages over the rows the server sent. Below 640px of width the table keeps each row's reference and status,
// with the rest of the row under them.
export function LogisticsList({
  kind,
  viewer,
  rows,
  view: initialView,
  actions,
  notice
}: {
  kind: Kind
  viewer: ListViewer
  rows: LogisticsRow[]
  // The view the URL asked for.
  view?: string
  // The page's own actions, such as creating a purchase order.
  actions?: React.ReactNode
  // Something the viewer should know about the list, under its header.
  notice?: React.ReactNode
}) {
  const t = useTranslations("common.logistics")
  const k = useTranslations(`common.logistics.${kind}`)
  const format = useFormatter()
  const statusLabel = useStatusLabel()
  const isOrder = kind === "orders"
  const tabs = shownViews(kind, viewer)
  const fallback: View = tabs.find((tab) => tab === (isOrder ? "needsYou" : "all")) ?? "active"
  const [requested, setView] = useQueryState("view", parseAsStringLiteral(allViews).withOptions({ history: "replace" }))
  const view = tabs.find((tab) => tab === (requested ?? initialView)) ?? fallback
  const [query, setQuery] = useState("")
  const [filters, setFilters] = useState(noFilters)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [hidden, setHidden] = useState<Column[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [sort, setSort] = useState<"default" | "partner">("default")
  const [page, setPage] = useState(0)

  const partnerLabel = viewer === "supplier" ? t("filters.customer") : t("filters.supplier")
  const waitingLabel = (party: ListParty) => {
    if (party === viewer) {
      return t("waiting.you")
    }
    return party === "buyer" && viewer === "supplier" ? t("waiting.customer") : t(`waiting.${party}`)
  }
  const forwarderName = (row: LogisticsRow) => row.forwarder ?? t("direct")
  const reference = (row: LogisticsRow) =>
    row.number ? t("shipmentReference", { reference: row.reference, number: row.number }) : row.reference
  const readyDate = (date: string) =>
    format.dateTime(new Date(`${date}T12:00:00Z`), { month: "short", day: "numeric", timeZone: "UTC" })
  const value = (row: LogisticsRow, key: FilterKey) => {
    switch (key) {
      case "partner":
        return row.partner ?? ""
      case "status":
        return statusLabel(row.status)
      case "destination":
        return row.destination
      case "forwarder":
        return forwarderName(row)
      case "source":
        return row.source === "amazon" ? t("sources.amazon") : t("sources.order")
    }
  }

  const matches = rows.filter(
    (row) =>
      `${reference(row)} ${row.partner ?? ""} ${row.detail ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()) &&
      filterKeys.every((key) => !filters[key] || value(row, key) === filters[key]) &&
      (isOrder || ((!from || (row.ready && row.ready >= from)) && (!to || (row.ready && row.ready <= to))))
  )
  const shown = matches.filter((row) => inView(row, view, viewer))
  if (sort === "partner") {
    shown.sort((a, b) => (a.partner ?? "").localeCompare(b.partner ?? ""))
  } else if (!isOrder) {
    shown.sort((a, b) => (b.ready ?? "").localeCompare(a.ready ?? ""))
  }
  const pages = Math.max(1, Math.ceil(shown.length / pageSize))
  const current = Math.min(page, pages - 1)
  const visible = shown.slice(current * pageSize, (current + 1) * pageSize)
  const columns = columnKeys[kind].filter(
    (column) => !hidden.includes(column) && (column !== "total" || rows.some((row) => row.total))
  )
  const [first] = columnKeys[kind]
  const extraFilters: Array<Exclude<FilterKey, "partner">> = [
    "status",
    "destination",
    "forwarder",
    ...(!isOrder && viewer === "buyer" ? (["source"] as const) : [])
  ]
  const filterCount = extraFilters.filter((key) => filters[key]).length + Number(Boolean(from || to))
  const filtered = Boolean(query || Object.values(filters).some(Boolean) || from || to)
  const options = (key: FilterKey) => [...new Set(rows.map((row) => value(row, key)).filter(Boolean))].toSorted()

  function update(key: FilterKey, next: string) {
    setFilters({ ...filters, [key]: next })
    setPage(0)
  }
  function clear() {
    setQuery("")
    setFilters(noFilters)
    setFrom("")
    setTo("")
    setPage(0)
  }
  const columnLabel = (column: Column) => {
    if (column === "reference") {
      return k("reference")
    }
    return column === "partner" ? partnerLabel : t(`columns.${column}`)
  }
  function exportRows(list: LogisticsRow[]) {
    const fields = columnKeys[kind].filter((column) => column !== "total" || list.some((row) => row.total))
    const text = (row: LogisticsRow, column: Column) => {
      switch (column) {
        case "reference":
          return reference(row)
        case "partner":
          return row.partner ?? ""
        case "route":
          return row.forwarder
            ? t("route", { forwarder: row.forwarder, destination: row.destination })
            : row.destination
        case "shipped":
          return t("shipped", { shipped: row.shipped ?? 0, quantity: row.quantity ?? 0 })
        case "total":
          return row.total ?? ""
        case "cartons":
          return String(row.cartons ?? "")
        case "ready":
          return row.ready ?? ""
        case "status":
          return statusLabel(row.status)
        case "waiting":
          return waitingLabel(row.waiting)
      }
    }
    download(k("file"), [fields.map(columnLabel), ...list.map((row) => fields.map((column) => text(row, column)))])
  }

  function cell(row: LogisticsRow, column: Column) {
    switch (column) {
      case "reference":
        return (
          <>
            {row.external ? (
              <a
                href={row.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 font-medium hover:underline"
              >
                {reference(row)}
                <ExternalLink aria-hidden className="size-3" />
                <span className="sr-only"> {t("opensInSellerCentral")}</span>
              </a>
            ) : (
              <Link to="." href={row.href} className="font-medium underline-offset-4 hover:underline">
                {reference(row)}
              </Link>
            )}
            {(isOrder || row.detail) && (
              <div className="mt-0.5 text-xs whitespace-normal text-muted-foreground">
                {isOrder ? t("products", { count: row.products ?? 0 }) : row.detail}
              </div>
            )}
          </>
        )
      case "partner":
        return row.partner ?? "—"
      case "route":
        return (
          <span className="flex items-center gap-1.5 text-[13px]">
            {row.forwarder && (
              <>
                <span className="text-muted-foreground">{row.forwarder}</span>
                <ArrowRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground rtl:rotate-180" />
              </>
            )}
            {row.destination}
          </span>
        )
      case "shipped":
        return (
          <div className="min-w-32 text-xs text-muted-foreground">
            {t("shipped", { shipped: row.shipped ?? 0, quantity: row.quantity ?? 0 })}
            <progress
              aria-label={t("shippedLabel", { reference: row.reference })}
              max={row.quantity || 1}
              value={row.shipped ?? 0}
              className="mt-1 block h-1 w-full appearance-none overflow-hidden rounded-full border-0 bg-muted [&::-moz-progress-bar]:bg-info [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-info"
            />
          </div>
        )
      case "total":
        return row.total ?? "—"
      case "cartons":
        return row.cartons || "—"
      case "ready":
        return row.ready ? readyDate(row.ready) : "—"
      case "status":
        return <Status status={row.status} />
      case "waiting": {
        const Icon = waitingIcons[row.waiting]
        return (
          <span className="flex items-center gap-1.5 text-[13px]">
            <Icon aria-hidden className="size-3.5 text-muted-foreground" />
            {waitingLabel(row.waiting)}
          </span>
        )
      }
    }
  }

  const wide = (column: Column) => column !== first && column !== "status" && "hidden @min-[640px]/list:table-cell"
  return (
    <div className="@container/list flex min-w-0 flex-col gap-6">
      <PageHeader title={k("title")}>
        {actions}
        {!isOrder && (
          <Button variant="outline" onClick={() => exportRows(shown)} disabled={!shown.length}>
            <Download data-icon="inline-start" />
            {t("export")}
          </Button>
        )}
      </PageHeader>
      {notice}
      <TabLinks
        label={k("views")}
        tabs={tabs.map((tab) => ({
          label: t(`views.${tab}`),
          href: `/${kind}?view=${tab}`,
          current: view === tab,
          count: matches.filter((row) => inView(row, tab, viewer)).length,
          attention: tab === "needsYou"
        }))}
        onSelect={(href) => {
          void setView(tabs.find((tab) => href.endsWith(`=${tab}`)) ?? null)
          setPage(0)
          setSelected([])
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full @min-[760px]/list:w-80">
          <Search className="pointer-events-none absolute start-3 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            type="search"
            aria-label={k("search")}
            placeholder={k("searchPlaceholder")}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(0)
            }}
            className="h-[34px] ps-8 text-xs md:text-xs"
          />
        </div>
        <FilterMenu
          label={partnerLabel}
          allLabel={viewer === "supplier" ? t("filters.allCustomers") : t("filters.allSuppliers")}
          value={filters.partner}
          options={options("partner")}
          onChange={(next) => update("partner", next)}
        />
        <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
          <PopoverTrigger render={<Button variant="outline" className="text-xs" />}>
            <SlidersHorizontal className="size-3.5" />
            {t("filters.button")}
            {filterCount > 0 && <span className="rounded-full bg-muted px-1.5 tabular-nums">{filterCount}</span>}
          </PopoverTrigger>
          <PopoverContent
            align="start"
            aria-label={t("filters.label")}
            className="w-72 max-w-[calc(100vw-2rem)] gap-3 p-4"
          >
            {extraFilters.map((key) => (
              <div key={key} className="grid gap-1.5">
                <label htmlFor={`list-filter-${key}`} className="text-xs font-medium">
                  {t(`filters.${key}`)}
                </label>
                <SelectControl
                  id={`list-filter-${key}`}
                  value={filters[key]}
                  placeholder={t("filters.any")}
                  options={options(key).map((option) => ({ value: option, label: option }))}
                  onValueChange={(next) => update(key, next ?? "")}
                />
              </div>
            ))}
            {!isOrder && (
              <fieldset className="grid gap-2">
                <legend className="mb-1.5 text-xs font-medium">{t("filters.ready")}</legend>
                <label htmlFor="list-ready-from" className="grid gap-1 text-xs">
                  {t("filters.from")}
                  <Input
                    id="list-ready-from"
                    type="date"
                    value={from}
                    max={to || undefined}
                    onChange={(event) => {
                      setFrom(event.target.value)
                      setPage(0)
                    }}
                  />
                </label>
                <label htmlFor="list-ready-to" className="grid gap-1 text-xs">
                  {t("filters.to")}
                  <Input
                    id="list-ready-to"
                    type="date"
                    value={to}
                    min={from || undefined}
                    onChange={(event) => {
                      setTo(event.target.value)
                      setPage(0)
                    }}
                  />
                </label>
              </fieldset>
            )}
            <div className="flex justify-between gap-2 border-t pt-3">
              <Button variant="ghost" onClick={clear}>
                {t("filters.clear")}
              </Button>
              <Button onClick={() => setFiltersOpen(false)}>{t("filters.done")}</Button>
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
                  aria-label={t("sort.label", {
                    name: sort === "partner" ? partnerLabel : t(`sort.${isOrder ? "newest" : "ready"}`)
                  })}
                />
              }
            >
              <ArrowDownUp />
              <span className="hidden @min-[480px]/list:inline">
                {sort === "partner" ? partnerLabel : t(`sort.${isOrder ? "newest" : "ready"}`)}
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-44">
              <DropdownMenuItem
                onClick={() => {
                  setSort("default")
                  setPage(0)
                }}
              >
                {t(`sort.${isOrder ? "newest" : "ready"}`)}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setSort("partner")
                  setPage(0)
                }}
              >
                {partnerLabel}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={t("columnsLabel")}
                  className="hidden @min-[640px]/list:inline-flex"
                />
              }
            >
              <Columns3 />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {columnKeys[kind]
                .filter((column) => column !== first && (column !== "total" || rows.some((row) => row.total)))
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column}
                    checked={!hidden.includes(column)}
                    onCheckedChange={(checked) =>
                      setHidden(checked ? hidden.filter((other) => other !== column) : [...hidden, column])
                    }
                  >
                    {columnLabel(column)}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {filtered && (
        <fieldset className="-mt-3 flex min-w-0 flex-wrap items-center gap-2">
          <legend className="sr-only">{t("filters.applied")}</legend>
          {filterKeys
            .filter((key) => filters[key])
            .map((key) => {
              const name = key === "partner" ? partnerLabel : t(`filters.${key}`)
              return (
                <Button
                  key={key}
                  variant="outline"
                  size="sm"
                  className="max-w-full text-xs"
                  aria-label={t("filters.remove", { name })}
                  onClick={() => update(key, "")}
                >
                  <span className="truncate">{t("filters.chip", { name, value: filters[key] })}</span>
                  <X className="size-3" />
                </Button>
              )
            })}
          {(from || to) && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              aria-label={t("filters.remove", { name: t("filters.ready") })}
              onClick={() => {
                setFrom("")
                setTo("")
                setPage(0)
              }}
            >
              {t("filters.readyRange", {
                from: from ? readyDate(from) : t("filters.any"),
                to: to ? readyDate(to) : t("filters.any")
              })}
              <X className="size-3" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={clear}>
            {t("filters.clear")}
          </Button>
        </fieldset>
      )}
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <output>{t("selection.count", { count: selected.length })}</output>
          <Button variant="outline" onClick={() => exportRows(rows.filter((row) => selected.includes(row.id)))}>
            <Download data-icon="inline-start" />
            {t("selection.export")}
          </Button>
          <Button variant="ghost" onClick={() => setSelected([])}>
            {t("selection.clear")}
          </Button>
        </div>
      )}
      <section className="min-w-0" aria-label={k("table")}>
        <Table
          className={cn(
            "[&_td]:px-4 [&_td]:py-2.5 [&_th]:h-[34px] [&_th]:px-4 [&_th]:text-xs [&_th]:text-muted-foreground",
            "table-fixed @min-[640px]/list:table-auto @max-[480px]/list:block"
          )}
        >
          <TableHeader className="@max-[480px]/list:hidden">
            <TableRow>
              {isOrder && (
                <TableHead className="w-10">
                  <Checkbox
                    aria-label={k("selectAll")}
                    disabled={!visible.length}
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
              {columns.map((column) => (
                <TableHead
                  key={column}
                  className={cn(
                    wide(column),
                    ["cartons", "total"].includes(column) && "text-end",
                    column === "status" && "w-48 text-end @min-[640px]/list:w-auto @min-[640px]/list:text-start"
                  )}
                >
                  {columnLabel(column)}
                </TableHead>
              ))}
              {!isOrder && (
                <TableHead className="w-10">
                  <span className="sr-only">{t("actionsColumn")}</span>
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
                      aria-label={t("selection.select", { reference: row.reference })}
                      checked={selected.includes(row.id)}
                      onCheckedChange={(checked) =>
                        setSelected(checked ? [...selected, row.id] : selected.filter((id) => id !== row.id))
                      }
                    />
                  </TableCell>
                )}
                {columns.map((column) => (
                  <TableCell
                    key={column}
                    className={cn(
                      "whitespace-normal",
                      wide(column),
                      column === "ready" && "whitespace-nowrap",
                      ["cartons", "total"].includes(column) && "text-end tabular-nums",
                      column === "status" && "text-end @min-[640px]/list:text-start",
                      column === first && "@max-[480px]/list:block @max-[480px]/list:pe-12",
                      column === "status" &&
                        "@max-[480px]/list:flex @max-[480px]/list:items-center @max-[480px]/list:justify-between @max-[480px]/list:gap-2 @max-[480px]/list:pt-0"
                    )}
                  >
                    {cell(row, column)}
                    {column === first && (
                      <div className="mt-1 space-y-1 text-xs text-muted-foreground @min-[640px]/list:hidden">
                        {!hidden.includes("partner") && row.partner && <div>{row.partner}</div>}
                        {!hidden.includes("route") && (
                          <div>
                            {row.forwarder
                              ? t("route", { forwarder: row.forwarder, destination: row.destination })
                              : row.destination}
                          </div>
                        )}
                      </div>
                    )}
                    {column === "status" && (
                      <div className="mt-2 text-xs @min-[640px]/list:hidden">
                        {isOrder ? row.total : t("cartons", { count: row.cartons ?? 0 })}
                        <div className="mt-1 text-muted-foreground">
                          {isOrder
                            ? t("shipped", { shipped: row.shipped ?? 0, quantity: row.quantity ?? 0 })
                            : row.ready && t("readyOn", { date: readyDate(row.ready) })}
                        </div>
                      </div>
                    )}
                  </TableCell>
                ))}
                {!isOrder && (
                  <TableCell className="w-10 @max-[480px]/list:absolute @max-[480px]/list:end-0 @max-[480px]/list:top-0">
                    {!row.external && (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t("rowActions", { reference: reference(row) })}
                            />
                          }
                        >
                          <Ellipsis />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem render={<Link to="." href={row.href} />}>
                            {t("viewShipment")}
                          </DropdownMenuItem>
                          {row.orderHref && (
                            <DropdownMenuItem render={<Link to="." href={row.orderHref} />}>
                              {viewer === "supplier" ? t("viewOrder") : t("viewPurchaseOrder")}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
            {/* Inside the table, so the empty view keeps the table's border and rounded corners. */}
            {!visible.length && (
              <TableRow className="hover:bg-transparent @max-[480px]/list:block">
                <TableCell colSpan={columns.length + 1} className="@max-[480px]/list:block">
                  <div className="flex flex-col items-center gap-3 px-6 py-12 text-center whitespace-normal">
                    <Package aria-hidden className="size-8 text-muted-foreground" />
                    <h2 className="font-medium">{filtered ? k("noMatches") : k(`empty.${view}`)}</h2>
                    {filtered && <p className="text-sm text-muted-foreground">{t("noMatchesDescription")}</p>}
                    {filtered && (
                      <Button variant="outline" onClick={clear}>
                        {t("filters.clear")}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          {shown.length > pageSize
            ? k("showing", {
                from: current * pageSize + 1,
                to: Math.min((current + 1) * pageSize, shown.length),
                count: shown.length
              })
            : k("count", { count: shown.length })}
        </span>
        {shown.length > pageSize && (
          <div className="flex gap-2">
            <Button
              aria-label={t("previousPage")}
              variant="outline"
              size="icon"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeft className="rtl:rotate-180" />
            </Button>
            <Button
              aria-label={t("nextPage")}
              variant="outline"
              size="icon"
              disabled={current + 1 >= pages}
              onClick={() => setPage(current + 1)}
            >
              <ChevronRight className="rtl:rotate-180" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
