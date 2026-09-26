import { sql } from "drizzle-orm"
import { db } from "@/db"
import { addDays, zonedStart } from "@/lib/time-zone"
import type { SalesSource } from "./sales-orders"

// Money here is net product sales: what customers paid for the products, after discounts, without tax, shipping or
// tips. Shopify lines count at their current quantity (removed and refunded units are gone), with their share of
// line and order discounts; Amazon items count their ITEM proceeds less any DISCOUNT.

// One Shopify order line's sales, in the store's currency (null when the line has no price copied).
const lineRevenue =
  sql.raw(`((line->'originalUnitPriceSet'->'shopMoney'->>'amount')::numeric * (line->>'currentQuantity')::int
  - case when (line->>'quantity')::int > 0 then
      coalesce((select sum((a->'allocatedAmountSet'->'shopMoney'->>'amount')::numeric)
        from jsonb_array_elements(coalesce(line->'discountAllocations', '[]'::jsonb)) a), 0)
      * (line->>'currentQuantity')::int / (line->>'quantity')::int
    else 0 end)`)
const linePriced = sql.raw(`(line ? 'originalUnitPriceSet')`)
// One Amazon order item's sales.
const itemRevenue = sql.raw(`(select coalesce(sum(case b->>'type'
    when 'ITEM' then (b->'subtotal'->>'amount')::numeric
    when 'DISCOUNT' then -abs((b->'subtotal'->>'amount')::numeric)
    else 0 end), 0)
  from jsonb_array_elements(coalesce(item->'proceeds'->'breakdowns', '[]'::jsonb)) b)`)
const itemPriced = sql.raw(`(coalesce(jsonb_typeof(item->'proceeds'->'breakdowns'), '') = 'array')`)

const orderUnits = sql.raw(`case when o.source = 'amazon' then
  (select coalesce(sum((item->>'quantityOrdered')::int), 0) from jsonb_array_elements(o.data->'orderItems') item)
else
  (select coalesce(sum((line->>'currentQuantity')::int), 0) from jsonb_array_elements(o.data->'lines') line
    where jsonb_typeof(line->'lineItemGroup') is distinct from 'object')
  + (select coalesce(sum(grp.quantity), 0) from (
      select distinct on (line->'lineItemGroup'->>'id') (line->'lineItemGroup'->>'quantity')::int as quantity
      from jsonb_array_elements(o.data->'lines') line
      where jsonb_typeof(line->'lineItemGroup') = 'object'
    ) grp)
end`)
const orderRevenue = sql`case when o.source = 'amazon' then
  (select sum(${itemRevenue}) from jsonb_array_elements(o.data->'orderItems') item)
else
  (select coalesce(sum(${lineRevenue}), 0) from jsonb_array_elements(o.data->'lines') line)
end`
const orderPriced = sql`case when o.source = 'amazon' then
  not exists (select 1 from jsonb_array_elements(o.data->'orderItems') item where not ${itemPriced})
else
  not exists (select 1 from jsonb_array_elements(o.data->'lines') line where not ${linePriced})
end`
const orderCurrency = sql.raw(`coalesce(o.data #>> '{lines,0,originalUnitPriceSet,shopMoney,currencyCode}',
  jsonb_path_query_first(o.data, '$.orderItems[*].proceeds.breakdowns[*].subtotal.currencyCode') #>> '{}')`)

type Account = { provider: SalesSource; externalId: string }

function accountFilter(accounts: Account[]) {
  return sql.join(
    accounts.map((account) => sql`(o.source = ${account.provider} and o."externalAccountId" = ${account.externalId})`),
    sql` or `
  )
}

function rows(result: unknown) {
  return (result as { rows: Record<string, unknown>[] }).rows
}

const count = (value: unknown) => (value === null || value === undefined ? 0 : Number(value))

export type DayRow = {
  source: SalesSource
  date: string
  orders: number
  units: number
  // Orders with prices, and their sales in minor units.
  priced: number
  revenueMinor: number
  currency: string | null
}

// Orders, units and sales per source and day in the store's time zone since `since`, for the connected accounts.
export async function salesByDay(orgId: string, accounts: Account[], since: Date, timeZone: string) {
  if (!accounts.length) {
    return []
  }
  const date = sql`to_char(o."orderedAt" at time zone ${timeZone}, 'YYYY-MM-DD')`
  const result = await db().execute(sql`
    select o.source, ${date} as date, count(*) as orders, sum(${orderUnits}) as units,
      count(*) filter (where ${orderPriced}) as priced,
      round(coalesce(sum(${orderRevenue}) filter (where ${orderPriced}), 0) * 100) as revenue,
      max(${orderCurrency}) filter (where ${orderPriced}) as currency
    from sales_orders o
    where o."orgId" = ${orgId} and o."orderedAt" >= ${since} and (${accountFilter(accounts)})
    group by 1, 2`)
  return rows(result).map(
    (row): DayRow => ({
      source: row.source as SalesSource,
      date: String(row.date),
      orders: count(row.orders),
      units: count(row.units),
      priced: count(row.priced),
      revenueMinor: count(row.revenue),
      currency: (row.currency as string | null) ?? null
    })
  )
}

export type ItemRow = {
  source: SalesSource
  // A Shopify variant ID (the bundle's, for a bundle sale) or an Amazon seller SKU.
  key: string
  period: "current" | "previous"
  units: number
  revenueMinor: number
  pricedUnits: number
  currency: string | null
}

// Units and sales per item over the current period and the one before it. A Shopify bundle counts once, under the
// bundle's variant, with its components' sales.
export async function salesByItem(
  orgId: string,
  accounts: Account[],
  periods: { previousStart: Date; currentStart: Date; end: Date }
) {
  if (!accounts.length) {
    return []
  }
  const period = sql`case when o."orderedAt" >= ${periods.currentStart} then 'current' else 'previous' end`
  const scope = sql`o."orgId" = ${orgId} and o."orderedAt" >= ${periods.previousStart}
    and o."orderedAt" < ${periods.end} and (${accountFilter(accounts)})`
  const result = await db().execute(sql`
    with lines as (
      select o."orderId" as "orderId", o.source, ${period} as period,
        coalesce(line->'lineItemGroup'->>'variantId', line->'variant'->>'id') as key,
        coalesce(line->'lineItemGroup'->>'id', line->>'id') as grp,
        case when jsonb_typeof(line->'lineItemGroup') = 'object' then (line->'lineItemGroup'->>'quantity')::int
          else (line->>'currentQuantity')::int end as units,
        ${lineRevenue} as revenue, ${linePriced} as priced,
        line->'originalUnitPriceSet'->'shopMoney'->>'currencyCode' as currency
      from sales_orders o, jsonb_array_elements(o.data->'lines') line
      where o.source = 'shopify' and ${scope}
      union all
      select o."orderId", o.source, ${period}, item->'product'->>'sellerSku', item->>'orderItemId',
        (item->>'quantityOrdered')::int, ${itemRevenue}, ${itemPriced},
        jsonb_path_query_first(item, '$.proceeds.breakdowns[*].subtotal.currencyCode') #>> '{}'
      from sales_orders o, jsonb_array_elements(o.data->'orderItems') item
      where o.source = 'amazon' and ${scope}
    ), grouped as (
      select "orderId", source, period, key, grp, max(units) as units, sum(revenue) as revenue,
        bool_and(priced) as priced, max(currency) as currency
      from lines where key is not null
      group by "orderId", source, period, key, grp
    )
    select source, period, key, sum(units) as units,
      round(coalesce(sum(revenue) filter (where priced), 0) * 100) as revenue,
      coalesce(sum(units) filter (where priced), 0) as "pricedUnits", max(currency) as currency
    from grouped
    group by source, period, key`)
  return rows(result).map(
    (row): ItemRow => ({
      source: row.source as SalesSource,
      key: String(row.key),
      period: row.period === "current" ? "current" : "previous",
      units: count(row.units),
      revenueMinor: count(row.revenue),
      pricedUnits: count(row.pricedUnits),
      currency: (row.currency as string | null) ?? null
    })
  )
}

export type OrderFees = { orderId: string; revenueMinor: number | null; feesMinor: number | null }

// Amazon's posted fees on an order (null until Amazon posts its payment, usually within two days of shipping).
const amazonOrderFee = sql.raw(`(select sum(t."feesMinor") from amazon_transactions t
  where t."orgId" = o."orgId" and t."externalAccountId" = o."externalAccountId" and t."orderId" = o."orderId")`)
// Shopify Payments' fees on an order, with their tax, from its successful payments (null when copied without them).
const shopifyOrderFee = sql.raw(`case when o.data ? 'transactions' then
  (select coalesce(sum(round(((fee->'amount'->>'amount')::numeric + (fee->'taxAmount'->>'amount')::numeric) * 100)), 0)
    from jsonb_array_elements(o.data->'transactions') payment, jsonb_array_elements(payment->'fees') fee
    where payment->>'status' = 'SUCCESS')
end`)

// Each order from one account in a period, with its sales (null without prices) and the platform's fees on it.
export async function orderFees(orgId: string, source: SalesSource, account: string, from: Date, to: Date) {
  const fee = source === "amazon" ? amazonOrderFee : shopifyOrderFee
  const result = await db().execute(sql`
    select o."orderId" as "orderId",
      case when ${orderPriced} then round(${orderRevenue} * 100) end as revenue,
      ${fee} as fees
    from sales_orders o
    where o."orgId" = ${orgId} and o.source = ${source} and o."externalAccountId" = ${account}
      and o."orderedAt" >= ${from} and o."orderedAt" < ${to}`)
  return rows(result).map(
    (row): OrderFees => ({
      orderId: String(row.orderId),
      revenueMinor: row.revenue === null || row.revenue === undefined ? null : Number(row.revenue),
      feesMinor: row.fees === null || row.fees === undefined ? null : Number(row.fees)
    })
  )
}

// A platform's fees on a period's orders. Orders whose fees aren't known yet (Amazon posts them after shipping) are
// estimated at the rate of the known ones; the estimate is reported so the page can say so.
export function platformFees(list: OrderFees[]) {
  const posted = list.filter((order) => order.feesMinor !== null && order.revenueMinor !== null)
  const postedRevenue = posted.reduce((sum, order) => sum + order.revenueMinor!, 0)
  const postedFees = posted.reduce((sum, order) => sum + order.feesMinor!, 0)
  const waiting = list.filter((order) => order.feesMinor === null && order.revenueMinor !== null)
  const rate = postedRevenue > 0 ? postedFees / postedRevenue : null
  const estimated = rate === null ? 0 : Math.round(waiting.reduce((sum, order) => sum + order.revenueMinor!, 0) * rate)
  return {
    feesMinor: postedFees + estimated,
    estimatedMinor: estimated,
    estimatedOrders: rate === null ? 0 : waiting.length,
    // Orders with sales but no fees to go on: nothing known in the period to estimate from.
    unknownOrders: rate === null ? waiting.length : 0,
    revenueMinor: list.reduce((sum, order) => sum + (order.revenueMinor ?? 0), 0),
    rate
  }
}

export type SourceDay = { orders: number; units: number; revenueMinor: number; unpriced: number }
export type DailySales = { date: string } & Record<SalesSource, SourceDay | null>

// One row per day for the last `days` full days in the store's time zone, oldest first. A source's day is null when
// its stored orders don't cover the whole day, so charts show a gap instead of a false zero.
export function dailySales(
  list: DayRow[],
  coverage: Partial<Record<SalesSource, { from: Date; to: Date }>>,
  today: string,
  days: number,
  timeZone: string
): DailySales[] {
  const byKey = new Map(list.map((row) => [`${row.source}:${row.date}`, row]))
  const series: DailySales[] = []
  for (let index = days; index >= 1; index--) {
    const date = addDays(today, -index)
    const start = zonedStart(date, timeZone).getTime()
    const end = zonedStart(addDays(date, 1), timeZone).getTime()
    const cell = (source: SalesSource): SourceDay | null => {
      const covered = coverage[source]
      if (!covered || covered.from.getTime() > start || covered.to.getTime() < end) {
        return null
      }
      const row = byKey.get(`${source}:${date}`)
      return {
        orders: row?.orders ?? 0,
        units: row?.units ?? 0,
        revenueMinor: row?.revenueMinor ?? 0,
        unpriced: (row?.orders ?? 0) - (row?.priced ?? 0)
      }
    }
    series.push({ date, shopify: cell("shopify"), amazon: cell("amazon") })
  }
  return series
}

type Totals = { orders: number; units: number; revenueMinor: number; unpriced: number }
export type PeriodTotal = Totals & { previous: Totals | null }

// Orders, units and sales over the last `days` days against the days before them. A comparison is made only when
// every counted source covers both periods.
export function periodTotal(series: DailySales[], sources: SalesSource[], days: number): PeriodTotal {
  const sum = (list: DailySales[]) => {
    const totals = { orders: 0, units: 0, revenueMinor: 0, unpriced: 0 }
    let complete = true
    for (const row of list) {
      for (const source of sources) {
        const cell = row[source]
        if (cell) {
          totals.orders += cell.orders
          totals.units += cell.units
          totals.revenueMinor += cell.revenueMinor
          totals.unpriced += cell.unpriced
        } else {
          complete = false
        }
      }
    }
    return { totals, complete }
  }
  const current = sum(series.slice(-days))
  const before = series.length >= days * 2 ? sum(series.slice(-days * 2, -days)) : null
  return {
    ...current.totals,
    previous: before?.complete && current.complete && sources.length ? before.totals : null
  }
}

// The window boundaries for the last `days` full days and the same number before them, in the store's time zone.
export function periods(today: string, days: number, timeZone: string) {
  return {
    previousStart: zonedStart(addDays(today, -days * 2), timeZone),
    currentStart: zonedStart(addDays(today, -days), timeZone),
    end: zonedStart(today, timeZone)
  }
}

type CatalogRow = {
  variantId: string
  buyerSku: string | null
  productTitle?: string
  variantTitle?: string
  imageUrl?: string | null
  unitCostMinor?: number | null
  costCurrency?: string | null
  priceMinor?: number | null
  priceCurrency?: string | null
  bundle?: { components?: { variantId: string; quantity: number }[] | null }
}

// Looks up catalog details by Shopify variant or Amazon seller SKU. An Amazon SKU matches a variant only when
// exactly one variant carries it.
export function catalogIndex(catalog: readonly CatalogRow[]) {
  const byVariant = new Map(catalog.map((row) => [row.variantId, row]))
  const bySku = new Map<string, CatalogRow | null>()
  for (const row of catalog) {
    if (row.buyerSku) {
      bySku.set(row.buyerSku, bySku.has(row.buyerSku) ? null : row)
    }
  }
  const variantFor = (source: SalesSource, key: string) =>
    source === "shopify" ? (byVariant.get(key) ?? null) : (bySku.get(key) ?? null)
  // A unit's cost: its own, or for a bundle the sum of its components' costs. Null when any is missing.
  const unitCost = (row: CatalogRow | null): { minor: number; currency: string } | null => {
    if (!row) {
      return null
    }
    if (row.bundle) {
      const components = row.bundle.components
      if (!components?.length) {
        return null
      }
      let minor = 0,
        currency: string | null = null
      for (const component of components) {
        const part = unitCost(byVariant.get(component.variantId) ?? null)
        if (!part || (currency && part.currency !== currency)) {
          return null
        }
        currency = part.currency
        minor += part.minor * component.quantity
      }
      return currency ? { minor, currency } : null
    }
    return row.unitCostMinor !== null && row.unitCostMinor !== undefined && row.costCurrency
      ? { minor: row.unitCostMinor, currency: row.costCurrency }
      : null
  }
  return { byVariant, variantFor, unitCost }
}

// Gross profit over the current period: sales less the cost of the units sold and each platform's fees (Amazon's
// fees, Shopify Payments' processing fees). Only items with a unit cost in the sales currency count; the sales left
// out are reported so the page can say so.
export function grossProfit(
  items: ItemRow[],
  index: ReturnType<typeof catalogIndex>,
  fees: Partial<Record<SalesSource, { feesMinor: number; revenueMinor: number }>>
) {
  const current = items.filter((item) => item.period === "current" && item.pricedUnits > 0 && item.currency)
  // Sales in more than one currency can't be added up; the currency most sales are in is used.
  const byCurrency = new Map<string, number>()
  for (const item of current) {
    byCurrency.set(item.currency!, (byCurrency.get(item.currency!) ?? 0) + item.revenueMinor)
  }
  const currency = [...byCurrency].toSorted((a, b) => b[1] - a[1])[0]?.[0] ?? null
  let revenue = 0,
    costed = 0,
    cost = 0
  const costedBySource: Record<SalesSource, number> = { shopify: 0, amazon: 0 }
  for (const item of current) {
    if (item.currency !== currency) {
      continue
    }
    revenue += item.revenueMinor
    const unit = index.unitCost(index.variantFor(item.source, item.key))
    if (unit && unit.currency === currency) {
      costed += item.revenueMinor
      cost += unit.minor * item.pricedUnits
      costedBySource[item.source] += item.revenueMinor
    }
  }
  // Fees follow the sales they're charged on, so only the costed share of each platform's sales carries its fees.
  let feesMinor = 0
  for (const source of ["shopify", "amazon"] as const) {
    const platform = fees[source]
    if (platform && platform.revenueMinor > 0) {
      feesMinor += Math.round(platform.feesMinor * Math.min(1, costedBySource[source] / platform.revenueMinor))
    }
  }
  const profit = costed - cost - feesMinor
  return {
    currency,
    revenueMinor: revenue,
    costedRevenueMinor: costed,
    costMinor: cost,
    feesMinor,
    profitMinor: profit,
    margin: costed > 0 ? profit / costed : null
  }
}

export type Mover = {
  id: string
  product: string
  variant: string | null
  sku: string | null
  imageUrl: string | null
  current: number
  previous: number
}

// Items selling noticeably more or less than in the period before, by change in units. Only sources that cover both
// periods are compared, and small sellers (under 5 units in both periods) are left out as noise.
export function movers(items: ItemRow[], index: ReturnType<typeof catalogIndex>, sources: SalesSource[]) {
  const byItem = new Map<string, Mover>()
  for (const item of items) {
    if (!sources.includes(item.source)) {
      continue
    }
    const row = index.variantFor(item.source, item.key)
    const id = row?.variantId ?? `${item.source}:${item.key}`
    const entry = byItem.get(id) ?? {
      id,
      product: row?.productTitle ?? (item.source === "amazon" ? item.key : "Unknown product"),
      variant: row?.variantTitle && row.variantTitle !== "Default Title" ? row.variantTitle : null,
      sku: row?.buyerSku ?? (item.source === "amazon" ? item.key : null),
      imageUrl: row?.imageUrl ?? null,
      current: 0,
      previous: 0
    }
    entry[item.period] += item.units
    byItem.set(id, entry)
  }
  const list = [...byItem.values()].filter((entry) => Math.max(entry.current, entry.previous) >= 5)
  return {
    rising: list
      .filter((entry) => entry.current > entry.previous)
      .toSorted((a, b) => b.current - b.previous - (a.current - a.previous))
      .slice(0, 4),
    falling: list
      .filter((entry) => entry.current < entry.previous)
      .toSorted((a, b) => a.current - a.previous - (b.current - b.previous))
      .slice(0, 4)
  }
}

// Recent average selling price per variant and source, from the current and previous periods together.
export function sellingPrices(items: ItemRow[], index: ReturnType<typeof catalogIndex>) {
  const totals = new Map<string, { units: number; revenue: number; currency: string }>()
  for (const item of items) {
    const row = index.variantFor(item.source, item.key)
    if (!row || !item.pricedUnits || !item.currency) {
      continue
    }
    const key = `${item.source}:${row.variantId}`
    const entry = totals.get(key) ?? { units: 0, revenue: 0, currency: item.currency }
    if (entry.currency === item.currency) {
      entry.units += item.pricedUnits
      entry.revenue += item.revenueMinor
      totals.set(key, entry)
    }
  }
  return (source: SalesSource, variantId: string) => {
    const entry = totals.get(`${source}:${variantId}`)
    return entry && entry.units > 0
      ? { minor: Math.round(entry.revenue / entry.units), currency: entry.currency }
      : null
  }
}
