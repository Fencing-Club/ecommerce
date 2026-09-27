"use client"

import { useDebouncedValue, useLocalStorage } from "@mantine/hooks"
import { skipToken } from "@reduxjs/toolkit/query/react"
import { money } from "@repo/aisle"
import { AlertTriangle, ChevronDown, ChevronRight, ImageOff, Search, X } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, errorMessage, type SupplierOption, useSuppliersQuery } from "@/lib/api"
import { type CoverBucket, coverBucket, coverBuckets, isCoverBucket } from "@/lib/cover"
import type { BlockReason, RestockChannel, RestockLine, RestockStatus } from "@/server/restock-plan"
import { dayRange, restockDefaults } from "@/server/restock-report"
import * as styles from "./restock-report.css"
import { sx } from "@/styles/sprinkles.css"
import { srOnly } from "@/styles/utilities.css"

type Channel = { key: string; label: string; channel: RestockChannel }
type Report = {
  days: number
  leadTimeDays: number
  channel: RestockChannel
  supplier: string
  // Products that need reordering here but have no supplier, so they aren't listed.
  needsSupplier: number
  suppliers: SupplierOption[]
  sources: {
    source: "shopify" | "amazon"
    error: string | null
    window: { from: string; to: string } | null
    gapUnits: number
    gapReasons: Record<string, { units: number; unknownCount: number }>
  }[]
  lines: RestockLine[]
}
type Request = { days: number; leadTimeDays: number; channel: RestockChannel; supplier: string }
// Filters a link (such as one from the Overview) opens Restock with: a channel, a search, a days-of-cover group, or
// only the items to reorder. A link calculates straight away.
type LinkFilters = { channel: string | null; q: string; cover: CoverBucket | null; onlyOrders: boolean }

function linkFilters(params: URLSearchParams | null): LinkFilters {
  const cover = params?.get("cover")
  return {
    channel: params?.get("channel") || null,
    q: params?.get("q") ?? "",
    cover: isCoverBucket(cover) ? cover : null,
    onlyOrders: params?.get("status") === "order"
  }
}

const restockApi = api.injectEndpoints({
  overrideExisting: true,
  endpoints: (build) => ({
    restockChannels: build.query<Channel[], void>({ query: () => "restock/channels" }),
    // A query, though sent as POST, so it's cached and recalculates when suppliers or products change.
    restockPlan: build.query<Report, Request>({
      query: (body) => ({ url: "restock/plan", method: "POST", body }),
      providesTags: ["Supplier", "Restock"]
    })
  })
})

const sourceNames = { shopify: "Shopify", amazon: "Amazon" } as const
// Why sold units couldn't be counted, as the sales reader reports them.
const gapNames: Record<string, string> = {
  channel_unmapped: "from other sales channels",
  location_unmapped: "shipped from unclassified locations",
  unfulfilled: "not shipped yet",
  product_unmapped: "without a product",
  quantity_unknown: "with an unknown quantity",
  fulfillment_unmapped: "with an unknown fulfillment method"
}
const statusLabels: Record<RestockStatus, string> = {
  stockout: "Runs out before it arrives",
  reorder: "Reorder",
  stocked: "Enough stock",
  blocked: "Can’t calculate",
  not_stocked: "Not stocked at Amazon",
  no_listing: "No Amazon listing"
}
const statusVariants: Record<RestockStatus, "destructive" | "default" | "secondary" | "outline"> = {
  stockout: "destructive",
  reorder: "default",
  stocked: "secondary",
  blocked: "outline",
  not_stocked: "outline",
  no_listing: "outline"
}
const blockNames: Record<BlockReason, string> = {
  stock_unknown: "the stock count is unknown",
  demand_unknown: "its sales couldn’t be counted",
  incoming_unknown: "incoming stock is unknown",
  sku_ambiguous: "its SKU matches more than one product"
}
const statusRank: Record<RestockStatus, number> = {
  stockout: 0,
  reorder: 1,
  blocked: 2,
  stocked: 3,
  not_stocked: 4,
  no_listing: 5
}
// A PO holds up to 100 lines.
const poLineLimit = 100

function Thumbnail({ url }: { url: string | null }) {
  return url ? (
    <Image src={url} alt="" width={32} height={32} unoptimized className={styles.thumb} />
  ) : (
    <span className={styles.placeholder} aria-hidden="true">
      <ImageOff />
    </span>
  )
}

function Name({ line }: { line: RestockLine }) {
  return (
    <span className={styles.name}>
      <Thumbnail url={line.imageUrl} />
      <span className={sx({ display: "flex", flexDirection: "column", minWidth: 0 })}>
        <span className={styles.title}>
          {line.product}
          {line.variant && `, ${line.variant}`}
        </span>
        <span className={styles.detail}>
          {line.sku ?? "No SKU"}
          {line.packOf && `, pack of ${line.packOf}`}
        </span>
      </span>
    </span>
  )
}

// How the suggested quantity was reached, step by step.
function explain(line: RestockLine) {
  if (line.status === "not_stocked") {
    return ["The minimum stock at Amazon is 0 in Shopify, so this isn’t stocked at Amazon."]
  }
  if (line.status === "blocked") {
    return [
      `Copacker can’t suggest a quantity because ${line.blocked.map((reason) => blockNames[reason]).join(" and ")}.`
    ]
  }
  const sold = line.sold ?? 0
  const perDay = sold / line.rateDays
  const leadDemand = Math.ceil((sold * line.leadTimeDays) / line.rateDays)
  const steps = [
    `Sold ${sold} in the last ${line.salesDays} days${
      line.soldInBundles ? ` (${line.soldAlone} alone and ${line.soldInBundles} in bundles)` : ""
    }.`,
    line.stockoutDays
      ? `Out of stock ${line.stockoutDays} of those days, so the rate uses the ${line.rateDays} days it could sell: about ${perDay.toFixed(1)} a day.`
      : `About ${perDay.toFixed(1)} a day.`,
    `Over the ${line.leadTimeDays}-day lead time that’s about ${leadDemand}.`
  ]
  if (line.targetStock) {
    steps.push(
      `Plus the minimum stock of ${line.targetStock} to keep at ${line.targetWhere ?? "this location"}, so it’s still there when the order arrives.`
    )
  }
  steps.push(
    `Minus ${line.available ?? 0} available and ${line.incoming ?? 0} incoming or on order leaves ${line.need ?? 0} needed.`
  )
  if (line.need && line.minimumOrder && line.need < line.minimumOrder) {
    steps.push(`Raised to the minimum order of ${line.minimumOrder}.`)
  }
  // A case of 1 rounds nothing, so it isn't worth a step.
  if (
    line.caseQuantity &&
    line.caseQuantity > 1 &&
    line.purchaseUnits &&
    line.purchaseUnits % line.caseQuantity === 0 &&
    line.caseCount
  ) {
    steps.push(`Rounded up to ${line.caseCount} cases of ${line.caseQuantity}: ${line.purchaseUnits} units.`)
  }
  return steps
}

// Explains sources that couldn't be read and sales that couldn't be matched to a product.
function Notes({ report }: { report: Report }) {
  const notes = report.sources.flatMap(({ source, error, gapUnits, gapReasons, window }) => [
    error ? `${sourceNames[source]}: ${error}` : null,
    window
      ? `${sourceNames[source]} sales from ${new Date(window.from).toLocaleDateString()} to ${new Date(window.to).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}. Sync on the Orders page for newer ones.`
      : null,
    gapUnits > 0 || Object.values(gapReasons).some((gap) => gap.unknownCount > 0)
      ? `${sourceNames[source]}: not counted, ${Object.entries(gapReasons)
          .filter(([, gap]) => gap.units > 0 || gap.unknownCount > 0)
          .map(
            ([reason, gap]) =>
              `${gap.units} units ${gapNames[reason] ?? reason.replaceAll("_", " ")}${gap.unknownCount ? ` and ${gap.unknownCount} unknown quantities` : ""}`
          )
          .join(", ")}.`
      : null
  ])
  const shown = notes.filter((note) => note !== null)
  return shown.length ? (
    <ul className={styles.notes} aria-live="polite">
      {shown.map((note) => (
        <li key={note}>{note}</li>
      ))}
    </ul>
  ) : null
}

type Edit = { selected: boolean; units: string }

function orderUnits(line: RestockLine, edit: Edit | undefined) {
  if (edit) {
    const value = Number(edit.units)
    return edit.selected && Number.isInteger(value) && value > 0 ? value : 0
  }
  return line.status === "stockout" || line.status === "reorder" ? (line.purchaseUnits ?? 0) : 0
}

// What the selected lines add up to. Costs are kept per currency; lines without a unit cost or case pack are counted
// so the totals say what they leave out.
function orderTotals(lines: RestockLine[], edits: ReadonlyMap<string, Edit>) {
  const totals = {
    count: 0,
    units: 0,
    cases: 0,
    volume: 0,
    weight: 0,
    unknownSize: 0,
    unknownCost: 0,
    cost: new Map<string, number>()
  }
  for (const line of lines) {
    const ordered = orderUnits(line, edits.get(line.variantId))
    if (!ordered) {
      continue
    }
    totals.count++
    totals.units += ordered
    if (line.casePack) {
      const packs = Math.ceil(ordered / line.casePack.units)
      totals.cases += packs
      totals.volume += (packs * line.casePack.lengthCm * line.casePack.widthCm * line.casePack.heightCm) / 1e6
      totals.weight += packs * (line.casePack.weightKg ?? 0)
    } else {
      totals.unknownSize++
    }
    if (line.unitCostMinor !== null && line.costCurrency) {
      totals.cost.set(line.costCurrency, (totals.cost.get(line.costCurrency) ?? 0) + ordered * line.unitCostMinor)
    } else {
      totals.unknownCost++
    }
  }
  return totals
}
type OrderTotals = ReturnType<typeof orderTotals>

function costText(totals: OrderTotals) {
  const amounts = [...totals.cost].map(([currency, minor]) => money(minor, currency))
  return amounts.length ? amounts.join(" + ") : "Unknown"
}

function Totals({ totals }: { totals: OrderTotals }) {
  if (!totals.count) {
    return <p className={styles.detail}>Nothing selected.</p>
  }
  const parts = [`${totals.count} ${totals.count === 1 ? "line" : "lines"}`, `${totals.units.toLocaleString()} units`]
  if (totals.cases) {
    parts.push(
      `${totals.cases} cases, ${totals.volume.toFixed(2)} m³${totals.weight ? `, ${totals.weight.toFixed(1)} kg` : ""}`
    )
  }
  return (
    <p className={styles.detail}>
      {parts.join(", ")}
      {totals.unknownSize > 0 && `. ${totals.unknownSize} without a case pack`}
      {totals.unknownCost > 0 && `. ${totals.unknownCost} without a unit cost, not in the cost`}
    </p>
  )
}

function createPoHref(
  lines: RestockLine[],
  edits: ReadonlyMap<string, Edit>,
  channel: RestockChannel,
  supplierId: string | null
) {
  const chosen = lines
    .map((line) => [line.variantId, orderUnits(line, edits.get(line.variantId))] as const)
    .filter(([, units]) => units > 0)
    .slice(0, poLineLimit)
  const params = new URLSearchParams(chosen.map(([id, units]) => ["variant", `${id}@${units}`]))
  params.set("destination", channel.kind === "amazon" ? "amazon" : "warehouse")
  if (channel.kind === "shopify") {
    params.set("locationId", channel.locationId)
  }
  if (supplierId) {
    params.set("supplierId", supplierId)
  }
  return { href: `/orders/new?${params}`, count: chosen.length }
}

function StockLeft({ line }: { line: RestockLine }) {
  if (line.daysRemaining !== null) {
    return `${line.daysRemaining} days`
  }
  return line.sold === 0 ? "No sales" : "Unknown"
}

function LineRows({
  line,
  edit,
  onEdit,
  expanded,
  onToggle
}: {
  line: RestockLine
  edit: Edit | undefined
  onEdit: (edit: Edit) => void
  expanded: boolean
  onToggle: () => void
}) {
  const orderable = line.status !== "blocked" && line.status !== "not_stocked"
  const suggested = line.purchaseUnits ?? 0
  const current = edit ?? {
    selected: line.status === "stockout" || line.status === "reorder",
    units: String(suggested)
  }
  const label = `${line.product}${line.variant ? `, ${line.variant}` : ""}`
  const invalid = current.selected && !(Number.isInteger(Number(current.units)) && Number(current.units) > 0)
  return (
    <>
      <TableRow data-state={current.selected ? "selected" : undefined}>
        <TableCell>
          {orderable && (
            <Checkbox
              checked={current.selected}
              onCheckedChange={(checked) => onEdit({ ...current, selected: checked })}
              aria-label={`Order ${label}`}
            />
          )}
        </TableCell>
        <TableCell>
          <Name line={line} />
        </TableCell>
        <TableCell>
          <Badge variant={statusVariants[line.status]}>{statusLabels[line.status]}</Badge>
        </TableCell>
        <TableCell className={styles.number}>
          <StockLeft line={line} />
        </TableCell>
        <TableCell className={styles.number}>{line.sold ?? "Unknown"}</TableCell>
        <TableCell className={line.stockoutDays > 0 ? styles.stockoutCell : styles.number}>
          {line.stockoutDays}
          <span className={srOnly}> of {line.salesDays} days</span>
        </TableCell>
        <TableCell className={styles.number}>{line.available ?? "Unknown"}</TableCell>
        <TableCell className={styles.number}>{line.incoming ?? "Unknown"}</TableCell>
        <TableCell className={styles.number}>
          {orderable ? (
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              step={line.caseQuantity ?? 1}
              value={current.units}
              aria-label={`Units of ${label} to order`}
              aria-invalid={invalid}
              className={styles.quantity}
              onChange={(event) => onEdit({ selected: true, units: event.target.value })}
            />
          ) : (
            "None"
          )}
          {orderable && Number(current.units) !== suggested && (
            <span className={styles.detail}>Suggested {suggested}</span>
          )}
        </TableCell>
        <TableCell className={styles.number}>
          {line.estimatedCostMinor !== null && line.costCurrency && line.unitCostMinor !== null
            ? money(Number(current.units || 0) * line.unitCostMinor, line.costCurrency)
            : "Unknown"}
        </TableCell>
        <TableCell>
          <Button variant="ghost" size="xs" onClick={onToggle} aria-expanded={expanded} aria-label={`Why ${label}`}>
            {expanded ? <ChevronDown data-icon="inline-start" /> : <ChevronRight data-icon="inline-start" />}
            Why
          </Button>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell />
          <TableCell colSpan={10}>
            <ol className={styles.explain}>
              {explain(line).map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

function SupplierGroup({
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
  channel: RestockChannel
  edits: ReadonlyMap<string, Edit>
  setEdit: (variantId: string, edit: Edit) => void
  // Collapsed, the group shows only its totals and Create PO.
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const po = createPoHref(lines, edits, channel, supplierId)
  const headingId = `supplier-${groupKey.replace(/[^A-Za-z0-9-]/g, "-")}`
  const leadTimes = [...new Set(lines.map((line) => line.leadTimeDays))]
  const totals = orderTotals(lines, edits)
  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      render={<section className={styles.section} aria-labelledby={headingId} />}
    >
      <div className={styles.heading}>
        <span className={sx({ display: "flex", flexDirection: "column", gap: 1 })}>
          <span className={styles.groupTitle}>
            <CollapsibleTrigger
              render={<Button variant="ghost" size="icon-sm" />}
              aria-label={`${open ? "Hide" : "Show"} the ${lines.length} products from ${name}`}
            >
              <ChevronRight className={styles.chevron} aria-hidden="true" />
            </CollapsibleTrigger>
            <h2 id={headingId} className={styles.sectionTitle}>
              {name}
            </h2>
            <span className={styles.detail}>
              {lines.length} {lines.length === 1 ? "product" : "products"}
            </span>
          </span>
          <span className={styles.detail}>
            Lead time {leadTimes.join(" or ")} days.
            {supplierId ? "" : " Ordered outside Copacker, so there’s no PO to create here."}
          </span>
          <Totals totals={totals} />
        </span>
        <span className={styles.groupActions}>
          <span className={styles.groupCost}>
            <span className={styles.detail}>Estimated cost</span>
            <strong>{costText(totals)}</strong>
          </span>
          {supplierId &&
            (po.count > 0 ? (
              <Button nativeButton={false} render={<Link href={po.href} />}>
                Create PO
              </Button>
            ) : (
              <Button disabled>Create PO</Button>
            ))}
        </span>
      </div>
      <CollapsibleContent className={styles.groupContent}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <span className={srOnly}>Order</span>
              </TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className={styles.number}>Stock left</TableHead>
              <TableHead className={styles.number}>Sold</TableHead>
              <TableHead className={styles.number}>
                <abbr title="Days of the sales period it was out of stock. The sales rate leaves them out.">
                  Days out
                </abbr>
              </TableHead>
              <TableHead className={styles.number}>Available</TableHead>
              <TableHead className={styles.number}>Incoming</TableHead>
              <TableHead className={styles.number}>Order</TableHead>
              <TableHead className={styles.number}>Cost</TableHead>
              <TableHead>
                <span className={srOnly}>Explanation</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <LineRows
                key={line.variantId}
                line={line}
                edit={edits.get(line.variantId)}
                onEdit={(edit) => setEdit(line.variantId, edit)}
                expanded={expanded.has(line.variantId)}
                onToggle={() =>
                  setExpanded((current) => {
                    const next = new Set(current)
                    if (!next.delete(line.variantId)) {
                      next.add(line.variantId)
                    }
                    return next
                  })
                }
              />
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell />
              <TableCell colSpan={7}>Total selected</TableCell>
              <TableCell className={styles.number}>{totals.units.toLocaleString()}</TableCell>
              <TableCell className={styles.number}>{costText(totals)}</TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
        {po.count === poLineLimit && <p className={styles.detail}>A PO holds 100 lines; the first 100 are included.</p>}
      </CollapsibleContent>
    </Collapsible>
  )
}

// Why nothing is listed. A supplier filter shows only products linked to that supplier, which can be none yet.
function EmptyResults({ report, searching }: { report: Report; searching: boolean }) {
  if (searching) {
    return (
      <p className={styles.summary}>
        No products match. Restock lists only products that have a supplier; set the rest on the{" "}
        <Link href="/products">Products</Link> page.
      </p>
    )
  }
  if (report.supplier !== "all" && report.lines.length === 0) {
    const name = report.suppliers.find((supplier) => supplier.id === report.supplier)?.name ?? "this supplier"
    return (
      <p className={styles.summary}>
        No products are linked to {name} yet. Set each product’s supplier on the <Link href="/products">Products</Link>{" "}
        page. Choose All suppliers to see everything.
      </p>
    )
  }
  return <p className={styles.summary}>Nothing needs reordering.</p>
}

// Items Shopify says to keep at Amazon, but Amazon has no inventory for: there's nothing to send stock to yet.
function NoListing({ lines }: { lines: RestockLine[] }) {
  if (!lines.length) {
    return null
  }
  return (
    <Alert>
      <AlertTriangle />
      <AlertTitle>
        {lines.length} {lines.length === 1 ? "product has" : "products have"} a minimum stock at Amazon but no Amazon
        listing
      </AlertTitle>
      <AlertDescription>
        <p>
          Shopify sets a minimum stock to keep at Amazon for these, but Amazon has no FBA or AWD inventory for their
          SKUs, so they aren’t suggested. Create the FBA listing with the same SKU, or set the minimum to 0 in Shopify.
        </p>
        <Collapsible className={styles.noListing}>
          <CollapsibleTrigger className={styles.noListingTrigger}>
            <ChevronRight className={styles.chevron} aria-hidden="true" />
            Show products
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className={styles.number}>Minimum at Amazon</TableHead>
                  <TableHead className={styles.number}>Sold</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => (
                  <TableRow key={line.variantId}>
                    <TableCell>
                      <Name line={line} />
                    </TableCell>
                    <TableCell className={styles.number}>{line.targetStock}</TableCell>
                    <TableCell className={styles.number}>{line.sold ?? "Unknown"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CollapsibleContent>
        </Collapsible>
      </AlertDescription>
    </Alert>
  )
}

type Sort = "urgency" | "quantity" | "name"

function Results({ report, filters }: { report: Report; filters: LinkFilters }) {
  const [search, setSearch] = useState(filters.q)
  const [cover, setCover] = useState(filters.cover)
  const [onlyOrders, setOnlyOrders] = useState(filters.onlyOrders)
  const [query] = useDebouncedValue(search.trim().toLocaleLowerCase(), 200)
  const [sort, setSort] = useLocalStorage<Sort>({ key: "restock-sort", defaultValue: "urgency" })
  const [showAll, setShowAll] = useState(false)
  const [edits, setEdits] = useState<ReadonlyMap<string, Edit>>(new Map())
  // Supplier groups whose items are hidden; all start open.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const salesError = report.sources.some((source) => source.error)
  const matching = report.lines.filter(
    (line) =>
      (!query ||
        line.product.toLocaleLowerCase().includes(query) ||
        line.variant?.toLocaleLowerCase().includes(query) ||
        line.sku?.toLocaleLowerCase().includes(query)) &&
      (!cover || coverBucket(line) === cover) &&
      (!onlyOrders || line.status === "stockout" || line.status === "reorder")
  )
  const noListing = matching.filter((line) => line.status === "no_listing")
  const visible = matching
    .filter(
      (line) =>
        showAll ||
        cover !== null ||
        line.status === "stockout" ||
        line.status === "reorder" ||
        (line.status === "blocked" && !salesError)
    )
    .toSorted((a, b) => {
      if (sort === "name") {
        return `${a.product} ${a.variant ?? ""}`.localeCompare(`${b.product} ${b.variant ?? ""}`)
      }
      if (sort === "quantity") {
        return (b.purchaseUnits ?? -1) - (a.purchaseUnits ?? -1)
      }
      return (
        statusRank[a.status] - statusRank[b.status] ||
        (a.daysRemaining ?? Number.MAX_SAFE_INTEGER) - (b.daysRemaining ?? Number.MAX_SAFE_INTEGER) ||
        (b.purchaseUnits ?? 0) - (a.purchaseUnits ?? 0)
      )
    })
  // Copacker suppliers first, with Create PO; then suppliers only in Shopify, which are ordered outside Copacker.
  const groups = new Map<string, { key: string; name: string; supplierId: string | null; lines: RestockLine[] }>()
  for (const line of visible) {
    const key = line.supplier?.id ?? `shopify:${line.externalSupplier ?? ""}`
    const group = groups.get(key) ?? {
      key,
      name: line.supplier?.name ?? line.externalSupplier ?? "",
      supplierId: line.supplier?.id ?? null,
      lines: []
    }
    group.lines.push(line)
    groups.set(key, group)
  }
  const ordered = [...groups.values()].toSorted(
    (a, b) => Number(a.supplierId === null) - Number(b.supplierId === null) || a.name.localeCompare(b.name)
  )
  const counts = {
    order: report.lines.filter((line) => line.status === "stockout" || line.status === "reorder").length,
    blocked: report.lines.filter((line) => line.status === "blocked").length,
    fine: report.lines.filter((line) => line.status === "stocked" || line.status === "not_stocked").length
  }
  const selected = orderTotals(visible, edits)
  return (
    <div className={sx({ display: "flex", flexDirection: "column", gap: 6 })}>
      <Notes report={report} />
      {salesError ? (
        <p className={styles.summary}>Restock needs this channel’s sales. Fix the issue above and try again.</p>
      ) : (
        <p className={styles.summary}>
          {counts.order} to reorder, {counts.blocked} can’t be calculated, {counts.fine} have enough stock. Quantities
          cover each supplier’s lead time at the last {report.days} days’ rate, after stock, incoming stock and open
          POs, then round up to the minimum order and whole cases. Costs use Shopify’s unit cost and exclude freight,
          duties and fees.
        </p>
      )}
      {report.needsSupplier > 0 && (
        <p className={styles.summary}>
          {report.needsSupplier} more {report.needsSupplier === 1 ? "product needs" : "products need"} reordering but{" "}
          {report.needsSupplier === 1 ? "has" : "have"} no supplier in Shopify, so{" "}
          {report.needsSupplier === 1 ? "it isn’t" : "they aren’t"} listed. Set the Supplier field in Shopify, or choose
          a supplier on the <Link href="/products">Products</Link> page.
        </p>
      )}
      {(cover || onlyOrders) && (
        <div className={styles.filters}>
          {cover && (
            <Button variant="outline" size="sm" onClick={() => setCover(null)}>
              Days of cover: {coverBuckets.find((bucket) => bucket.key === cover)?.label}
              <X data-icon="inline-end" aria-hidden />
              <span className={srOnly}>Clear filter</span>
            </Button>
          )}
          {onlyOrders && (
            <Button variant="outline" size="sm" onClick={() => setOnlyOrders(false)}>
              Items to reorder
              <X data-icon="inline-end" aria-hidden />
              <span className={srOnly}>Clear filter</span>
            </Button>
          )}
        </div>
      )}
      <div className={styles.controls}>
        <Field className={styles.search}>
          <FieldLabel htmlFor="restock-search">Search</FieldLabel>
          <span className={styles.searchBox}>
            <Search aria-hidden="true" />
            <Input
              id="restock-search"
              type="search"
              placeholder="Product or SKU"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </span>
        </Field>
        <Field className={styles.control}>
          <FieldLabel htmlFor="restock-sort">Sort by</FieldLabel>
          <NativeSelect
            id="restock-sort"
            value={sort}
            onChange={(event) => {
              const value = event.target.value
              if (value === "urgency" || value === "quantity" || value === "name") {
                setSort(value)
              }
            }}
          >
            <NativeSelectOption value="urgency">Most urgent</NativeSelectOption>
            <NativeSelectOption value="quantity">Largest order</NativeSelectOption>
            <NativeSelectOption value="name">Product name</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field orientation="horizontal" className={styles.control}>
          <Checkbox id="restock-show-all" checked={showAll} onCheckedChange={setShowAll} />
          <FieldLabel htmlFor="restock-show-all">Show products with enough stock</FieldLabel>
        </Field>
      </div>
      {(selected.count > 0 || ordered.length > 1) && (
        <div className={styles.grandTotal} aria-live="polite">
          <span>
            <strong>Total for all suppliers</strong>
            <Totals totals={selected} />
          </span>
          <span className={styles.groupActions}>
            {ordered.length > 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setCollapsed(collapsed.size < ordered.length ? new Set(ordered.map((group) => group.key)) : new Set())
                }
              >
                {collapsed.size < ordered.length ? "Collapse all" : "Expand all"}
              </Button>
            )}
            <strong className={styles.grandCost}>{costText(selected)}</strong>
          </span>
        </div>
      )}
      {ordered.length === 0 && <EmptyResults report={report} searching={matching.length < report.lines.length} />}
      {ordered.map((group) => (
        <SupplierGroup
          key={group.key}
          groupKey={group.key}
          name={group.name}
          supplierId={group.supplierId}
          lines={group.lines}
          channel={report.channel}
          open={!collapsed.has(group.key)}
          onOpenChange={(open) =>
            setCollapsed((current) => {
              const next = new Set(current)
              const key = group.key
              if (open) {
                next.delete(key)
              } else {
                next.add(key)
              }
              return next
            })
          }
          edits={edits}
          setEdit={(variantId, edit) =>
            setEdits((current) => {
              const next = new Map(current)
              next.set(variantId, edit)
              return next
            })
          }
        />
      ))}
      <NoListing lines={noListing} />
    </div>
  )
}

// A whole number of days within the supported range, or null.
function wholeDays(text: string) {
  const value = Number(text)
  return Number.isInteger(value) && value >= dayRange.min && value <= dayRange.max ? value : null
}

export function RestockReport() {
  // Remembered between visits. Kept as typed so the fields can be cleared while editing; validated before loading.
  const [daysText, setDaysText] = useLocalStorage({ key: "restock-days", defaultValue: String(restockDefaults.days) })
  const [leadTimeText, setLeadTimeText] = useLocalStorage({
    key: "restock-lead-time",
    defaultValue: String(restockDefaults.leadTimeDays)
  })
  const [channelKey, setChannelKey] = useLocalStorage({ key: "restock-channel", defaultValue: "" })
  const [supplier, setSupplier] = useLocalStorage({ key: "restock-supplier", defaultValue: "all" })
  const days = wholeDays(daysText)
  const leadTimeDays = wholeDays(leadTimeText)
  const { data: channels = [], isLoading: channelsLoading } = restockApi.useRestockChannelsQuery()
  const { data: suppliers = [] } = useSuppliersQuery()
  const params = useSearchParams()
  const [filters] = useState(() => linkFilters(params))
  // The linked channel wins until another is chosen.
  const [linkedChannel, setLinkedChannel] = useState(filters.channel)
  const channel = channels.find((item) => item.key === (linkedChannel ?? channelKey)) ?? channels[0]
  // A remembered choice that no longer exists, such as a removed supplier, falls back to all suppliers.
  const supplierChoice = supplier === "all" || suppliers.some((row) => row.id === supplier)
  const [submitted, setSubmitted] = useState<Request | null>(null)
  const result = restockApi.useRestockPlanQuery(submitted ?? skipToken)
  const requestKey = submitted ? JSON.stringify(submitted) : ""
  const request =
    channel && days !== null && leadTimeDays !== null
      ? { days, leadTimeDays, channel: channel.channel, supplier: supplierChoice ? supplier : "all" }
      : null
  const current = request && JSON.stringify(request) === requestKey
  const linked = Boolean(filters.channel || filters.q || filters.cover || filters.onlyOrders)
  const [autoRan, setAutoRan] = useState(false)
  // Opened from a link: calculate once the channels have loaded, without waiting for Suggest reorders.
  if (linked && !autoRan && request && channels.length) {
    setAutoRan(true)
    setSubmitted(request)
  }
  return (
    <div className={sx({ display: "flex", flexDirection: "column", gap: 6 })}>
      <div className={styles.controls}>
        <Field className={styles.control}>
          <FieldLabel htmlFor="restock-channel">Restock</FieldLabel>
          <NativeSelect
            id="restock-channel"
            value={channel?.key ?? ""}
            onChange={(event) => {
              setLinkedChannel(null)
              setChannelKey(event.target.value)
            }}
          >
            {!channel && (
              <NativeSelectOption value="">{channelsLoading ? "Loading…" : "Sync inventory first"}</NativeSelectOption>
            )}
            {channels.map((item) => (
              <NativeSelectOption key={item.key} value={item.key}>
                {item.channel.kind === "shopify" ? `Shopify: ${item.label}` : item.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field className={styles.control}>
          <FieldLabel htmlFor="restock-supplier">Supplier</FieldLabel>
          <NativeSelect
            id="restock-supplier"
            value={supplierChoice ? supplier : "all"}
            onChange={(event) => setSupplier(event.target.value)}
          >
            <NativeSelectOption value="all">All suppliers</NativeSelectOption>
            {suppliers.map((row) => (
              <NativeSelectOption key={row.id} value={row.id}>
                {row.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field className={styles.days} data-invalid={days === null}>
          <FieldLabel htmlFor="restock-days">Sales period (days)</FieldLabel>
          <Input
            id="restock-days"
            type="number"
            inputMode="numeric"
            min={dayRange.min}
            max={dayRange.max}
            value={daysText}
            aria-invalid={days === null}
            onChange={(event) => setDaysText(event.target.value)}
          />
        </Field>
        <Field className={styles.days} data-invalid={leadTimeDays === null}>
          <FieldLabel htmlFor="restock-lead-time">Default lead time (days)</FieldLabel>
          <Input
            id="restock-lead-time"
            type="number"
            inputMode="numeric"
            min={dayRange.min}
            max={dayRange.max}
            value={leadTimeText}
            aria-invalid={leadTimeDays === null}
            onChange={(event) => setLeadTimeText(event.target.value)}
          />
        </Field>
        <Button
          disabled={result.isFetching || !request}
          onClick={() => {
            if (!request) {
              return
            }
            // The same settings again recalculate; new settings load their own result.
            if (JSON.stringify(request) === requestKey) {
              void result.refetch()
            } else {
              setSubmitted(request)
            }
          }}
        >
          {result.isFetching ? "Calculating…" : "Suggest reorders"}
        </Button>
      </div>
      <p className={styles.summary}>
        Uses orders copied on the <Link href="/sales">Orders</Link> page and stock from the{" "}
        <Link href="/products">Products</Link> page. Suppliers’ own lead times replace the default; set them on the{" "}
        <Link href="/suppliers">Suppliers</Link> page.
      </p>
      {result.isError && <p role="alert">{errorMessage(result.error, "Restock couldn’t be calculated. Try again.")}</p>}
      {result.currentData && current && <Results key={requestKey} report={result.currentData} filters={filters} />}
      {result.currentData && !current && (
        <p className={styles.summary}>Settings changed. Select Suggest reorders to update.</p>
      )}
    </div>
  )
}
