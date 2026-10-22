import { amazonMarketplaces } from "@repo/copacker-marketplaces/amazon-marketplaces"
import { variantName } from "@repo/copacker-marketplaces/shopify"
import { freightPerSku } from "@repo/copacker-shipments/amazon-inbound"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import type { ServerKey } from "@/i18n/server-text"
import type { ServerText } from "@/i18n/server-text"
import { serverTextInEnglish } from "@/i18n/server-text"
import type { DayRange } from "@/lib/date-range"
import { rangeDays } from "@/lib/date-range"
import { stores, type Store } from "@/lib/stores"
import { addDays, zonedStart } from "@/lib/time-zone"
import { adsCharge } from "./amazon-ads"
import { countedAmazonTransaction } from "./amazon-counted-transaction"
import { freightDescriptions } from "./amazon-shipments"
import { amazonReplacement, countedOrder } from "./counted-orders"
import { taggedWith } from "./shopify-tags"
import { serverText } from "./text"

// Money here is net product sales: what customers paid for the products, after discounts, without tax, shipping or
// tips. Shopify lines count at their current quantity (removed and refunded units are gone), with their share of
// line and order discounts; Amazon items count their ITEM proceeds less any DISCOUNT; eBay lines count their price less
// the seller's promotions.

// One Shopify order line's sales, in the store's currency (null when the line has no price copied).
const lineRevenue =
  sql.raw(`((line->'originalUnitPriceSet'->'shopMoney'->>'amount')::numeric * (line->>'currentQuantity')::int
  - case when (line->>'quantity')::int > 0 then
      coalesce((select sum((a->'allocatedAmountSet'->'shopMoney'->>'amount')::numeric)
        from jsonb_array_elements(line->'discountAllocations') a), 0)
      * (line->>'currentQuantity')::int / (line->>'quantity')::int
    else 0 end)`)
// One Amazon order item's sales: its ITEM proceeds less discounts, except the part of a discount that was for shipping
// (free shipping isn't taken off product sales). A discount copied without its breakdown counts in full.
const itemRevenue = sql.raw(`(select coalesce(sum(case b->>'type'
    when 'ITEM' then (b->'subtotal'->>'amount')::numeric
    when 'DISCOUNT' then -abs((b->'subtotal'->>'amount')::numeric)
      + coalesce((select sum(abs((d->'value'->>'amount')::numeric))
        from jsonb_array_elements(coalesce(b->'detailedBreakdowns', '[]'::jsonb)) d where d->>'subtype' = 'SHIPPING'), 0)
    else 0 end), 0)
  from jsonb_array_elements(coalesce(item->'proceeds'->'breakdowns', '[]'::jsonb)) b)`)
// An Amazon item has its price once Amazon adds its proceeds. A line with nothing ordered has none to add, and an order
// Amazon paid nothing for (a replacement, or any order whose payments all post at zero) is priced at zero.
const amazonFreeOrder = sql`(${amazonReplacement(sql`o.data`)} or (exists (select 1 from amazon_transactions t where t."orgId" = o."orgId"
    and t."externalAccountId" = o."externalAccountId" and t."orderId" = o."orderId" and t.type = 'Shipment')
  and not exists (select 1 from amazon_transactions t where t."orgId" = o."orgId"
    and t."externalAccountId" = o."externalAccountId" and t."orderId" = o."orderId" and t.type = 'Shipment'
    and t."totalMinor" <> 0)))`
const itemPriced = sql`(coalesce(jsonb_typeof(item->'proceeds'->'breakdowns'), '') = 'array'
  or (item->>'quantityOrdered')::int = 0 or ${amazonFreeOrder})`
// One eBay order line's price less the seller's promotions on it, and what was refunded on it. eBay prices every line.
const ebayLinePrice = `((ebay->'lineItemCost'->>'value')::numeric
  - coalesce((select sum(abs((p->'discountAmount'->>'value')::numeric))
    from jsonb_array_elements(coalesce(ebay->'appliedPromotions', '[]'::jsonb)) p), 0))`
const ebayLineRefunded = `coalesce((select sum(abs((r->'amount'->>'value')::numeric))
    from jsonb_array_elements(coalesce(ebay->'refunds', '[]'::jsonb)) r), 0)`
// A line refunded in full, or in an order eBay refunded in full, has no sales or units left (see ebayLineSales).
const ebayLineGone = `(o.data->>'orderPaymentStatus' = 'FULLY_REFUNDED'
  or (${ebayLinePrice} > 0 and ${ebayLineRefunded} >= ${ebayLinePrice}))`
const ebayLineSales = `(case when ${ebayLineGone} then 0
  else greatest(0, ${ebayLinePrice} - ${ebayLineRefunded}) end)`
// The order's lines' sales, and what eBay refunded on the order beyond its lines (see ebayOrderRefund), which comes
// off each line in proportion to its sales.
const ebayOrderLines = `(select coalesce(sum(${ebayLineSales}), 0) from jsonb_array_elements(o.data->'lineItems') ebay)`
const ebayOrderRefund = `greatest(0, coalesce((select sum(abs((r->'amount'->>'value')::numeric))
    from jsonb_array_elements(coalesce(o.data->'paymentSummary'->'refunds', '[]'::jsonb)) r
    where r->>'refundStatus' = 'REFUNDED'), 0)
  - coalesce((select sum(abs((lr->'amount'->>'value')::numeric))
    from jsonb_array_elements(coalesce(o.data->'lineItems', '[]'::jsonb)) li,
      jsonb_array_elements(coalesce(li->'refunds', '[]'::jsonb)) lr), 0))`
const ebayLineRevenue = sql.raw(`(${ebayLineSales} * (case when ${ebayOrderLines} > 0
  then greatest(0, 1 - ${ebayOrderRefund} / ${ebayOrderLines}) else 1 end))`)
const ebayLineUnits = `(case when ${ebayLineGone} then 0 else (ebay->>'quantity')::int end)`

// Shared with sync-status totals. The order table must be aliased as `o`.
export const orderUnits = sql.raw(`case when o.source = 'amazon' then
  (select coalesce(sum((item->>'quantityOrdered')::int), 0) from jsonb_array_elements(o.data->'orderItems') item)
when o.source = 'ebay' then
  (select coalesce(sum(${ebayLineUnits}), 0) from jsonb_array_elements(o.data->'lineItems') ebay)
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
when o.source = 'ebay' then
  ${sql.raw(`greatest(0, ${ebayOrderLines} - ${ebayOrderRefund})`)}
else
  (select coalesce(sum(${lineRevenue}), 0) from jsonb_array_elements(o.data->'lines') line)
end`
const orderPriced = sql`case when o.source = 'amazon' then
  not exists (select 1 from jsonb_array_elements(o.data->'orderItems') item where not ${itemPriced})
else true end`
const orderCurrency = sql.raw(`coalesce(o.data #>> '{lines,0,originalUnitPriceSet,shopMoney,currencyCode}',
  jsonb_path_query_first(o.data, '$.orderItems[*].proceeds.breakdowns[*].subtotal.currencyCode') #>> '{}',
  o.data #>> '{lineItems,0,lineItemCost,currency}')`)

// A connected account, optionally narrowed to the Shopify orders shipped from one location. `excludedTags` leaves out
// Shopify orders with those tags (Settings), such as the copies Shopify's Amazon sales channel keeps of Amazon orders.
// `withoutAmazon` notes that Amazon is connected, so its orders come from Amazon.
// `marketplaceId` narrows Amazon to one marketplace's orders and charges.
type Account = {
  provider: Store
  externalId: string
  locationId?: string | null
  excludedTags?: readonly string[]
  withoutAmazon?: boolean
  marketplaceId?: string | null
}

// Shopify's Amazon sales channel copies each marketplace's orders into Shopify under a source such as "amazon-us".
export const amazonImport = sql.raw(`(coalesce(o.data->>'sourceName', '') like 'amazon%')`)

// An order counts for a location when any of its successful fulfillments shipped from there, so unfulfilled orders
// aren't counted for any location.
function shippedFrom(locationId: string | null | undefined) {
  return locationId
    ? sql` and exists (select 1 from jsonb_array_elements(o.data->'fulfillments') f
        where f->>'status' = 'SUCCESS' and f->'location'->>'id' = ${locationId})`
    : sql``
}

function accountFilter(accounts: Account[]) {
  return sql`(${sql.join(
    accounts.map(
      (account) =>
        sql`(o.source = ${account.provider} and o."externalAccountId" = ${account.externalId}${shippedFrom(account.locationId)}${account.excludedTags?.length ? sql` and not ${taggedWith(sql.raw("o.data"), account.excludedTags)}` : sql``}${account.marketplaceId ? sql` and o.data->'salesChannel'->>'marketplaceId' = ${account.marketplaceId}` : sql``})`
    ),
    sql` or `
  )}) and ${countedOrder(sql`o.data`)}`
}

// A row of a query that groups by sales_orders.source.
type SourceRow = { source: Store } & Record<string, unknown>

function rows(result: unknown) {
  return (result as { rows: Record<string, unknown>[] }).rows
}

const count = (value: unknown) => (value === null || value === undefined ? 0 : Number(value))

// The currency the Overview reports in: the Shopify store's, or US dollars without Shopify sales. Amounts in other
// currencies are converted at each day's rate (see syncExchangeRates).
export async function reportingCurrency(orgId: string) {
  const result = await db().execute(sql`
    select o.data #>> '{lines,0,originalUnitPriceSet,shopMoney,currencyCode}' as currency
    from sales_orders o
    where o."orgId" = ${orgId} and o.source = 'shopify'
      and o.data #>> '{lines,0,originalUnitPriceSet,shopMoney,currencyCode}' is not null
    order by o."orderedAt" desc
    limit 1`)
  const currency = rows(result)[0]?.currency
  return typeof currency === "string" ? currency : "USD"
}

export type DayRow = {
  source: Store
  date: string
  orders: number
  units: number
  // Orders with prices, and their sales in minor units.
  priced: number
  revenueMinor: number
  currency: string | null
}

// An order's sales converted to `currency` at the rate on the day it was placed, and whether it has prices that can be
// converted (an order in a currency without rates counts as unpriced).
function converted(currency: string) {
  const rate = sql`fx_rate(${orderCurrency}, ${currency}, o."orderedAt")`
  return {
    rate,
    revenue: sql`(case when ${orderRevenue} = 0 then 0 else ${orderRevenue} * ${rate} end)`,
    priced: sql`(${orderPriced} and (${rate} is not null or ${orderRevenue} = 0))`
  }
}

// Orders, units and sales per source and day in the store's time zone since `since`, for the connected accounts, with
// sales in `currency`.
export async function salesByDay(orgId: string, accounts: Account[], since: Date, timeZone: string, currency: string) {
  if (!accounts.length) {
    return []
  }
  const date = sql`to_char(o."orderedAt" at time zone ${timeZone}, 'YYYY-MM-DD')`
  const sales = converted(currency)
  const result = await db().execute<SourceRow>(sql`
    select o.source, ${date} as date, count(*) as orders, sum(${orderUnits}) as units,
      count(*) filter (where ${sales.priced}) as priced,
      round(coalesce(sum(${sales.revenue}) filter (where ${sales.priced}), 0) * 100) as revenue
    from sales_orders o
    where o."orgId" = ${orgId} and o."orderedAt" >= ${since} and (${accountFilter(accounts)})
    group by 1, 2`)
  return result.rows.map((row): DayRow => ({
    source: row.source,
    date: String(row.date),
    orders: count(row.orders),
    units: count(row.units),
    priced: count(row.priced),
    revenueMinor: count(row.revenue),
    currency: count(row.priced) > 0 ? currency : null
  }))
}

export type ItemRow = {
  source: Store
  // A Shopify variant ID (the bundle's, for a bundle sale), or an Amazon or eBay seller SKU.
  key: string
  period: "current" | "previous"
  units: number
  revenueMinor: number
  pricedUnits: number
  currency: string | null
}

// Units and sales per item over the current period and the one it's compared with, with sales in `currency`. A
// Shopify bundle counts once, under the bundle's variant, with its components' sales.
export async function salesByItem(
  orgId: string,
  accounts: Account[],
  periods: { current: Bounds; previous: Bounds | null },
  currency: string
) {
  if (!accounts.length) {
    return []
  }
  const within = (bounds: Bounds) => sql`(o."orderedAt" >= ${bounds.from} and o."orderedAt" < ${bounds.to})`
  const period = sql`case when ${within(periods.current)} then 'current' else 'previous' end`
  const scope = sql`o."orgId" = ${orgId} and (${within(periods.current)}${periods.previous ? sql` or ${within(periods.previous)}` : sql``})
    and (${accountFilter(accounts)})`
  const result = await db().execute<SourceRow>(sql`
    with raw as (
      select o."orderId" as "orderId", o.source, ${period} as period, o."orderedAt" as at,
        coalesce(line->'lineItemGroup'->>'variantId', line->'variant'->>'id') as key,
        coalesce(line->'lineItemGroup'->>'id', line->>'id') as grp,
        case when jsonb_typeof(line->'lineItemGroup') = 'object' then (line->'lineItemGroup'->>'quantity')::int
          else (line->>'currentQuantity')::int end as units,
        ${lineRevenue} as revenue, ${orderPriced} as priced,
        line->'originalUnitPriceSet'->'shopMoney'->>'currencyCode' as currency
      from sales_orders o, jsonb_array_elements(o.data->'lines') line
      where o.source = 'shopify' and ${scope}
      union all
      select o."orderId", o.source, ${period}, o."orderedAt", item->'product'->>'sellerSku', item->>'orderItemId',
        (item->>'quantityOrdered')::int, ${itemRevenue}, ${orderPriced},
        jsonb_path_query_first(item, '$.proceeds.breakdowns[*].subtotal.currencyCode') #>> '{}'
      from sales_orders o, jsonb_array_elements(o.data->'orderItems') item
      where o.source = 'amazon' and ${scope}
      union all
      select o."orderId", o.source, ${period}, o."orderedAt", nullif(trim(ebay->>'sku'), ''), ebay->>'lineItemId',
        ${sql.raw(ebayLineUnits)}, ${ebayLineRevenue}, ${orderPriced}, ebay->'lineItemCost'->>'currency'
      from sales_orders o, jsonb_array_elements(o.data->'lineItems') ebay
      where o.source = 'ebay' and ${scope}
    ), lines as (
      select raw.*, fx_rate(raw.currency, ${currency}, raw.at) as rate from raw
    ), grouped as (
      -- An item sold for nothing needs no rate.
      select "orderId", source, period, key, grp, max(units) as units,
        sum(case when revenue = 0 then 0 else revenue * rate end) as revenue,
        bool_and(priced and (rate is not null or revenue = 0)) as priced
      from lines where key is not null
      group by "orderId", source, period, key, grp
    )
    select source, period, key, sum(units) as units,
      round(coalesce(sum(revenue) filter (where priced), 0) * 100) as revenue,
      coalesce(sum(units) filter (where priced), 0) as "pricedUnits"
    from grouped
    group by source, period, key`)
  return result.rows.map((row): ItemRow => ({
    source: row.source,
    key: String(row.key),
    period: row.period === "current" ? "current" : "previous",
    units: count(row.units),
    revenueMinor: count(row.revenue),
    pricedUnits: count(row.pricedUnits),
    currency: count(row.pricedUnits) > 0 ? currency : null
  }))
}

// Shopify customers, from the orders copied with a customer ID (guest orders have none), in `currency`:
// - in the period: the customers who ordered, and how many of them had ordered before it;
// - over the year up to the period's end: customers, their orders and sales (for sales per customer, orders per
//   customer and the share who ordered more than once).
export async function shopifyCustomers(orgId: string, account: Account, period: Bounds, currency: string) {
  const yearStart = new Date(period.to.getTime() - 365 * 86400000)
  const sales = converted(currency)
  const result = await db().execute(sql`
    with orders as (
      select o.data->>'customerId' as customer, o."orderedAt" as at,
        case when ${sales.priced} then ${sales.revenue} end as revenue
      from sales_orders o
      where o."orgId" = ${orgId} and (${accountFilter([account])}) and o."orderedAt" < ${period.to}
        and o.data->>'customerId' is not null
    ), people as (
      select customer,
        count(*) filter (where at >= ${yearStart}) as "yearOrders",
        sum(revenue) filter (where at >= ${yearStart}) as "yearRevenue",
        bool_or(at >= ${period.from}) as "inPeriod",
        bool_or(at < ${period.from}) as "orderedBefore"
      from orders group by customer
    )
    select count(*) filter (where "inPeriod") as customers,
      count(*) filter (where "inPeriod" and "orderedBefore") as returning,
      count(*) filter (where "yearOrders" > 0) as "yearCustomers",
      count(*) filter (where "yearOrders" > 1) as "repeatCustomers",
      coalesce(sum("yearOrders"), 0) as "yearOrders",
      round(coalesce(sum("yearRevenue"), 0) * 100) as "yearRevenue"
    from people`)
  const row = rows(result)[0] ?? {}
  return {
    customers: count(row.customers),
    returning: count(row.returning),
    yearCustomers: count(row.yearCustomers),
    repeatCustomers: count(row.repeatCustomers),
    yearOrders: count(row.yearOrders),
    yearRevenueMinor: count(row.yearRevenue),
    currency
  }
}

// The Amazon marketplaces with orders stored since `since`, in the order amazonMarketplaces lists them.
export async function storedMarketplaces(orgId: string, account: string, since: Date) {
  const result = await db().execute(sql`
    select distinct o.data->'salesChannel'->>'marketplaceId' as id from sales_orders o
    where o."orgId" = ${orgId} and o.source = 'amazon' and o."externalAccountId" = ${account} and o."orderedAt" >= ${since}`)
  const ids = new Set(rows(result).map((row) => String(row.id)))
  return amazonMarketplaces.filter((marketplace) => ids.has(marketplace.id))
}

export type OrderFees = { orderId: string; revenueMinor: number | null; feesMinor: number | null }

// Amazon's posted fees on an order (null until Amazon posts its payment, usually within two days of shipping).
// The fees on an order's payment. Refunds and other charges are counted by when they're posted (see platformCharges).
// A release of a deferred payment repeats that payment's fees, so releases are left out.
const amazonOrderFee = sql`(select sum(t."feesMinor") from amazon_transactions t
  where t."orgId" = o."orgId" and t."externalAccountId" = o."externalAccountId" and t."orderId" = o."orderId"
    and t.type = 'Shipment' and ${countedAmazonTransaction(sql.identifier("t"))})`
// eBay's fees on an order, as eBay reports them with the order. This and shopifyOrderFee repeat in SQL what
// summarizeSalesOrder counts for the order list (minorUnits, and shopifyOrderFees in @repo/copacker-marketplaces/sales);
// change them together.
const ebayOrderFee = sql.raw(`round((o.data->'totalMarketplaceFee'->>'value')::numeric * 100)`)
// Shopify Payments' fees on an order, with their tax, from its successful payments.
const shopifyOrderFee = sql.raw(`
  (select coalesce(sum(round(((fee->'amount'->>'amount')::numeric + (fee->'taxAmount'->>'amount')::numeric) * 100)), 0)
    from jsonb_array_elements(o.data->'transactions') payment, jsonb_array_elements(payment->'fees') fee
    where payment->>'status' = 'SUCCESS')`)

// Each order from one account in a period, with its sales (null without prices) and the platform's fees on it, in
// `currency`. The fees are converted at the same rate as the order's sales.
export async function orderFees(orgId: string, account: Account, from: Date, to: Date, currency: string) {
  const fees: Record<Store, typeof amazonOrderFee> = {
    amazon: amazonOrderFee,
    shopify: shopifyOrderFee,
    ebay: ebayOrderFee
  }
  const fee = fees[account.provider]
  const sales = converted(currency)
  const result = await db().execute(sql`
    select o."orderId" as "orderId",
      case when ${sales.priced} then round(${sales.revenue} * 100) end as revenue,
      case when ${fee} = 0 then 0 else round(${fee} * ${sales.rate}) end as fees
    from sales_orders o
    where o."orgId" = ${orgId} and (${accountFilter([account])})
      and o."orderedAt" >= ${from} and o."orderedAt" < ${to}`)
  return rows(result).map((row): OrderFees => ({
    orderId: String(row.orderId),
    revenueMinor: row.revenue === null || row.revenue === undefined ? null : Number(row.revenue),
    feesMinor: row.fees === null || row.fees === undefined ? null : Number(row.fees)
  }))
}

// A platform's fees on a period's orders. Orders whose fees aren't known yet (Amazon posts them after shipping) are
// estimated at the rate of the posted ones; the count is reported so the page can say some fees are estimated.
export function platformFees(list: OrderFees[]) {
  const posted = list.filter((order) => order.feesMinor !== null && order.revenueMinor !== null)
  const postedRevenue = posted.reduce((sum, order) => sum + order.revenueMinor!, 0)
  const postedFees = posted.reduce((sum, order) => sum + order.feesMinor!, 0)
  const waiting = list.filter((order) => order.feesMinor === null && order.revenueMinor !== null)
  const rate = postedRevenue > 0 ? postedFees / postedRevenue : null
  const estimated = rate === null ? 0 : Math.round(waiting.reduce((sum, order) => sum + order.revenueMinor!, 0) * rate)
  return {
    feesMinor: postedFees + estimated,
    estimatedOrders: rate === null ? 0 : waiting.length,
    revenueMinor: list.reduce((sum, order) => sum + (order.revenueMinor ?? 0), 0)
  }
}

export type SourceDay = { orders: number; units: number; revenueMinor: number; unpriced: number }
export type DailySales = { date: string } & Record<Store, SourceDay | null>

// When a range of days starts and ends (the day after its last) in the store's time zone.
export type Bounds = { from: Date; to: Date }
export function rangeBounds(range: DayRange, timeZone: string): Bounds {
  return { from: zonedStart(range.from, timeZone), to: zonedStart(addDays(range.to, 1), timeZone) }
}

// One row per day of a range in the store's time zone, oldest first. A source's day is null when its stored orders
// don't cover it, so charts show a gap instead of a false zero. Today counts as covered up to the last sync.
export function dailySales(
  list: DayRow[],
  coverage: Partial<Record<Store, { from: Date; to: Date }>>,
  range: DayRange,
  timeZone: string,
  now: Date = new Date()
): DailySales[] {
  const byKey = new Map(list.map((row) => [`${row.source}:${row.date}`, row]))
  const series: DailySales[] = []
  for (let index = 0; index < rangeDays(range); index++) {
    const date = addDays(range.from, index)
    const start = zonedStart(date, timeZone).getTime()
    const cell = (source: Store): SourceDay | null => {
      const covered = coverage[source]
      // A day counts up to the last sync, so a sync that stops minutes before midnight doesn't leave that day out.
      if (!covered || covered.from.getTime() > start || covered.to.getTime() <= start || start > now.getTime()) {
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
    series.push({ date, shopify: cell("shopify"), amazon: cell("amazon"), ebay: cell("ebay") })
  }
  return series
}

type Totals = { orders: number; units: number; revenueMinor: number; unpriced: number }
export type PeriodTotal = Totals & { previous: Totals | null }

// Orders, units and sales over a period, and over the one it's compared with when every counted source covers both.
export function periodTotal(current: DailySales[], previous: DailySales[] | null, sources: Store[]): PeriodTotal {
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
  const now = sum(current)
  const before = previous ? sum(previous) : null
  return {
    ...now.totals,
    previous: before?.complete && now.complete && sources.length ? before.totals : null
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

// Looks up catalog details by Shopify variant, or by Amazon or eBay seller SKU. A SKU matches a variant only when
// exactly one variant carries it.
// `markups` are landed markups by variant (freight, duty and charges as a share of the supplier's price); a unit's cost
// includes its markup when one is known.
export function catalogIndex(catalog: readonly CatalogRow[], markups: ReadonlyMap<string, number> = new Map()) {
  const byVariant = new Map(catalog.map((row) => [row.variantId, row]))
  const bySku = new Map<string, CatalogRow | null>()
  for (const row of catalog) {
    if (row.buyerSku) {
      bySku.set(row.buyerSku, bySku.has(row.buyerSku) ? null : row)
    }
  }
  const variantFor = (source: Store, key: string) =>
    source === "shopify" ? (byVariant.get(key) ?? null) : (bySku.get(key) ?? null)
  // A unit's landed cost: its own, or for a bundle the sum of its components' costs, each with its landed markup (a
  // component without one takes the bundle's). Null when any cost is missing.
  const unitCost = (row: CatalogRow | null, fallbackMarkup = 0): { minor: number; currency: string } | null => {
    if (!row) {
      return null
    }
    const markup = markups.get(row.variantId) ?? fallbackMarkup
    if (row.bundle) {
      const components = row.bundle.components
      if (!components?.length) {
        return null
      }
      let minor = 0,
        currency: string | null = null
      for (const component of components) {
        const part = unitCost(byVariant.get(component.variantId) ?? null, markup)
        if (!part || (currency && part.currency !== currency)) {
          return null
        }
        currency = part.currency
        minor += part.minor * component.quantity
      }
      return currency ? { minor, currency } : null
    }
    return row.unitCostMinor !== null && row.unitCostMinor !== undefined && row.costCurrency
      ? { minor: Math.round(row.unitCostMinor * (1 + markup)), currency: row.costCurrency }
      : null
  }
  return { byVariant, variantFor, unitCost }
}

// Gross profit over the current period: sales less the cost of the units sold and each platform's fees (Amazon's
// fees, Shopify Payments' processing fees, eBay's fees). Only items with a unit cost in the sales currency count; the sales left
// out are reported so the page can say so.
export function grossProfit(
  items: ItemRow[],
  index: ReturnType<typeof catalogIndex>,
  fees: Partial<Record<Store, { feesMinor: number; revenueMinor: number }>>,
  // Refunds and the platforms' other charges in the period (negative when a cost), taken off in full.
  charges: ChargeLine[] = [],
  // Amazon's inbound freight per unit: by seller SKU for the shipments whose contents are known, and spread over every
  // Amazon unit for the rest.
  amazonFreight: { perUnitMinor: number; bySku?: ReadonlyMap<string, number>; currency: string } | null = null,
  t: ServerText = serverTextInEnglish
) {
  const current = items.filter((item) => item.period === "current" && item.pricedUnits > 0 && item.currency)
  // Sales in more than one currency can't be added up; the currency most sales are in is used.
  const byCurrency = new Map<string, number>()
  for (const item of current) {
    byCurrency.set(item.currency!, (byCurrency.get(item.currency!) ?? 0) + item.revenueMinor)
  }
  const currency = [...byCurrency].toSorted((a, b) => b[1] - a[1]).at(0)?.[0] ?? null
  let revenue = 0,
    costed = 0,
    cost = 0,
    freight = 0
  const costedBySource: Record<Store, number> = { shopify: 0, amazon: 0, ebay: 0 }
  for (const item of current) {
    if (item.currency !== currency) {
      continue
    }
    revenue += item.revenueMinor
    // Amazon resells returned units as used (Grade and Resell, under SKUs starting "amzn.gr."). Their cost and freight
    // were counted when they first sold.
    const resold = item.source === "amazon" && item.key.startsWith("amzn.gr.")
    const unit = resold ? { minor: 0, currency } : index.unitCost(index.variantFor(item.source, item.key))
    if (unit && unit.currency === currency) {
      costed += item.revenueMinor
      cost += unit.minor * item.pricedUnits
      costedBySource[item.source] += item.revenueMinor
      if (item.source === "amazon" && !resold && amazonFreight?.currency === currency) {
        freight += ((amazonFreight.bySku?.get(item.key) ?? 0) + amazonFreight.perUnitMinor) * item.pricedUnits
      }
    }
  }
  // Fees follow the sales they're charged on, so only the costed share of each platform's sales carries its fees.
  let feesMinor = 0
  for (const source of stores) {
    const platform = fees[source]
    if (platform && platform.revenueMinor > 0) {
      feesMinor += Math.round(platform.feesMinor * Math.min(1, costedBySource[source] / platform.revenueMinor))
    }
  }
  const counted = charges.filter((line) => line.currency === currency)
  if (freight > 0 && currency) {
    counted.push({
      key: "amazon-freight",
      label: t("charges.amazonFreight"),
      minor: -Math.round(freight),
      currency
    })
  }
  const chargesMinor = counted.reduce((sum, line) => sum + line.minor, 0)
  const profit = costed - cost - feesMinor + chargesMinor
  return {
    currency,
    revenueMinor: revenue,
    costedRevenueMinor: costed,
    costMinor: cost,
    feesMinor,
    charges: counted,
    chargesMinor,
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
export function movers(
  items: ItemRow[],
  index: ReturnType<typeof catalogIndex>,
  sources: Store[],
  t: ServerText = serverTextInEnglish
) {
  const byItem = new Map<string, Mover>()
  for (const item of items) {
    if (!sources.includes(item.source)) {
      continue
    }
    const row = index.variantFor(item.source, item.key)
    const id = row?.variantId ?? `${item.source}:${item.key}`
    const entry = byItem.get(id) ?? {
      id,
      product: row?.productTitle ?? (item.source === "shopify" ? t("unknownProduct") : item.key),
      variant: variantName(row?.variantTitle),
      sku: row?.buyerSku ?? (item.source === "shopify" ? null : item.key),
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
  return (source: Store, variantId: string) => {
    const entry = totals.get(`${source}:${variantId}`)
    return entry && entry.units > 0
      ? { minor: Math.round(entry.revenue / entry.units), currency: entry.currency }
      : null
  }
}

// Shopify copies of orders from Amazon marketplaces Copacker doesn't read (outside the US, Canada, Mexico and Brazil),
// in a period. They're left out once Amazon is connected, so the page says how many.
export async function otherMarketplaceOrders(orgId: string, account: string, from: Date, to: Date) {
  const result = await db().execute(sql`
    select count(*) as orders from sales_orders o
    where o."orgId" = ${orgId} and o.source = 'shopify' and o."externalAccountId" = ${account}
      and o."orderedAt" >= ${from} and o."orderedAt" < ${to} and ${amazonImport}
      and coalesce(o.data->>'sourceName', '') not in ('amazon', 'amazon-us', 'amazon-ca', 'amazon-mx', 'amazon-br')`)
  return count(rows(result)[0]?.orders)
}

export type ChargeLine = { key: string; label: string; minor: number; currency: string }

// Amazon transactions that move money between the seller and Amazon rather than cost or earn anything.
const amazonCashTypes = [
  "Shipment",
  "Refund",
  "Disbursement",
  "InitiateDisbursement",
  "DisbursementFailureAfterSuccess",
  "Transfer",
  "Reserve",
  "DebtRecovery",
  "DebtPayment"
]

// Payouts, reserves and debt payments that Amazon records under other types, such as Adjustment.
const amazonCashDescriptions = [
  "Disbursement",
  "DisbursementFailureAfterSuccess",
  "InitiateDisbursement",
  "Reserve",
  "DebtPayment"
]
// What the platforms charged or credited in a period beyond each order's own fees, by when it was posted: Amazon
// refunds, ads and account charges (storage, placement, adjustments, less reimbursements), and Shopify Payments'
// shipping labels, the Shopify bill paid from payouts, dispute fees, and the duties and import taxes it collects on
// international orders. Negative amounts are costs, converted to `currency` at the rate on the day each was posted.
export async function platformCharges(
  orgId: string,
  accounts: Account[],
  from: Date,
  to: Date,
  currency: string
): Promise<ChargeLine[]> {
  const t = await serverText()
  const lines: ChargeLine[] = []
  for (const account of accounts) {
    if (account.provider === "amazon") {
      const advertising = await adsCharge(
        orgId,
        account.externalId,
        account.marketplaceId ?? undefined,
        from,
        to,
        currency
      )
      const result = await db().execute(sql`
        select case when type = 'Refund' then 'amazon-refunds'
            when type = 'ProductAdsPayment' then 'amazon-ads'
            when type = 'Shipment' then 'amazon-mcf'
            else 'amazon-charges' end as key,
          round(sum("totalMinor" * fx_rate(currency, ${currency}, "postedAt"))) as minor
        from amazon_transactions
        where "orgId" = ${orgId} and "externalAccountId" = ${account.externalId}
          and "postedAt" >= ${from} and "postedAt" < ${to}
          ${account.marketplaceId ? sql`and data->'marketplaceDetails'->>'marketplaceId' = ${account.marketplaceId}` : sql``}
          -- Amazon's fee for fulfilling a Shopify order (multi-channel fulfillment) comes as a shipment described as a
          -- fulfillment fee, such as FBAShipmentInjectionFulfillmentFee, rather than an order payment.
          and (type = 'Refund' or (type = 'Shipment' and coalesce(data->>'description', '') like '%FulfillmentFee')
            or type not in (${sql.join(
              amazonCashTypes.map((type) => sql`${type}`),
              sql`, `
            )}))
          -- Amazon also records payouts and reserves as adjustments; they're told apart by their description. Inbound
          -- freight is spread over the units it carried instead (see amazonFreight).
          and coalesce(data->>'description', '') not in (${sql.join(
            amazonCashDescriptions.map((name) => sql`${name}`),
            sql`, `
          )}, ${freightDescriptions})
          and ${countedAmazonTransaction(sql.identifier("amazon_transactions"))}
        group by 1`)
      for (const row of rows(result)) {
        if (row.key === "amazon-ads" && advertising !== null) {
          continue
        }
        lines.push({
          key: String(row.key),
          label: t(amazonChargeLabels[String(row.key)] ?? "charges.amazon"),
          minor: count(row.minor),
          currency
        })
      }
      if (advertising !== null) {
        lines.push({ key: "amazon-ads", label: t("charges.amazonAds"), minor: advertising, currency })
      }
    } else if (account.provider === "shopify" && !account.locationId) {
      const result = await db().execute(sql`
        select case when type like 'SHIPPING%' then 'shopify-labels'
            when type like '%BILLING_DEBIT%' then 'shopify-bill'
            when type like 'IMPORT_TAX%' or type like 'CUSTOMS_DUTY%' or type like 'TAX_ADJUSTMENT%' then 'shopify-duties'
            else 'shopify-disputes' end as key,
          round(sum("netMinor" * fx_rate(currency, ${currency}, "processedAt"))) as minor
        from shopify_balance_transactions
        where "orgId" = ${orgId} and "externalAccountId" = ${account.externalId}
          and "processedAt" >= ${from} and "processedAt" < ${to}
          and (type like 'SHIPPING%' or type like '%BILLING_DEBIT%' or type like 'CHARGEBACK%' or type like 'DISPUTE%'
            or type like 'IMPORT_TAX%' or type like 'CUSTOMS_DUTY%' or type like 'TAX_ADJUSTMENT%')
        group by 1`)
      for (const row of rows(result)) {
        lines.push({
          key: String(row.key),
          label: t(shopifyChargeLabels[String(row.key)] ?? "charges.shopify"),
          minor: count(row.minor),
          currency
        })
      }
    }
  }
  return lines.filter((line) => line.minor !== 0)
}

const amazonChargeLabels: Record<string, ServerKey> = {
  "amazon-refunds": "charges.amazonRefunds",
  "amazon-ads": "charges.amazonAds",
  "amazon-charges": "charges.amazonAccount",
  "amazon-mcf": "charges.amazonMcf"
}
const shopifyChargeLabels: Record<string, ServerKey> = {
  "shopify-labels": "charges.shopifyLabels",
  "shopify-bill": "charges.shopifyBill",
  "shopify-disputes": "charges.shopifyDisputes",
  "shopify-duties": "charges.shopifyDuties"
}

// Amazon's inbound freight (freight service, placement and transport into its warehouses) posted over a stretch, in
// `currency`, as a cost per unit: each shipment's freight shared by the units it carried, by seller SKU. Freight for
// shipments sent from a PO (in `linked`) is left out, since it's part of that PO's landed costs. What can't be traced
// to a shipment's contents is spread over the Amazon units sold in the stretch.
export async function amazonFreight(
  orgId: string,
  account: string,
  range: { from: Date; to: Date },
  currency: string,
  unitsSold: number,
  linked: ReadonlySet<string> = new Set()
) {
  const [charges, shipments] = await Promise.all([
    db().execute(sql`
      select "orderId" as reference, -sum("totalMinor" * fx_rate(currency, ${currency}, "postedAt")) as freight
      from amazon_transactions
      where "orgId" = ${orgId} and "externalAccountId" = ${account}
        and "postedAt" >= ${range.from} and "postedAt" < ${range.to}
        and data->>'description' in (${freightDescriptions})
      group by 1`),
    db().execute(sql`
      select "shipmentId", units from amazon_inbound_shipments
      where "orgId" = ${orgId} and "externalAccountId" = ${account}`)
  ])
  const list = rows(charges)
    .map((row) => ({ reference: (row.reference as string | null) ?? null, freightMinor: count(row.freight) }))
    .filter((charge) => !charge.reference || !linked.has(charge.reference))
  const contents = new Map(
    rows(shipments).map((row) => [String(row.shipmentId), (row.units as Record<string, number> | null) ?? null])
  )
  const { perUnit, unallocatedMinor } = freightPerSku(list, contents)
  const freightMinor = list.reduce((sum, charge) => sum + charge.freightMinor, 0)
  if (freightMinor <= 0) {
    return null
  }
  return {
    currency,
    freightMinor,
    bySku: perUnit,
    perUnitMinor: unitsSold > 0 && unallocatedMinor > 0 ? unallocatedMinor / unitsSold : 0
  }
}
