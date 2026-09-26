"use client"

import { useDebouncedValue, useLocalStorage } from "@mantine/hooks"
import { money } from "@repo/aisle"
import { AlertTriangle, ChevronDown, ChevronRight, ImageOff, Search } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
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
import { api, errorMessage } from "@/lib/api"
import type { BlockReason, RestockChannel, RestockLine, RestockStatus } from "@/server/restock-plan"
import { dayRange } from "@/server/restock-report"
import * as styles from "./restock-report.css"
import { sx } from "@/styles/sprinkles.css"
import { srOnly } from "@/styles/utilities.css"

type Channel = { key: string; label: string; channel: RestockChannel }
type SupplierOption = { id: string; name: string; leadTimeDays: number | null; amazonLeadTimeDays: number | null }
type Report = {
  days: number
  leadTimeDays: number
  channel: RestockChannel
  supplier: string
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

const restockApi = api.injectEndpoints({
  overrideExisting: true,
  endpoints: (build) => ({
    restockChannels: build.query<Channel[], void>({ query: () => "restock/channels" }),
    restockSuppliers: build.query<SupplierOption[], void>({ query: () => "restock/suppliers" }),
    restockPlan: build.mutation<Report, Request>({
      query: (body) => ({ url: "restock/plan", method: "POST", body })
    }),
    assignSupplier: build.mutation<{ updated: number }, { productIds: string[]; supplierId: string }>({
      query: (body) => ({ url: "restock/assign-supplier", method: "POST", body })
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
    return ["Shopify’s Amazon stock target is 0, so this isn’t stocked at Amazon."]
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
    steps.push(`Plus Shopify’s Amazon stock target of ${line.targetStock} to keep on hand.`)
  }
  steps.push(
    `Minus ${line.available ?? 0} available and ${line.incoming ?? 0} incoming or on order leaves ${line.need ?? 0} needed.`
  )
  if (line.need && line.minimumOrder && line.need < line.minimumOrder) {
    steps.push(`Raised to the minimum order of ${line.minimumOrder}.`)
  }
  if (line.caseQuantity && line.purchaseUnits && line.purchaseUnits % line.caseQuantity === 0 && line.caseCount) {
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
        <TableCell className={styles.number}>
          {line.sold ?? "Unknown"}
          {line.stockoutDays > 0 && <span className={styles.stockout}>{line.stockoutDays} days out of stock</span>}
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
          <TableCell colSpan={9}>
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

// Links the ticked products in "No supplier yet" to a supplier, saved on each product, then recalculates.
function AssignSupplier({
  lines,
  edits,
  suppliers,
  onAssigned
}: {
  lines: RestockLine[]
  edits: ReadonlyMap<string, Edit>
  suppliers: SupplierOption[]
  onAssigned: () => void
}) {
  const [supplierId, setSupplierId] = useState("")
  const [assign, result] = restockApi.useAssignSupplierMutation()
  const productIds = [
    ...new Set(
      lines.flatMap((line) =>
        orderUnits(line, edits.get(line.variantId)) > 0 && line.productId ? [line.productId] : []
      )
    )
  ]
  if (!suppliers.length) {
    return null
  }
  return (
    <div className={styles.assign}>
      <Field className={styles.control}>
        <FieldLabel htmlFor="restock-assign-supplier">Supplier for the ticked products</FieldLabel>
        <NativeSelect
          id="restock-assign-supplier"
          value={supplierId}
          onChange={(event) => setSupplierId(event.target.value)}
        >
          <NativeSelectOption value="">Choose a supplier</NativeSelectOption>
          {suppliers.map((supplier) => (
            <NativeSelectOption key={supplier.id} value={supplier.id}>
              {supplier.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Button
        variant="outline"
        disabled={!supplierId || !productIds.length || result.isLoading}
        onClick={async () => {
          try {
            await assign({ productIds, supplierId }).unwrap()
            onAssigned()
          } catch {
            // RTK Query keeps the failure for the message below.
          }
        }}
      >
        {result.isLoading
          ? "Assigning…"
          : `Assign ${productIds.length} ${productIds.length === 1 ? "product" : "products"}`}
      </Button>
      {result.isError && (
        <p role="alert" className={styles.problem}>
          {errorMessage(result.error, "The supplier couldn’t be saved. Try again.")}
        </p>
      )}
    </div>
  )
}

function SupplierGroup({
  name,
  supplierId,
  lines,
  channel,
  edits,
  setEdit,
  suppliers,
  onAssigned
}: {
  name: string
  supplierId: string | null
  lines: RestockLine[]
  channel: RestockChannel
  edits: ReadonlyMap<string, Edit>
  setEdit: (variantId: string, edit: Edit) => void
  suppliers: SupplierOption[]
  onAssigned: () => void
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const po = createPoHref(lines, edits, channel, supplierId)
  const headingId = `supplier-${supplierId ?? "none"}`
  const leadTimes = [...new Set(lines.map((line) => line.leadTimeDays))]
  const totals = orderTotals(lines, edits)
  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <div className={styles.heading}>
        <span className={sx({ display: "flex", flexDirection: "column", gap: 1 })}>
          <h2 id={headingId} className={styles.sectionTitle}>
            {name}
          </h2>
          <span className={styles.detail}>
            Lead time {leadTimes.join(" or ")} days.{" "}
            {supplierId
              ? ""
              : "Copacker doesn’t know who supplies these yet. Tick them and choose their supplier below, or set it on the product in Inventory."}
          </span>
          <Totals totals={totals} />
        </span>
        <span className={styles.groupActions}>
          <span className={styles.groupCost}>
            <span className={styles.detail}>Estimated cost</span>
            <strong>{costText(totals)}</strong>
          </span>
          {po.count > 0 ? (
            <Button nativeButton={false} render={<Link href={po.href} />}>
              Create PO
            </Button>
          ) : (
            <Button disabled>Create PO</Button>
          )}
        </span>
      </div>
      {!supplierId && <AssignSupplier lines={lines} edits={edits} suppliers={suppliers} onAssigned={onAssigned} />}
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
            <TableCell colSpan={6}>Total selected</TableCell>
            <TableCell className={styles.number}>{totals.units.toLocaleString()}</TableCell>
            <TableCell className={styles.number}>{costText(totals)}</TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>
      {po.count === poLineLimit && <p className={styles.detail}>A PO holds 100 lines; the first 100 are included.</p>}
    </section>
  )
}

// Why nothing is listed. A supplier filter shows only products linked to that supplier, which can be none yet.
function EmptyResults({ report, searching }: { report: Report; searching: boolean }) {
  if (searching) {
    return <p className={styles.summary}>No products match.</p>
  }
  if (report.supplier !== "all" && report.lines.length === 0) {
    const name =
      report.supplier === "none"
        ? null
        : (report.suppliers.find((supplier) => supplier.id === report.supplier)?.name ?? "this supplier")
    return (
      <p className={styles.summary}>
        {name
          ? `No products are linked to ${name} yet. A product links to a supplier once it’s on a PO to them, or when its Shopify supplier SKU is in their catalog. Choose All suppliers to see everything.`
          : "Every product here is linked to a supplier."}
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
        {lines.length} {lines.length === 1 ? "product has" : "products have"} an Amazon stock target but no Amazon
        listing
      </AlertTitle>
      <AlertDescription>
        <p>
          Shopify’s Amazon stock target says to keep these at Amazon, but Amazon has no FBA or AWD inventory for their
          SKUs, so they aren’t suggested. Create the FBA listing with the same SKU, or set the target to 0 in Shopify.
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
                  <TableHead className={styles.number}>Amazon stock target</TableHead>
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

function Results({ report, reload }: { report: Report; reload: () => void }) {
  const [search, setSearch] = useState("")
  const [query] = useDebouncedValue(search.trim().toLocaleLowerCase(), 200)
  const [sort, setSort] = useLocalStorage<Sort>({ key: "restock-sort", defaultValue: "urgency" })
  const [showAll, setShowAll] = useState(false)
  const [edits, setEdits] = useState<ReadonlyMap<string, Edit>>(new Map())
  const salesError = report.sources.some((source) => source.error)
  const matching = report.lines.filter(
    (line) =>
      !query ||
      line.product.toLocaleLowerCase().includes(query) ||
      line.variant?.toLocaleLowerCase().includes(query) ||
      line.sku?.toLocaleLowerCase().includes(query)
  )
  const noListing = matching.filter((line) => line.status === "no_listing")
  const visible = matching
    .filter(
      (line) =>
        showAll || line.status === "stockout" || line.status === "reorder" || (line.status === "blocked" && !salesError)
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
  const groups = new Map<string, { name: string; supplierId: string | null; lines: RestockLine[] }>()
  for (const line of visible) {
    const key = line.supplier?.id ?? "none"
    const group = groups.get(key) ?? {
      name: line.supplier?.name ?? "No supplier yet",
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
      {selected.count > 0 && (
        <div className={styles.grandTotal} aria-live="polite">
          <span>
            <strong>Total for all suppliers</strong>
            <Totals totals={selected} />
          </span>
          <strong className={styles.grandCost}>{costText(selected)}</strong>
        </div>
      )}
      {ordered.length === 0 && <EmptyResults report={report} searching={matching.length < report.lines.length} />}
      {ordered.map((group) => (
        <SupplierGroup
          key={group.supplierId ?? "none"}
          name={group.name}
          supplierId={group.supplierId}
          lines={group.lines}
          channel={report.channel}
          suppliers={report.suppliers}
          onAssigned={reload}
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
  const [daysText, setDaysText] = useLocalStorage({ key: "restock-days", defaultValue: "56" })
  const [leadTimeText, setLeadTimeText] = useLocalStorage({ key: "restock-lead-time", defaultValue: "56" })
  const [channelKey, setChannelKey] = useLocalStorage({ key: "restock-channel", defaultValue: "" })
  const [supplier, setSupplier] = useLocalStorage({ key: "restock-supplier", defaultValue: "all" })
  const days = wholeDays(daysText)
  const leadTimeDays = wholeDays(leadTimeText)
  const { data: channels = [], isLoading: channelsLoading } = restockApi.useRestockChannelsQuery()
  const { data: suppliers = [] } = restockApi.useRestockSuppliersQuery()
  const channel = channels.find((item) => item.key === channelKey) ?? channels[0]
  const supplierChoice = supplier === "all" || supplier === "none" || suppliers.some((row) => row.id === supplier)
  const [load, result] = restockApi.useRestockPlanMutation({ fixedCacheKey: "restock-plan" })
  const [requestKey, setRequestKey] = useState("")
  const request =
    channel && days !== null && leadTimeDays !== null
      ? { days, leadTimeDays, channel: channel.channel, supplier: supplierChoice ? supplier : "all" }
      : null
  const current = request && JSON.stringify(request) === requestKey
  return (
    <div className={sx({ display: "flex", flexDirection: "column", gap: 6 })}>
      <div className={styles.controls}>
        <Field className={styles.control}>
          <FieldLabel htmlFor="restock-channel">Restock</FieldLabel>
          <NativeSelect
            id="restock-channel"
            value={channel?.key ?? ""}
            onChange={(event) => setChannelKey(event.target.value)}
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
            <NativeSelectOption value="none">No supplier yet</NativeSelectOption>
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
          disabled={result.isLoading || !request}
          onClick={() => {
            if (request) {
              setRequestKey(JSON.stringify(request))
              void load(request)
            }
          }}
        >
          {result.isLoading ? "Calculating…" : "Suggest reorders"}
        </Button>
      </div>
      <p className={styles.summary}>
        Uses orders copied on the <Link href="/sales">Orders</Link> page and stock from the{" "}
        <Link href="/inventory">Inventory</Link> page. Suppliers’ own lead times replace the default; set them on the{" "}
        <Link href="/suppliers">Suppliers</Link> page.
      </p>
      {result.isError && <p role="alert">{errorMessage(result.error, "Restock couldn’t be calculated. Try again.")}</p>}
      {result.data && current && !result.isLoading && (
        <Results
          key={requestKey}
          report={result.data}
          reload={() => {
            if (request) {
              void load(request)
            }
          }}
        />
      )}
      {result.data && !current && !result.isLoading && (
        <p className={styles.summary}>Settings changed. Select Suggest reorders to update.</p>
      )}
    </div>
  )
}
