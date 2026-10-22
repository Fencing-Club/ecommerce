import { ChevronDown, ChevronRight } from "lucide-react"
import { match } from "ts-pattern"
import { useFormatter, useTranslations } from "use-intl"
import { useCan } from "@/components/access"
import { Status, StatusBadge } from "@/components/common"
import { NoValue } from "@/components/no-value"
import { ProductThumb } from "@/components/product-thumb"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { TableCell, TableRow } from "@/components/ui/table"
import {
  calculationSteps,
  isOrderable,
  isOut,
  type LineEdit,
  lineEdit,
  lossSteps,
  type RestockStep,
  wholeUnits
} from "@/lib/restock-selection"
import { cn } from "@/lib/utils"
import type { BlockReason, RestockLine, RestockStatus } from "@/server/restock-plan"

// The stock statuses every page shares (Status in common.tsx); the others read as neutral badges, named by their
// message keys.
const stockStatuses: Record<RestockStatus, { status: string } | { label: "blocked" | "notStocked" | "noListing" }> = {
  stockout: { status: "reorder_now" },
  reorder: { status: "reorder_soon" },
  stocked: { status: "in_stock" },
  blocked: { label: "blocked" },
  not_stocked: { label: "notStocked" },
  no_listing: { label: "noListing" }
}
const blockNames = {
  stock_unknown: "stockUnknown",
  demand_unknown: "demandUnknown",
  incoming_unknown: "incomingUnknown",
  sku_ambiguous: "skuAmbiguous"
} as const satisfies Record<BlockReason, string>
const signNames = { "+": "plus", "−": "minus", "=": "equals" } as const

// Restock's words, numbers and money in the reader's language. Money is in minor units.
export function useRestockText() {
  const t = useTranslations("restock")
  const format = useFormatter()
  const separator = useTranslations("common.format")("separator")
  const decimals = (value: number, digits: number) =>
    format.number(value, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  const money = (minor: number, currency: string) => format.number(minor / 100, { style: "currency", currency })
  return {
    t,
    number: (value: number) => format.number(value),
    decimals,
    money,
    // Amounts per currency, "$1,240 + €80", or null for none.
    amounts: (byCurrency: ReadonlyMap<string, number>) => {
      const parts = [...byCurrency].map(([currency, minor]) => money(minor, currency))
      return parts.length ? parts.join(" + ") : null
    },
    volume: (volume: number) => t("volume", { value: decimals(volume, 2) }),
    weight: (weight: number) => t("weight", { value: decimals(weight, 1) }),
    // "a, b, c", with the reader's language's separator.
    list: (parts: string[]) => parts.join(separator),
    // "30 or 45".
    either: (parts: string[]) => format.list(parts, { type: "disjunction" })
  }
}
export type RestockText = ReturnType<typeof useRestockText>

// The SKU and, for a multipack, its pieces.
function detail(line: RestockLine, { t }: RestockText) {
  if (!line.packOf) {
    return line.sku
  }
  return line.sku ? t("skuPack", { sku: line.sku, count: line.packOf }) : t("pack", { count: line.packOf })
}

// A line's photo, product and variant, and its SKU under them.
export function LineName({ line }: { line: RestockLine }) {
  const text = detail(line, useRestockText())
  return (
    <span className="flex min-w-0 items-center gap-3">
      <ProductThumb url={line.imageUrl} className="size-9" />
      <span className="flex min-w-0 flex-col">
        <span className="font-medium whitespace-normal">
          {line.product}
          {line.variant && <span className="text-muted-foreground">, {line.variant}</span>}
        </span>
        {text && <span className="text-xs text-muted-foreground">{text}</span>}
      </span>
    </span>
  )
}

function blockedText(line: RestockLine, { t, list }: RestockText) {
  return line.blocked.length
    ? t("blockedBecause", { reasons: list(line.blocked.map((reason) => t(`blockReasons.${blockNames[reason]}`))) })
    : t("statuses.blocked")
}

// Why a line has its status, on hover.
function statusHint(line: RestockLine, text: RestockText) {
  if (line.status === "stockout" && !isOut(line)) {
    return text.t("runsOut")
  }
  if (line.status === "blocked") {
    return blockedText(line, text)
  }
  return line.status === "not_stocked" ? text.t("notStockedHint") : undefined
}

function LineStatus({ line }: { line: RestockLine }) {
  const text = useRestockText()
  const shown = line.status === "stockout" && isOut(line) ? { status: "out_of_stock" } : stockStatuses[line.status]
  return (
    <span className="inline-flex" title={statusHint(line, text)}>
      {"status" in shown ? (
        <Status status={shown.status} />
      ) : (
        <StatusBadge tone="neutral">{text.t(`statuses.${shown.label}`)}</StatusBadge>
      )}
    </span>
  )
}

// A step's figure in words: a number, days, a rate, units, or lost sales with their worth.
function stepValue(step: RestockStep, { t, number, decimals, money }: RestockText) {
  return match(step.value)
    .with({ kind: "count" }, ({ value }) => number(value))
    .with({ kind: "days" }, ({ value }) => t("days", { count: value }))
    .with({ kind: "perDay" }, ({ value }) => t("calculation.perDay", { rate: decimals(value, 1) }))
    .with({ kind: "units" }, ({ value }) => t("units", { count: value }))
    .with({ kind: "lostValue" }, ({ units, minor, currency }) =>
      t("calculation.lostValue", { amount: money(minor, currency), units: t("units", { count: units }) })
    )
    .exhaustive()
}

// Rows of a calculation on the grid of `Explanation`: the label, the operator in its own column, then the figure.
function Steps({ steps, loss = false }: { steps: RestockStep[]; loss?: boolean }) {
  const text = useRestockText()
  const t = useTranslations("restock.calculation")
  return (
    <dl className="col-span-3 grid grid-cols-subgrid gap-y-1">
      {steps.map((step) => {
        const label = t(step.label.key, step.label)
        return (
          <div
            key={label}
            className={cn(
              "col-span-3 grid grid-cols-subgrid items-baseline",
              step.result && "mt-1 border-t pt-2 font-semibold"
            )}
          >
            <dt className={cn(!step.result && "text-muted-foreground")}>{label}</dt>
            <dd className="col-span-2 grid grid-cols-subgrid">
              <span className="text-center text-muted-foreground">
                {step.sign && (
                  <>
                    <span aria-hidden="true">{step.sign}</span>
                    <span className="sr-only">{t(signNames[step.sign])}</span>
                  </>
                )}
              </span>
              <span className={cn("text-end tabular-nums", loss && "text-destructive")}>{stepValue(step, text)}</span>
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

// How a line's quantity was worked out, or why it has none.
function Explanation({ line }: { line: RestockLine }) {
  const prices = useCan("prices")
  const text = useRestockText()
  if (line.status === "not_stocked") {
    return <p className="text-sm text-muted-foreground">{text.t("notStockedHint")}</p>
  }
  if (line.status === "blocked") {
    return <p className="text-sm text-muted-foreground">{blockedText(line, text)}</p>
  }
  const loss = lossSteps(line, prices)
  return (
    <div className="grid max-w-sm grid-cols-[minmax(0,1fr)_1ch_auto] gap-x-3 text-sm">
      <Steps steps={calculationSteps(line)} />
      {loss.length > 0 && (
        <>
          <p className="col-span-3 mt-4 mb-1 text-xs font-medium text-muted-foreground">
            {text.t("calculation.untilArrival")}
          </p>
          <Steps steps={loss} loss />
        </>
      )}
    </div>
  )
}

function LostSales({ line }: { line: RestockLine }) {
  const { t, money } = useRestockText()
  if (line.lostUnits === null) {
    return <NoValue reason={t("rateUnknown")} />
  }
  if (line.lostUnits === 0) {
    return <NoValue />
  }
  return line.lostSalesMinor !== null && line.priceCurrency ? (
    <span className="text-destructive">{money(line.lostSalesMinor, line.priceCurrency)}</span>
  ) : (
    <span className="text-muted-foreground" title={t("noShopifyPrice")}>
      {t("units", { count: line.lostUnits })}
    </span>
  )
}

// How long the stock on hand lasts at the sales rate. Days are rounded down, so under a day says so rather than 0.
function StockLeft({ line }: { line: RestockLine }) {
  const t = useTranslations("restock")
  if (isOut(line)) {
    return <NoValue reason={t("outOfStock")} />
  }
  if (line.daysRemaining !== null) {
    return line.daysRemaining === 0 ? t("underADay") : t("days", { count: line.daysRemaining })
  }
  return <NoValue reason={line.sold === 0 ? t("noSales") : t("unknown")} />
}

// A count, or a dash when it's unknown.
export function Count({ value }: { value: number | null }) {
  const { t, number } = useRestockText()
  return value === null ? <NoValue reason={t("unknown")} /> : number(value)
}

// What the units in the Order column cost; `units` is null for a line that can't be ordered.
function LineCost({ line, units }: { line: RestockLine; units: string | null }) {
  const { t, money } = useRestockText()
  if (units === null) {
    return <NoValue />
  }
  return line.estimatedCostMinor !== null && line.costCurrency && line.unitCostMinor !== null ? (
    money(Number(units || 0) * line.unitCostMinor, line.costCurrency)
  ) : (
    <NoValue reason={t("noUnitCost")} />
  )
}

// Columns by priority, each shown once the table is wide enough for it beside a product column of at least 16rem, so
// the table never scrolls sideways: status, stock left and available first, then sold, then incoming and lost sales,
// then days out. The calculation under a row has every figure.
export const restockColumns = {
  status: "hidden @4xl:table-cell",
  stockLeft: "hidden @4xl:table-cell",
  available: "hidden @4xl:table-cell",
  sold: "hidden @5xl:table-cell",
  incoming: "hidden @6xl:table-cell",
  lostSales: "hidden @6xl:table-cell",
  daysOut: "hidden @7xl:table-cell"
}

// One line of a supplier's table: whether to order it and how many, its figures, and, opened, how its quantity was
// worked out. On a phone the row stacks.
export function RestockLineRows({
  line,
  edit,
  onEdit,
  expanded,
  onToggle
}: {
  line: RestockLine
  edit: LineEdit | undefined
  onEdit: (edit: LineEdit) => void
  expanded: boolean
  onToggle: () => void
}) {
  // Lost sales and costs are money, which a member sees only with prices.
  const prices = useCan("prices")
  const { t, number, money } = useRestockText()
  const orderable = isOrderable(line)
  const suggested = line.purchaseUnits ?? 0
  const current = lineEdit(line, edit)
  const label = line.variant ? t("productVariant", { product: line.product, variant: line.variant }) : line.product
  const invalid = current.selected && wholeUnits(current.units) === null
  const lost =
    prices && line.lostSalesMinor !== null && line.lostSalesMinor > 0 && line.priceCurrency
      ? money(line.lostSalesMinor, line.priceCurrency)
      : null
  return (
    <>
      <TableRow className="@max-md:flex @max-md:flex-wrap @max-md:items-center @max-md:gap-x-2 @max-md:px-4 @max-md:py-3">
        <TableCell className="w-8 ps-4 @max-md:w-auto @max-md:p-0">
          {orderable && (
            <Checkbox
              checked={current.selected}
              onCheckedChange={(checked) => onEdit({ ...current, selected: checked })}
              aria-label={t("orderLine", { product: label })}
            />
          )}
        </TableCell>
        <TableCell className="@max-md:min-w-0 @max-md:flex-1 @max-md:basis-[calc(100%-2rem)] @max-md:p-0">
          <LineName line={line} />
          {/* Until the table is wide enough for their columns, the status, stock left and lost sales show under the
              name. */}
          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 ps-12 text-xs text-muted-foreground @4xl:hidden">
            <LineStatus line={line} />
            {!isOut(line) && line.daysRemaining !== null && <span>{t("daysLeft", { count: line.daysRemaining })}</span>}
            {lost && <span className="text-destructive">{t("lostSales", { amount: lost })}</span>}
          </span>
          {lost && (
            <span className="mt-1 hidden ps-12 text-xs text-destructive @4xl:block @6xl:hidden">
              {t("lostSales", { amount: lost })}
            </span>
          )}
        </TableCell>
        <TableCell className={restockColumns.status}>
          <LineStatus line={line} />
        </TableCell>
        <TableCell className={cn("text-end tabular-nums", restockColumns.stockLeft)}>
          <StockLeft line={line} />
        </TableCell>
        {prices && (
          <TableCell className={cn("text-end tabular-nums", restockColumns.lostSales)}>
            <LostSales line={line} />
          </TableCell>
        )}
        <TableCell className={cn("text-end tabular-nums", restockColumns.sold)}>
          <Count value={line.sold} />
        </TableCell>
        <TableCell className={cn("text-end tabular-nums", restockColumns.daysOut)}>
          <span className={cn(line.stockoutDays === 0 && "text-muted-foreground")}>{number(line.stockoutDays)}</span>
          <span className="sr-only"> {t("ofDays", { days: line.salesDays })}</span>
        </TableCell>
        <TableCell className={cn("text-end tabular-nums", restockColumns.available)}>
          <Count value={line.available} />
        </TableCell>
        <TableCell className={cn("text-end tabular-nums", restockColumns.incoming)}>
          <Count value={line.incoming} />
        </TableCell>
        <TableCell className="text-end @max-md:ms-auto @max-md:p-0">
          {orderable ? (
            <div className="flex flex-col items-end">
              {/* Borderless until hovered or focused, so the column reads as figures rather than a form. */}
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                step={line.caseQuantity ?? 1}
                value={current.units}
                aria-label={t("unitsToOrder", { product: label })}
                aria-invalid={invalid}
                className="h-8 w-20 border-transparent bg-transparent text-end tabular-nums shadow-none hover:bg-input/30 focus-visible:border focus-visible:bg-background dark:bg-transparent dark:hover:bg-input/30 dark:focus-visible:bg-input/30"
                onChange={(event) => onEdit({ selected: true, units: event.target.value })}
              />
              {Number(current.units) !== suggested && (
                <span className="pe-2.5 text-xs text-muted-foreground">
                  {t("suggested", { units: number(suggested) })}
                </span>
              )}
            </div>
          ) : (
            <NoValue />
          )}
        </TableCell>
        {prices && (
          <TableCell className="text-end tabular-nums @max-md:p-0">
            <LineCost line={line} units={orderable ? current.units : null} />
          </TableCell>
        )}
        <TableCell className="w-10 pe-4 @max-md:w-auto @max-md:p-0">
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={t("calculationFor", { product: label })}
            title={t("calculation.title")}
          >
            {expanded ? <ChevronDown /> : <ChevronRight className="rtl:rotate-180" />}
          </Button>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="bg-muted/30 hover:bg-muted/30 @max-md:block @max-md:px-4 @max-md:py-3">
          <TableCell className="@max-md:hidden" />
          {/* Spans the columns after the checkbox: four when narrow; when wide, the eleven there can be, which covers
              however many show (a span past the last column adds no width). Without prices, Cost and Lost sales
              aren't among them. */}
          <TableCell colSpan={prices ? 11 : 9} className="hidden py-3 pe-4 whitespace-normal @4xl:table-cell">
            <Explanation line={line} />
          </TableCell>
          <TableCell
            colSpan={prices ? 4 : 3}
            className="py-3 pe-4 whitespace-normal @4xl:hidden @max-md:block @max-md:p-0"
          >
            <Explanation line={line} />
          </TableCell>
        </TableRow>
      )}
    </>
  )
}
