# Sales demand integration

## Stored orders

Restock reads orders copied into `sales_orders`, not the providers. The Orders page (`/sales`) queues a `sales` worker job per source. The first sync copies the last 365 days (60 for Shopify without read_all_orders) in 14-day periods; later syncs copy from 30 days before the stored end, so late fulfillments and cancellations are picked up. Each period replaces the stored orders created in it, in one transaction, so orders the source drops (cancelled or test) disappear. `sales_syncs` records the unbroken stored period; restock's sales period ends at that period's end and is refused if it would reach further back than the stored orders. Changing the connected account starts over. A background schedule will replace the manual Sync button.

## Restock

The Restock page (`POST /api/restock/plan`) works per channel: Amazon as a whole, or one Shopify location counted in inventory. Amazon combines FBA fulfillable and AWD distributable stock, FBA and AWD inbound, open POs to Amazon destinations (the larger of Amazon's inbound and the POs, since a shipped PO appears in both), FBA and FBM sales, and Shopify's Amazon stock target (0 means not stocked there). Which Amazon warehouse stock goes to is decided when shipping; POs can use the "amazon" destination, which ships to AWD USA until FBA inbound is supported. Each variation's supplier is the one it was last ordered from, else the one linked supplier whose active catalog holds its Shopify `custom.supplier_sku`. The supplier's lead time (to the buyer's locations, or to Amazon) replaces the page default. Quantities cover the lead time at the sales period's rate plus the stock target, minus available and incoming stock, then rise to the minimum order and round up to whole cases. Suggestions are grouped by supplier; each group opens a new PO with the ticked lines and edited quantities. Restock never suggests moving the buyer's own stock to Amazon.

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

This is a manual direct read for diagnostics; restock uses stored orders (above). This endpoint persists nothing. Retain the response while adjusting report settings rather than refetching for every change. Limits are five minutes, 2,000 requests, 10,000 orders and 32 MB. Pagination includes Shopify order lines and fulfillment lines. Failed, duplicate or truncated collections return no partial report. Provider throttles fail safely; Amazon's long order-search rate window is not blindly retried. Larger stores may require shorter windows or a future durable collection job.

Responses are private/no-store. Invalid input is 400, supplier/invalid-origin requests 403, unsupported history/grants or changed accounts 409, and other provider failures 503. Account identity is checked around every provider read and before returning.

## Measurement and attribution

The basis is gross_fulfilled_units_for_orders_created_in_window. This is an order-created cohort, not units shipped during the window, revenue or net units after returns. Divide by actual window duration to calculate observed units/day. A refund does not prove returned stock is sellable; inventory receipts account for restored stock. No opening-stock history is inferred, so this does not provide a sell-through percentage.

- Shopify test/cancelled orders are excluded. Successful fulfillments use actual location IDs. Native web, pos and shopify_draft_order sources are recognized. Other integration/app sources, including Amazon imports, remain channel_unmapped rather than guessed local demand.
- Saved buyer/store inventory_location_mappings classify merchant, amazon_mirror, excluded or unresolved locations. Only merchant locations create local demand; mirrors are excluded. Missing classifications are gaps.
- Unfulfilled Shopify quantities have no proven warehouse in this reader and remain unfulfilled gaps. Refunded fulfilled units remain gross demand.
- Amazon uses Orders API 2026-01-01 with FULFILLMENT data only, without buyer or recipient requests. Cancelled/unfulfillable orders are excluded. FBA and unassigned FBM remain separate. Missing quantities and unfulfilled demand remain explicit; non-Amazon channel orders are gaps.
- AWD is a replenishment pool, not a sales channel. AWD planning can use FBA demand but must never add it a second time. Stock pools stay separate.

Gaps contain orderId, nullable variantId/buyerSku, sourceName, nullable locationId, reason and nullable units. Unmapped locations retain the actual source location ID, and unmapped channels retain the exact source name so the buyer can configure the missing mapping without guessing. A null location means the source did not prove an allocation, not the default warehouse. Reasons identify unknown channel/location/product/quantity/fulfillment or unfulfilled demand. A missing row is not verified zero when a matching gap exists. A gap without usable product identity can affect the entire source. Display known rows as observed fulfilled demand with coverage warnings; do not silently discard gaps when generating recommendations. Explicit order/product reconciliation is required before assigning FBM or adding imported Amazon orders to local demand.

## Bundles and multipacks

A multipack is a Shopify bundle (a variant that requires components), not a separate stocked SKU. The stock sync records each bundle's components and quantities. Pieces per sellable unit on a PO line come from those quantities (`piecesPerUnit`); the PO builder no longer asks for them, and a bundle line must be a whole number of bundles.

Shopify orders expand a bundle into component lines, each with `lineItemGroup` naming the bundle variant bought; demand rows carry it as `bundleVariantId`. Amazon sells the multipack under the bundle variant's own SKU, so an Amazon row whose SKU matches exactly one Shopify bundle variant is a bundle sale. `bundleSales` combines both into, per variant, units sold alone, units sold inside bundles, and bundles sold. `POST /api/inventory/sales` with `{ "days": 28 | 56 }` reads every connected source and returns that summary; the Inventory page shows it under each product and variation. A 28-day Shopify read of about 360 orders took about two minutes on 2026-09-25.

Shopify's order search needs quoted timestamps (`created_at:>='…'`); unquoted, the colons cut the value short and Shopify returned orders outside the window.

Location classifications are the buyer's saved choice, otherwise automatic from the location's fulfillment service: the store's own locations are merchant, Shopify Collective is excluded, Amazon's fulfillment location is amazon_mirror, and other apps' locations are unresolved.

## Evidence and remaining acceptance

2026-09-25: Shopify queries validate against the current Admin schema, artifact copacker-sales-attribution revision 2. A live rolling 56-day Amazon read returned 574 orders, 92 SKU rows and 649 FBA fulfilled units with no attribution gaps. It used the original buyer workspace's seller connection, not the separate Gmail buyer workspace. No provider writes, shipment creation or supplier contact occurred.

The original Fencing Club buyer connection now has order-read access. A live 56-day read displayed variant sales and 913 uncounted units; these include unfulfilled orders, but the causes have not yet been reconciled. The sales response now separates gap units by reason so the next live read can distinguish unfulfilled demand from unmapped channels, locations or products. Another agent owns the restock UI, settings and draft batches.

Remaining coverage: explicit configuration for additional sales apps, Shopify fulfillment-order allocation for pending units, FBM warehouse reconciliation, non-Amazon MCF demand and durable collection above current request budgets. These are gaps, not zero demand.

## References

- [Shopify order history](https://shopify.dev/docs/api/admin-graphql/latest/queries/orders)
- [Shopify fulfillment location and lines](https://shopify.dev/docs/api/admin-graphql/2026-07/queries/fulfillment)
- [Amazon Orders model](https://github.com/amzn/selling-partner-api-models/blob/main/models/orders-api-model/orders_2026-01-01.json)

## Confirmed Amazon orders awaiting shipment

Amazon responses additionally include confirmedUnfulfilled rows with buyerSku, pool (fba or fbm_unassigned) and units. Only UNSHIPPED and PARTIALLY_SHIPPED orders with explicit quantityUnfulfilled are included. Pending-payment, pending-availability and cancelled orders do not become confirmed demand. Missing quantities remain gaps; overlapping fulfilled plus unfulfilled quantities above the ordered amount are rejected.

These rows are separate from fulfilledUnits and its gross-fulfilled measurement basis. Consumers can show confirmed open demand without silently changing the sales-velocity definition. Do not add these units again as a stock deduction if the inventory source already reserves them. FBM is still not assigned to a Shopify warehouse. This extension does not resolve Shopify unfulfilled warehouse allocation.

## Availability and committed orders

Confirmed against Shopify inventory-state documentation and Amazon FBA inventory documentation: Shopify available already excludes committed inventory; FBA fulfillableQuantity is separate from reserved customer orders and other reserved states. Never subtract unfulfilled orders again from these values. Do not substitute physical on-hand or FBA totalQuantity for sellable availability. AWD uses availableDistributable, retaining reservedDistributable separately.

The deterministic server helper restockAvailability in restock-availability.ts selects these source values without another allocation deduction. It preserves null availability and negative Shopify availability. Six regression cases verify this alongside the restock formula: 100 physical units, 20 committed and 80 available against lead-time demand of 112 means a purchase of 32, not 52. The other agent's report should call this adapter when composing source data; this helper does not itself wire the unfinished restock page.

Unfulfilled orders are therefore already accounted for in available stock. Including confirmed open orders in the historical demand series is a separate forecasting choice; do not confuse it with an extra stock deduction. Supplier PO incoming quantities are a third, separate state and must be reconciled once.
