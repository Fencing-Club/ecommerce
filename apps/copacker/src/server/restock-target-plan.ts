import {
  inventoryLocationKey,
  resolveStockTargets,
  type LocationGroup,
  type TargetLocation,
  type VariantStockTarget
} from "@repo/copacker-contract"
import { amazonPools } from "./inventory-products"
import { calculateRestockLine, restockLineStatus, restockPlan, type RestockLine } from "./restock-plan"

type Input = Omit<Parameters<typeof restockPlan>[0], "channel">
type TargetSet = { variantId: string; targets: VariantStockTarget[] }
const total = (values: (number | null)[]) =>
  values.some((value) => value === null) ? null : values.reduce<number>((sum, value) => sum + (value ?? 0), 0)

// Resolve every target before report filters. Raw balances and attributed demand are pooled before one calculation.
// No selected member is interpreted as a shipment destination or a transfer instruction.
export function restockTargetPlan(
  input: Input,
  sets: readonly TargetSet[],
  groups: readonly LocationGroup[],
  locations: readonly TargetLocation[]
) {
  const cache = new Map<string, Map<string, RestockLine>>()
  const linesFor = (key: string, options: Parameters<typeof restockPlan>[0]) => {
    let lines = cache.get(key)
    if (!lines) {
      lines = new Map(restockPlan(options).map((line) => [line.variantId, line]))
      cache.set(key, lines)
    }
    return lines
  }
  // A positive placeholder includes unlisted Amazon SKUs in the raw basis; the actual buffer and stocking intent
  // are applied once below. Keep the full catalog so duplicate SKU detection remains global.
  const catalog = input.catalog.map((row) => ({ ...row, amazonStockTarget: 1, storeStockTarget: null }))
  return sets.flatMap((set) =>
    resolveStockTargets(set.targets, groups, locations).targets.map((target) => {
      const parts: RestockLine[] = []
      const issues: string[] = target.issues.map((issue) => issue.code)
      const shopify = target.members.filter((member) => member.provider === "shopify")
      const amazon = target.members.filter((member) => member.provider === "amazon")
      for (const member of shopify) {
        const line = linesFor(inventoryLocationKey(member), {
          ...input,
          catalog,
          channel: { kind: "shopify", locationId: member.externalId },
          stockoutsFor: undefined
        }).get(set.variantId)
        if (line) {
          parts.push(line)
        } else {
          issues.push("stock_unknown")
        }
      }
      if (amazon.length) {
        const fba = amazon.some((member) => member.externalId === "fba")
        const awd = amazon.some((member) => member.externalId === "awd")
        const ids = new Set<string>([...(fba ? [amazonPools.fba.id] : []), ...(awd ? [amazonPools.awd.id] : [])])
        const onOrder = new Map(
          [...input.onOrder].map(([variantId, orders]) => [
            variantId,
            orders.filter((order) => order.destination === "amazon" && order.locationIds.some((id) => ids.has(id)))
          ])
        )
        let amazonSales: Input["amazonSales"] = { rows: [], gaps: [] }
        if (fba) {
          amazonSales = input.amazonSales
            ? { ...input.amazonSales, rows: input.amazonSales.rows.filter((row) => row.pool === "fba") }
            : null
        }
        const line = linesFor(`amazon:${fba}:${awd}`, {
          ...input,
          catalog,
          channel: { kind: "amazon" },
          fbaRows: fba ? input.fbaRows : [],
          awdRows: awd ? input.awdRows : [],
          onOrder,
          amazonSales,
          stockoutsFor: undefined
        }).get(set.variantId)
        if (line) {
          parts.push(line)
        } else {
          issues.push("stock_unknown")
        }
        // An Amazon PO with no known receiving pool must not disappear from the uncertainty calculation.
        if (
          (input.onOrder.get(set.variantId) ?? []).some(
            (order) => order.destination === "amazon" && !order.locationIds.length
          )
        ) {
          issues.push("incoming_unknown")
        }
        if (
          fba &&
          input.amazonSales?.rows.some(
            (row) =>
              row.pool === "fbm_unassigned" && row.fulfilledUnits > 0 && row.buyerSku === firstSku(input, set.variantId)
          )
        ) {
          issues.push("demand_unassigned")
        }
      }
      if (target.members.some((member) => member.provider !== "shopify" && member.provider !== "amazon")) {
        issues.push("unsupported_connector")
      }
      const first = parts[0]
      if (!first) {
        return {
          variantId: set.variantId,
          targetId: target.id,
          members: target.members,
          issues: [...new Set(issues)],
          line: null
        }
      }
      const blocked = target.stocked === false ? [] : [...new Set(parts.flatMap((line) => line.blocked))]
      if (issues.length && !blocked.includes("stock_unknown")) {
        blocked.push("stock_unknown")
      }
      if (target.stocked !== false && parts.some((line) => line.status === "no_listing")) {
        issues.push("no_listing")
      }
      const shopifyIds = new Set(shopify.map((member) => member.externalId))
      const repeatedIncoming = (input.onOrder.get(set.variantId) ?? []).reduce(
        (sum, order) =>
          sum +
          (order.destination === "amazon"
            ? 0
            : Math.max(0, order.locationIds.filter((id) => shopifyIds.has(id)).length - 1) * order.units),
        0
      )
      const incoming = total(parts.map((line) => line.incoming))
      const base = {
        ...first,
        available: total(parts.map((line) => line.available)),
        incoming: incoming === null ? null : incoming - repeatedIncoming,
        sold: total(parts.map((line) => line.sold)),
        soldAlone: total(parts.map((line) => line.soldAlone)),
        soldInBundles: total(parts.map((line) => line.soldInBundles)),
        soldOnEbay: total(parts.map((line) => line.soldOnEbay)),
        targetStock: target.quantity,
        targetWhere: target.name,
        stockoutDays: 0,
        rateDays: input.salesDays,
        blocked
      }
      const calculated = calculateRestockLine(base, target.stocked === false)
      const line: RestockLine = {
        ...base,
        ...calculated,
        status: restockLineStatus({ ...base, ...calculated })
      }
      if (target.stocked === false) {
        line.status = "not_stocked"
      }
      if (issues.length || blocked.length) {
        line.status = "blocked"
        line.purchaseUnits = null
        line.need = null
        line.caseCount = null
        line.estimatedCostMinor = null
      }
      return {
        variantId: set.variantId,
        targetId: target.id,
        members: target.members,
        issues: [...new Set(issues)],
        line
      }
    })
  )
}

function firstSku(input: Input, variantId: string) {
  return input.catalog.find((row) => row.variantId === variantId)?.buyerSku
}
