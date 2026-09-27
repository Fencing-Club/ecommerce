import { type SQL, sql } from "drizzle-orm"

// Which stored orders count as sales, in one place for the Overview, the Orders page and anything else that adds orders
// up. `data` is the stored order's JSON column, such as sql`o.data` or the salesOrders table's data column.

// An Amazon replacement for another order (Amazon links it with REPLACEMENT_ORIGINAL_ID): sent free, so its sales are
// zero from the start.
export function amazonReplacement(data: SQL) {
  return sql`(coalesce(${data}->'associatedOrders', '[]'::jsonb) @> '[{"associationType": "REPLACEMENT_ORIGINAL_ID"}]')`
}

// Cancelled orders sold nothing. An Amazon order still pending (payment not confirmed) counts once Amazon has priced
// every item, so a partly priced one is never half counted.
export function countedOrder(data: SQL) {
  return sql`(coalesce(${data}->'fulfillment'->>'fulfillmentStatus', '') <> 'CANCELLED'
  and ${data}->>'cancelledAt' is null
  and not (coalesce(${data}->'fulfillment'->>'fulfillmentStatus', '') = 'PENDING' and not ${amazonReplacement(data)}
    and exists (select 1 from jsonb_array_elements(${data}->'orderItems') i
      where i->'proceeds'->'breakdowns' is null and (i->>'quantityOrdered')::int > 0)))`
}
