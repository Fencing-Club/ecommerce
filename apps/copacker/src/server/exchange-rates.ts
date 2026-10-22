import { sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { exchangeRates } from "@/db/schema"
import { providerRequest } from "./provider-request"

// The European Central Bank's daily reference rates, through Frankfurter (free, no key). Published on working days.
const ratesUrl = "https://api.frankfurter.dev/v1"
const day = 86400000
// Rates are kept a little further back than the sales history, so the oldest orders convert too.
const historyDays = 400

const ratesResponse = z.object({
  rates: z.record(z.iso.date(), z.record(z.string().length(3), z.number().positive()))
})

// Copies the daily rates for the currencies the workspace's sales and charges are in, from the day after the latest
// stored rate (or 400 days back) to today. Rates are shared, so a currency another workspace already copied only reads
// what's new. A currency the bank doesn't publish is left without rates, and its amounts aren't converted.
export async function syncExchangeRates(orgId: string, now = new Date(), fetcher: typeof fetch = fetch) {
  const result = await db().execute(sql`
    select currency from (
      select distinct currency from amazon_transactions where "orgId" = ${orgId}
      union select distinct currency from amazon_ads_days where "orgId" = ${orgId}
      union select distinct currency from shopify_balance_transactions where "orgId" = ${orgId}
      union select distinct currency from monthly_costs where "orgId" = ${orgId}
      union select distinct coalesce(o.data #>> '{lines,0,originalUnitPriceSet,shopMoney,currencyCode}',
        jsonb_path_query_first(o.data, '$.orderItems[*].proceeds.breakdowns[*].subtotal.currencyCode') #>> '{}',
        o.data #>> '{lineItems,0,lineItemCost,currency}')
        from sales_orders o where o."orgId" = ${orgId} and o."orderedAt" >= ${new Date(now.getTime() - 30 * day)}
    ) currencies where currency is not null and currency <> 'USD'`)
  const wanted = (result as unknown as { rows: { currency: string }[] }).rows.map((row) => row.currency)
  if (!wanted.length) {
    return
  }
  const known = await providerRequest(
    "Frankfurter",
    `${ratesUrl}/currencies`,
    { timeoutMs: 30000, transport: fetcher },
    z.record(z.string(), z.string())
  )
  const currencies = wanted.filter((currency) => currency in known).toSorted()
  if (!currencies.length) {
    return
  }
  const latest = await db().execute(sql`
    select currency, max(day)::text as latest from exchange_rates
    where currency in (${sql.join(
      currencies.map((currency) => sql`${currency}`),
      sql`, `
    )})
    group by currency`)
  const latestBy = new Map(
    (latest as unknown as { rows: { currency: string; latest: string }[] }).rows.map((row) => [
      row.currency,
      row.latest
    ])
  )
  // A currency with no rates yet is read from the start; otherwise from the day after the oldest latest rate.
  const stored = currencies.every((currency) => latestBy.has(currency))
    ? currencies.map((currency) => latestBy.get(currency)!).toSorted()[0]!
    : null
  const today = now.toISOString().slice(0, 10)
  const from = stored
    ? new Date(Date.parse(stored) + day).toISOString().slice(0, 10)
    : new Date(now.getTime() - historyDays * day).toISOString().slice(0, 10)
  if (from > today) {
    return
  }
  const { rates } = await providerRequest(
    "Frankfurter",
    `${ratesUrl}/${from}..${today}?base=USD&symbols=${currencies.join(",")}`,
    { timeoutMs: 30000, transport: fetcher },
    ratesResponse
  )
  const values = Object.entries(rates).flatMap(([date, byCurrency]) =>
    Object.entries(byCurrency).map(([currency, rate]) => ({ currency, day: date, perUsd: String(rate) }))
  )
  for (let index = 0; index < values.length; index += 500) {
    await db()
      .insert(exchangeRates)
      .values(values.slice(index, index + 500))
      .onConflictDoUpdate({
        target: [exchangeRates.currency, exchangeRates.day],
        set: { perUsd: sql`excluded."perUsd"` }
      })
  }
}
