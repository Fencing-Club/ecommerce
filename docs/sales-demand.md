# Sales demand integration

## Manual API

POST `/api/inventory/demand` requires a buyer session and same-origin Origin header. The server chooses the connected account; clients cannot supply an organization, seller or shop ID.

```json
{
  "source": "shopify",
  "window": {
    "from": "2026-07-31T00:00:00.000Z",
    "to": "2026-09-25T00:00:00.000Z"
  }
}
```

Source is shopify or amazon (US). Use an exclusive end at least two minutes before now. Maximum duration is 730 days. Shopify requires read_all_orders for a start older than 60 days; the normal 56-day report needs read_orders and existing product/location access. OAuth now requests read_orders, but existing grants change only after reconnection.

The response contains source, externalAccountId, window, observedAt, basis, quantityUnit, collectionComplete, attributionComplete, rows and gaps. Shopify also returns excludedFulfilledUnits.

Rows contain variantId, buyerSku, locationId, pool and fulfilledUnits. Pools are shopify, fba and fbm_unassigned. Join Amazon seller SKU to Shopify only through an exact, unambiguous product mapping with verified pack units. Never match by title.

This is a manual direct read, not scheduled syncing or customer-order ingestion. No sales data is persisted. Retain the response while adjusting report settings rather than refetching for every change. Limits are five minutes, 2,000 requests, 10,000 orders and 32 MB. Pagination includes Shopify order lines and fulfillment lines. Failed, duplicate or truncated collections return no partial report. Provider throttles fail safely; Amazon's long order-search rate window is not blindly retried. Larger stores may require shorter windows or a future durable collection job.

Responses are private/no-store. Invalid input is 400, supplier/invalid-origin requests 403, unsupported history/grants or changed accounts 409, and other provider failures 503. Account identity is checked around every provider read and before returning.

## Measurement and attribution

The basis is gross_fulfilled_units_for_orders_created_in_window. This is an order-created cohort, not units shipped during the window, revenue or net units after returns. Divide by actual window duration to calculate observed units/day. A refund does not prove returned stock is sellable; inventory receipts account for restored stock. No opening-stock history is inferred, so this does not provide a sell-through percentage.

- Shopify test/cancelled orders are excluded. Successful fulfillments use actual location IDs. Native web, pos and shopify_draft_order sources are recognized. Other integration/app sources, including Amazon imports, remain channel_unmapped rather than guessed local demand.
- Saved buyer/store inventory_location_mappings classify merchant, amazon_mirror, excluded or unresolved locations. Only merchant locations create local demand; mirrors are excluded. Missing classifications are gaps.
- Unfulfilled Shopify quantities have no proven warehouse in this reader and remain unfulfilled gaps. Refunded fulfilled units remain gross demand.
- Amazon uses Orders API 2026-01-01 with FULFILLMENT data only, without buyer or recipient requests. Cancelled/unfulfillable orders are excluded. FBA and unassigned FBM remain separate. Missing quantities and unfulfilled demand remain explicit; non-Amazon channel orders are gaps.
- AWD is a replenishment pool, not a sales channel. AWD planning can use FBA demand but must never add it a second time. Stock pools stay separate.

Gaps contain orderId, nullable variantId/buyerSku, reason and nullable units. Reasons identify unknown channel/location/product/quantity/fulfillment or unfulfilled demand. A missing row is not verified zero when a matching gap exists. A gap without usable product identity can affect the entire source. Display known rows as observed fulfilled demand with coverage warnings; do not silently discard gaps when generating recommendations. Explicit order/product reconciliation is required before assigning FBM or adding imported Amazon orders to local demand.

## Evidence and remaining acceptance

2026-09-25: Shopify queries validate against the current Admin schema, artifact copacker-sales-attribution revision 2. A live rolling 56-day Amazon read returned 574 orders, 92 SKU rows and 649 FBA fulfilled units with no attribution gaps. It used the original buyer workspace's seller connection, not the separate Gmail buyer workspace. No provider writes, shipment creation or supplier contact occurred.

Both Shopify connections lack order-read scope. Live Shopify verification requires reconnection after deployment and merchant/mirror location classifications. Another agent owns the restock UI, settings and draft batches.

Remaining coverage: explicit configuration for additional sales apps, Shopify fulfillment-order allocation for pending units, FBM warehouse reconciliation, non-Amazon MCF demand and durable collection above current request budgets. These are gaps, not zero demand.

## References

- [Shopify order history](https://shopify.dev/docs/api/admin-graphql/latest/queries/orders)
- [Shopify fulfillment location and lines](https://shopify.dev/docs/api/admin-graphql/2026-07/queries/fulfillment)
- [Amazon Orders model](https://github.com/amzn/selling-partner-api-models/blob/main/models/orders-api-model/orders_2026-01-01.json)
