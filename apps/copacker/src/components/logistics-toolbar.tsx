import { ArrowDownUp, Columns3, PlusCircle, SlidersHorizontal } from "lucide-react"
import { useState } from "react"
import { useTranslations } from "use-intl"
import { SelectControl } from "@/components/form-select"
import { SearchField } from "@/components/list/search-field"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  columnKeys,
  type FilterKey,
  type ListAction,
  type ListColumn,
  listColumns,
  type ListKind,
  type ListState,
  type ListViewer,
  type LogisticsRow
} from "@/lib/logistics-list"
import { cn } from "@/lib/utils"
import { useLogisticsText } from "./use-logistics-text"

// A filter's menu of the values the rows have, with one to show them all.
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

// Above the purchase order or shipment list: search, the supplier (or customer) menu, the Filters panel with the rest
// of the filters and, for shipments, a ready-date range, then the order and the columns shown. Each filter offers the
// values the rows have.
export function LogisticsToolbar({
  kind,
  viewer,
  rows,
  state,
  hidden,
  dispatch,
  onHiddenChange
}: {
  kind: ListKind
  viewer: ListViewer
  // Every row the list has, for the filters' values.
  rows: LogisticsRow[]
  state: ListState
  // The columns hidden from the table.
  hidden: ListColumn[]
  dispatch: (action: ListAction) => void
  onHiddenChange: (hidden: ListColumn[]) => void
}) {
  const t = useTranslations("common.logistics")
  const k = useTranslations(`common.logistics.${kind}`)
  const text = useLogisticsText(kind, viewer)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const isOrder = kind === "orders"
  const { filters, from, to } = state
  const extraFilters: Array<Exclude<FilterKey, "partner">> = [
    "status",
    "destination",
    "forwarder",
    ...(!isOrder && viewer === "buyer" ? (["source"] as const) : [])
  ]
  const filterCount = extraFilters.filter((key) => filters[key]).length + Number(Boolean(from || to))
  const options = (key: FilterKey) => [...new Set(rows.map((row) => text.value(row, key)).filter(Boolean))].toSorted()
  const defaultSort = t(`sort.${isOrder ? "newest" : "ready"}`)
  const sortName = state.sort === "partner" ? text.partnerLabel : defaultSort
  const [first] = columnKeys[kind]
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchField
        label={k("search")}
        placeholder={k("searchPlaceholder")}
        value={state.query}
        onChange={(query) => dispatch({ type: "search", query })}
        className="h-[34px] w-full @min-[760px]/list:w-80"
      />
      <FilterMenu
        label={text.partnerLabel}
        allLabel={viewer === "supplier" ? t("filters.allCustomers") : t("filters.allSuppliers")}
        value={filters.partner}
        options={options("partner")}
        onChange={(value) => dispatch({ type: "filter", key: "partner", value })}
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
                onValueChange={(value) => dispatch({ type: "filter", key, value: value ?? "" })}
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
                  onChange={(event) => dispatch({ type: "ready", from: event.target.value })}
                />
              </label>
              <label htmlFor="list-ready-to" className="grid gap-1 text-xs">
                {t("filters.to")}
                <Input
                  id="list-ready-to"
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(event) => dispatch({ type: "ready", to: event.target.value })}
                />
              </label>
            </fieldset>
          )}
          <div className="flex justify-between gap-2 border-t pt-3">
            <Button variant="ghost" onClick={() => dispatch({ type: "clear" })}>
              {t("filters.clear")}
            </Button>
            <Button onClick={() => setFiltersOpen(false)}>{t("filters.done")}</Button>
          </div>
        </PopoverContent>
      </Popover>
      <div className="ms-auto flex gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="outline" className="text-xs" aria-label={t("sort.label", { name: sortName })} />}
          >
            <ArrowDownUp />
            <span className="hidden @min-[480px]/list:inline">{sortName}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44">
            <DropdownMenuItem onClick={() => dispatch({ type: "sort", sort: "default" })}>
              {defaultSort}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => dispatch({ type: "sort", sort: "partner" })}>
              {text.partnerLabel}
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
            {listColumns(kind, rows)
              .filter((column) => column !== first)
              .map((column) => (
                <DropdownMenuCheckboxItem
                  key={column}
                  checked={!hidden.includes(column)}
                  onCheckedChange={(checked) =>
                    onHiddenChange(checked ? hidden.filter((other) => other !== column) : [...hidden, column])
                  }
                >
                  {text.columnLabel(column)}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
