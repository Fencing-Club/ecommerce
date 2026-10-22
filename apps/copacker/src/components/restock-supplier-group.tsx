import { useSet } from "@mantine/hooks"
import { Link } from "@tanstack/react-router"
import { ChevronRight } from "lucide-react"
import { useTranslations } from "use-intl"
import { useCan } from "@/components/access"
import { NoValue } from "@/components/no-value"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  createPoHref,
  type RestockReportData,
  type LineEdit,
  type LineEdits,
  lostSales,
  type OrderTotals,
  orderTotals,
  type PoLink,
  poLineLimit
} from "@/lib/restock-selection"
import { cn } from "@/lib/utils"
import type { RestockLine } from "@/server/restock-plan"
import { RestockLineRows, restockColumns, type RestockText, useRestockText } from "./restock-line"

// A selection's size for a meta line: lines and units, then cases, volume and weight when case packs are known.
export function sizeParts(totals: OrderTotals, { t, volume, weight }: RestockText) {
  if (!totals.count) {
    return [t("nothingSelected")]
  }
  const parts = [t("lines", { count: totals.count }), t("units", { count: totals.units })]
  if (totals.cases) {
    parts.push(t("cases", { count: totals.cases }), volume(totals.volume))
    if (totals.weight) {
      parts.push(weight(totals.weight))
    }
  }
  return parts
}

// Opens a new PO to the supplier with the selected lines. A supplier only in Shopify is ordered outside Copacker.
function Reorder({ supplierId, po }: { supplierId: string | null; po: PoLink }) {
  // Reordering makes a purchase order.
  const reorders = useCan("orders", "edit")
  const t = useTranslations("restock")
  if (!supplierId) {
    return <span className="text-xs text-muted-foreground">{t("orderedOutside")}</span>
  }
  if (!reorders) {
    return null
  }
  return po.count > 0 ? (
    <Button variant="outline" size="sm" nativeButton={false} render={<Link to="." href={po.href} />}>
      {t("reorder")}
    </Button>
  ) : (
    <Button variant="outline" size="sm" disabled>
      {t("reorder")}
    </Button>
  )
}

// A group's name as the button that shows or hides its table, after a chevron that turns while it's open.
export function GroupTrigger({ children }: { children: React.ReactNode }) {
  return (
    <CollapsibleTrigger className="group/trigger focus-ring flex items-center gap-2 rounded-sm text-start">
      <ChevronRight
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 in-data-panel-open:rotate-90 rtl:not-in-data-panel-open:rotate-180"
      />
      <span className="underline-offset-4 group-hover/trigger:underline">{children}</span>
    </CollapsibleTrigger>
  )
}

// One supplier's lines, under a header with what its selected lines add up to and Reorder.
export function RestockSupplierGroup({
  groupKey,
  name,
  supplierId,
  lines,
  channel,
  edits,
  setEdit,
  open,
  onOpenChange
}: {
  groupKey: string
  name: string
  // Null for a supplier only in Shopify, ordered outside Copacker, so there's no PO to create.
  supplierId: string | null
  lines: RestockLine[]
  channel: RestockReportData["channel"]
  edits: LineEdits
  setEdit: (variantId: string, edit: LineEdit) => void
  // Collapsed, the group shows only its header: its totals and Reorder. Its selections still count.
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const text = useRestockText()
  const { t } = text
  // The lines showing their calculation.
  const expanded = useSet<string>()
  const prices = useCan("prices")
  const po = createPoHref(lines, edits, channel, supplierId)
  const headingId = `supplier-${groupKey.replace(/[^A-Za-z0-9-]/g, "-")}`
  const leadTimes = [...new Set(lines.map((line) => line.leadTimeDays))]
  const totals = orderTotals(lines, edits)
  const cost = text.amounts(totals.cost)
  const lost = prices ? text.amounts(lostSales(lines)) : null
  const leadTime = t("leadTime", { days: text.either(leadTimes.map(text.number)) })
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} render={<section aria-labelledby={headingId} />}>
      <Card flush>
        <CardHeader className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {/* The cost and Reorder move under the name when both don't fit on one line. */}
          <div className="flex min-w-0 flex-[1_1_18rem] flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-x-2">
              <h2 id={headingId} className="font-semibold">
                <GroupTrigger>{name}</GroupTrigger>
              </h2>
              <span className="text-xs text-muted-foreground">{t("products", { count: lines.length })}</span>
            </div>
            {/* Indented past the chevron, under the name. */}
            <CardDescription className="ps-6 text-xs">
              {text.list([leadTime, ...sizeParts(totals, text), ...(lost ? [t("lostSales", { amount: lost })] : [])])}
            </CardDescription>
          </div>
          {/* Empty without prices or Reorder, and then hidden so it can't wrap onto a line of its own. */}
          <div className="ms-auto flex items-center gap-4 empty:hidden">
            {prices && (
              <div className="flex flex-col items-end">
                <span className="text-xs text-muted-foreground">{t("estimatedCost")}</span>
                <span className="font-semibold tabular-nums">{cost ?? <NoValue reason={t("noUnitCosts")} />}</span>
              </div>
            )}
            <Reorder supplierId={supplierId} po={po} />
          </div>
        </CardHeader>
        <CollapsibleContent className="@container">
          <Table framed={false} className="@max-md:block">
            <TableHeader className="@max-md:hidden">
              <TableRow>
                <TableHead className="w-8 ps-4">
                  <span className="sr-only">{t("columns.order")}</span>
                </TableHead>
                <TableHead className="@4xl:min-w-64">{t("columns.product")}</TableHead>
                <TableHead className={restockColumns.status}>{t("columns.status")}</TableHead>
                <TableHead className={cn("text-end", restockColumns.stockLeft)}>{t("columns.stockLeft")}</TableHead>
                {prices && (
                  <TableHead className={cn("text-end", restockColumns.lostSales)} title={t("columns.lostSalesHint")}>
                    {t("columns.lostSales")}
                  </TableHead>
                )}
                <TableHead className={cn("text-end", restockColumns.sold)}>{t("columns.sold")}</TableHead>
                <TableHead className={cn("text-end", restockColumns.daysOut)}>
                  <abbr title={t("columns.daysOutHint")} className="no-underline">
                    {t("columns.daysOut")}
                  </abbr>
                </TableHead>
                <TableHead className={cn("text-end", restockColumns.available)}>{t("columns.available")}</TableHead>
                <TableHead className={cn("text-end", restockColumns.incoming)}>{t("columns.incoming")}</TableHead>
                <TableHead className="pe-5 text-end">{t("columns.order")}</TableHead>
                {prices && <TableHead className="text-end">{t("columns.cost")}</TableHead>}
                <TableHead className="w-10 pe-4">
                  <span className="sr-only">{t("calculation.title")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="@max-md:block">
              {lines.map((line) => (
                <RestockLineRows
                  key={line.variantId}
                  line={line}
                  edit={edits.get(line.variantId)}
                  onEdit={(edit) => setEdit(line.variantId, edit)}
                  expanded={expanded.has(line.variantId)}
                  onToggle={() => {
                    if (!expanded.delete(line.variantId)) {
                      expanded.add(line.variantId)
                    }
                  }}
                />
              ))}
            </TableBody>
          </Table>
          {po.capped && (
            <p className="border-t px-4 py-3 text-xs text-muted-foreground">{t("lineLimit", { count: poLineLimit })}</p>
          )}
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
