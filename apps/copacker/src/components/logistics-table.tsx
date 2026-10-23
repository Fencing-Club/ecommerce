import { Link } from "@tanstack/react-router"
import { ArrowRight, Check, Ellipsis, ExternalLink, Factory, Package, Ship, Truck, User } from "lucide-react"
import { useTranslations } from "use-intl"
import { Status } from "@/components/common"
import { NoValue } from "@/components/no-value"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  columnKeys,
  type ListColumn,
  type ListKind,
  type ListView,
  type ListViewer,
  type LogisticsRow
} from "@/lib/logistics-list"
import { cn } from "@/lib/utils"
import { useLogisticsText } from "./use-logistics-text"

const waitingIcons = { buyer: User, supplier: Factory, forwarder: Ship, amazon: Package, carrier: Truck, done: Check }

// The purchase order or shipment list's page of rows. Purchase orders can be selected; a shipment has a menu to open it
// or its purchase order. Below 640px of width each row keeps its reference and status, with the rest of the row under
// them, and below 480px it's a card. A view with no rows says so inside the table, offering to clear the filters when
// they're why.
export function LogisticsTable({
  kind,
  viewer,
  rows,
  columns,
  view,
  isFiltered,
  selected,
  onSelectedChange,
  onClear
}: {
  kind: ListKind
  viewer: ListViewer
  // The rows of this page.
  rows: LogisticsRow[]
  // The columns shown, in order.
  columns: ListColumn[]
  // The view, for what an empty one says.
  view: ListView
  isFiltered: boolean
  selected: string[]
  onSelectedChange: (selected: string[]) => void
  onClear: () => void
}) {
  const t = useTranslations("common.logistics")
  const k = useTranslations(`common.logistics.${kind}`)
  const text = useLogisticsText(kind, viewer)
  const isOrder = kind === "orders"
  const [first] = columnKeys[kind]
  const wide = (column: ListColumn) => column !== first && column !== "status" && "hidden @min-[640px]/list:table-cell"

  function cell(row: LogisticsRow, column: ListColumn) {
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
                {text.reference(row)}
                <ExternalLink aria-hidden className="size-3" />
                <span className="sr-only"> {t("opensInSellerCentral")}</span>
              </a>
            ) : (
              <Link
                to="."
                href={row.href}
                className="focus-ring rounded-sm font-medium underline-offset-4 hover:underline"
              >
                {text.reference(row)}
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
        return row.partner ?? <NoValue />
      case "route":
        return (
          <span className="flex items-center gap-1.5 text-meta">
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
            {text.shipped(row)}
            <progress
              aria-label={t("shippedLabel", { reference: row.reference })}
              max={row.quantity || 1}
              value={row.shipped ?? 0}
              className="mt-1 block h-1 w-full appearance-none overflow-hidden rounded-full border-0 bg-muted [&::-moz-progress-bar]:bg-sky-700 dark:[&::-moz-progress-bar]:bg-sky-400 [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-sky-700 dark:[&::-webkit-progress-value]:bg-sky-400"
            />
          </div>
        )
      case "total":
        return row.total ?? <NoValue />
      case "cartons":
        return row.cartons || <NoValue />
      case "ready":
        return row.ready ? text.readyDate(row.ready) : <NoValue />
      case "status":
        return <Status status={row.status} />
      case "waiting": {
        const Icon = waitingIcons[row.waiting]
        return (
          <span className="flex items-center gap-1.5 text-meta">
            <Icon aria-hidden className="size-3.5 text-muted-foreground" />
            {text.waitingLabel(row.waiting)}
          </span>
        )
      }
    }
  }

  return (
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
                  disabled={!rows.length}
                  checked={rows.length > 0 && rows.every((row) => selected.includes(row.id))}
                  indeterminate={
                    rows.some((row) => selected.includes(row.id)) && !rows.every((row) => selected.includes(row.id))
                  }
                  onCheckedChange={(checked) =>
                    onSelectedChange(
                      checked
                        ? [...new Set([...selected, ...rows.map((row) => row.id)])]
                        : selected.filter((id) => !rows.some((row) => row.id === id))
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
                {text.columnLabel(column)}
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
          {rows.map((row) => (
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
                      onSelectedChange(checked ? [...selected, row.id] : selected.filter((id) => id !== row.id))
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
                      {columns.includes("partner") && row.partner && <div>{row.partner}</div>}
                      {columns.includes("route") && <div>{text.route(row)}</div>}
                    </div>
                  )}
                  {column === "status" && (
                    <div className="mt-2 text-xs @min-[640px]/list:hidden">
                      {isOrder ? row.total : t("cartons", { count: row.cartons ?? 0 })}
                      <div className="mt-1 text-muted-foreground">
                        {isOrder ? text.shipped(row) : row.ready && t("readyOn", { date: text.readyDate(row.ready) })}
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
                            aria-label={t("rowActions", { reference: text.reference(row) })}
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
          {!rows.length && (
            <TableRow className="hover:bg-transparent @max-[480px]/list:block">
              <TableCell colSpan={columns.length + 1} className="@max-[480px]/list:block">
                <div className="flex flex-col items-center gap-3 px-6 py-12 text-center whitespace-normal">
                  <Package aria-hidden className="size-8 text-muted-foreground" />
                  <h2 className="font-medium">{isFiltered ? k("noMatches") : k(`empty.${view}`)}</h2>
                  {isFiltered && <p className="text-sm text-muted-foreground">{t("noMatchesDescription")}</p>}
                  {isFiltered && (
                    <Button variant="outline" onClick={onClear}>
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
  )
}
