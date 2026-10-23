import type { z } from "zod"
import { matches } from "@/components/list/matches"
import { type CoverBucket, coverBucket } from "@/lib/cover"
import type { restockInputSchema, restockReport } from "@/server/restock-page"
import type { RestockLine, RestockStatus } from "@/server/restock-plan"
import { dayRange } from "@/server/restock-report"

// Restock's request for a plan, and the report it answers with, as the server defines them.
export type RestockRequest = z.input<typeof restockInputSchema>
export type RestockReportData = Awaited<ReturnType<typeof restockReport>>

// A PO holds up to 100 lines.
export const poLineLimit = 100

// A whole number of days within the supported range, or null.
export function wholeDays(text: string) {
  const value = Number(text)
  return Number.isInteger(value) && value >= dayRange.min && value <= dayRange.max ? value : null
}

// A report's settings as a key, so a new report starts its selections afresh while the same one fetched again keeps
// them.
export function reportKey(report: Pick<RestockReportData, "channel" | "supplier" | "days" | "leadTimeDays">) {
  let channel = "amazon"
  if (report.channel.kind === "pool") {
    channel = report.channel.id
  }
  if (report.channel.kind === "shopify") {
    channel = `shopify:${report.channel.locationId}`
  }
  return [channel, report.supplier, report.days, report.leadTimeDays].join("|")
}

// Out of stock now, rather than running out before a reorder arrives.
export const isOut = (line: Pick<RestockLine, "available">) => line.available !== null && line.available <= 0

const toReorder = (line: Pick<RestockLine, "status">) => line.status === "stockout" || line.status === "reorder"

// Whether a line has a quantity to order: one that can't be calculated or isn't stocked here doesn't.
export const isOrderable = (line: Pick<RestockLine, "status">) =>
  line.status !== "blocked" && line.status !== "not_stocked"

// A line's order as edited: whether it's ticked, and its units as typed, so the field can be cleared while editing.
export type LineEdit = { selected: boolean; units: string }
export type LineEdits = ReadonlyMap<string, LineEdit>

// A line's order: as edited, or before then ticked when it should be reordered, at the suggested units.
export function lineEdit(line: RestockLine, edit: LineEdit | undefined): LineEdit {
  return edit ?? { selected: toReorder(line), units: String(line.purchaseUnits ?? 0) }
}

// Typed units as a whole number above 0, or null.
export function wholeUnits(text: string) {
  const value = Number(text)
  return Number.isInteger(value) && value > 0 ? value : null
}

// The units a line orders: its typed units while it's ticked, or none.
export function orderUnits(line: RestockLine, edit: LineEdit | undefined) {
  const current = lineEdit(line, edit)
  return current.selected ? (wholeUnits(current.units) ?? 0) : 0
}

// Amounts per currency, in minor units.
function addTo(totals: Map<string, number>, currency: string, minor: number) {
  totals.set(currency, (totals.get(currency) ?? 0) + minor)
}

// What the selected lines add up to. Costs are kept per currency; lines without a unit cost or case pack are counted
// so the totals say what they leave out.
export function orderTotals(lines: readonly RestockLine[], edits: LineEdits) {
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
      addTo(totals.cost, line.costCurrency, ordered * line.unitCostMinor)
    } else {
      totals.unknownCost++
    }
  }
  return totals
}
export type OrderTotals = ReturnType<typeof orderTotals>

// Expected lost sales per currency, from the lines whose loss has a price.
export function lostSales(lines: readonly RestockLine[]) {
  const byCurrency = new Map<string, number>()
  for (const line of lines) {
    if (line.lostSalesMinor && line.priceCurrency) {
      addTo(byCurrency, line.priceCurrency, line.lostSalesMinor)
    }
  }
  return byCurrency
}

// A new PO to the supplier with the selected lines, up to a PO's line limit, for the channel's destination.
export function createPoHref(
  lines: readonly RestockLine[],
  edits: LineEdits,
  channel: RestockReportData["channel"],
  supplierId: string | null
) {
  const chosen = lines
    .map((line) => [line.variantId, orderUnits(line, edits.get(line.variantId))] as const)
    .filter(([, units]) => units > 0)
  const included = chosen.slice(0, poLineLimit)
  const params = new URLSearchParams(included.map(([id, units]) => ["variant", `${id}@${units}`]))
  if (channel.kind !== "pool") {
    params.set("destination", channel.kind === "amazon" ? "amazon" : "warehouse")
  } else if (channel.members.every((member) => member.provider === "amazon")) {
    params.set("destination", "amazon")
  } else if (channel.members.every((member) => member.provider === "shopify")) {
    params.set("destination", "warehouse")
  }
  if (channel.kind === "shopify") {
    params.set("locationId", channel.locationId)
  }
  if (supplierId) {
    params.set("supplierId", supplierId)
  }
  return { href: `/orders/new?${params}`, count: included.length, capped: chosen.length > poLineLimit }
}
export type PoLink = ReturnType<typeof createPoHref>

// A step's label: a message under restock.calculation, with its values.
export type StepLabel =
  | { key: "sold"; days: number }
  | { key: "leadTimeNeed"; days: number }
  | { key: "minimumAt"; where: string }
  | { key: "toOrderCases"; cases: number; size: number }
  | {
      key:
        | "outOfStock"
        | "salesRate"
        | "minimumHere"
        | "available"
        | "incoming"
        | "toOrder"
        | "toOrderMinimum"
        | "daysOut"
        | "lostSales"
    }
// A step's figure: a number, days, units sold a day, units, or lost sales with what they'd have sold for.
export type StepValue =
  | { kind: "count"; value: number }
  | { kind: "days"; value: number }
  | { kind: "perDay"; value: number }
  | { kind: "units"; value: number }
  | { kind: "lostValue"; units: number; minor: number; currency: string }
export type RestockStep = { label: StepLabel; value: StepValue; sign?: "+" | "−" | "="; result?: boolean }

const count = (value: number): StepValue => ({ kind: "count", value })

// The quantity's label: rounded up past what's needed to whole cases or to the minimum order, or as needed.
function orderLabel(line: RestockLine): StepLabel {
  if (line.purchaseUnits === null || line.need === null || line.purchaseUnits === line.need) {
    return { key: "toOrder" }
  }
  return line.caseCount && line.caseQuantity && line.caseQuantity > 1
    ? { key: "toOrderCases", cases: line.caseCount, size: line.caseQuantity }
    : { key: "toOrderMinimum" }
}

// How the suggested quantity was reached: the sales rate, then the sum, ending in the quantity to order.
export function calculationSteps(line: RestockLine) {
  const sold = line.sold ?? 0
  const steps: RestockStep[] = [{ label: { key: "sold", days: line.salesDays }, value: count(sold) }]
  if (line.stockoutDays) {
    steps.push({ label: { key: "outOfStock" }, value: { kind: "days", value: line.stockoutDays } })
  }
  steps.push(
    { label: { key: "salesRate" }, value: { kind: "perDay", value: sold / line.rateDays } },
    {
      label: { key: "leadTimeNeed", days: line.leadTimeDays },
      value: count(Math.ceil((sold * line.leadTimeDays) / line.rateDays))
    }
  )
  if (line.targetStock) {
    steps.push({
      label: line.targetWhere ? { key: "minimumAt", where: line.targetWhere } : { key: "minimumHere" },
      value: count(line.targetStock),
      sign: "+"
    })
  }
  steps.push(
    { label: { key: "available" }, value: count(line.available ?? 0), sign: "−" },
    { label: { key: "incoming" }, value: count(line.incoming ?? 0), sign: "−" },
    { label: orderLabel(line), value: count(line.purchaseUnits ?? line.need ?? 0), sign: "=", result: true }
  )
  return steps
}

// What an order placed today can't prevent: the days out of stock before it arrives, and the sales lost in them, in
// units alone without prices.
export function lossSteps(line: RestockLine, prices: boolean) {
  if (!line.lostUnits || !line.lostDays) {
    return []
  }
  const lost: StepValue =
    prices && line.lostSalesMinor !== null && line.priceCurrency
      ? { kind: "lostValue", units: line.lostUnits, minor: line.lostSalesMinor, currency: line.priceCurrency }
      : { kind: "units", value: line.lostUnits }
  const steps: RestockStep[] = [
    { label: { key: "daysOut" }, value: count(line.lostDays) },
    { label: { key: "lostSales" }, value: lost }
  ]
  return steps
}

export const restockSorts = ["urgency", "quantity", "name"] as const
export type RestockSort = (typeof restockSorts)[number]

const statusRank: Record<RestockStatus, number> = {
  stockout: 0,
  reorder: 1,
  blocked: 2,
  stocked: 3,
  not_stocked: 4,
  no_listing: 5
}

// The lines a search and a link's filters leave: matching the search by product, variant or SKU, in one days-of-cover
// group, or only those to reorder.
export function matchingLines(
  lines: readonly RestockLine[],
  filters: { query: string; cover: CoverBucket | null; onlyOrders: boolean }
) {
  return lines.filter(
    (line) =>
      matches(filters.query, line.product, line.variant, line.sku) &&
      (!filters.cover || coverBucket(line) === filters.cover) &&
      (!filters.onlyOrders || toReorder(line))
  )
}

// The lines listed under their suppliers, in the chosen order. Lines with enough stock wait for Show all or a
// days-of-cover filter, and lines that can't be calculated are left out while a store's sales couldn't be read.
export function listedLines(
  lines: readonly RestockLine[],
  options: { showAll: boolean; cover: CoverBucket | null; salesError: boolean; sort: RestockSort }
) {
  return lines
    .filter(
      (line) =>
        options.showAll ||
        options.cover !== null ||
        toReorder(line) ||
        (line.status === "blocked" && !options.salesError)
    )
    .toSorted((a, b) => {
      if (options.sort === "name") {
        return `${a.product} ${a.variant ?? ""}`.localeCompare(`${b.product} ${b.variant ?? ""}`)
      }
      if (options.sort === "quantity") {
        return (b.purchaseUnits ?? -1) - (a.purchaseUnits ?? -1)
      }
      return (
        statusRank[a.status] - statusRank[b.status] ||
        (a.daysRemaining ?? Number.MAX_SAFE_INTEGER) - (b.daysRemaining ?? Number.MAX_SAFE_INTEGER) ||
        (b.purchaseUnits ?? 0) - (a.purchaseUnits ?? 0)
      )
    })
}

// A supplier's lines. `supplierId` is null for a supplier only in Shopify, ordered outside Copacker.
export type SupplierLines = { key: string; name: string; supplierId: string | null; lines: RestockLine[] }

// Lines by supplier, keeping their order: Copacker suppliers first, by name, then suppliers only in Shopify.
export function supplierGroups(lines: readonly RestockLine[]) {
  const groups = new Map<string, SupplierLines>()
  for (const line of lines) {
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
  return [...groups.values()].toSorted(
    (a, b) => Number(a.supplierId === null) - Number(b.supplierId === null) || a.name.localeCompare(b.name)
  )
}
