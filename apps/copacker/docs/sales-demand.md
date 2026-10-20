# Sales demand integration

## Stored orders

Restock reads orders copied into `sales_orders`, not the providers. Settings > Integrations > Manage queues a `sales` worker job per source. The Orders page (`/sales`) shows imported orders and sync status. The first sync copies the last 729 days (60 for Shopify without read_all_orders) in 14-day periods; later syncs copy from 30 days before the stored end, so late fulfillments and cancellations are picked up. Each period replaces the stored orders created in it, in one transaction, so orders the source drops (cancelled or test) disappear. `sales_syncs` records the unbroken stored period; restock's sales period ends at that period's end and is refused if it would reach further back than the stored orders. Changing the connected account starts over. Besides the Sync button, the worker syncs every connected source daily at 07:00 UTC (`reconcile.ts`), and Shopify order webhooks start a sync as orders change.

Orders carry prices: Shopify lines their unit price and discount allocations (`originalUnitPriceSet`,
`discountAllocations`), Amazon items their proceeds (`includedData=FULFILLMENT,PROCEEDS`). Shopify payments include
`transactions`, with Shopify Payments' processing fees and their tax; other gateways report no fees.
Stored orders use the current contract, without historical shape versions or tag backfills. When a Shopify store
newly grants `read_customers`, its next sync rereads the full allowed history. `sales_syncs.customersIncluded` becomes
true only after that sync completes, so customer metrics stay pending until the customer IDs are available.

The Amazon sync also copies posted transactions from the Finances API (`/finances/2024-06-19/transactions`, 14-day
periods, the same refresh rule as orders) into `amazon_transactions`, each linked to its order ID. `feesMinor` counts
every fee or commission category in a transaction's breakdown once, positive when charged. A failure is recorded as
`feesErrorCode` without failing the order sync.

## Restock

The Amazon job also imports [physical FBA returns](amazon-returns.md), with independent monthly coverage in the sales
status API. These receipts do not subtract from gross demand or financial totals.
It also imports [FBA reimbursement detail](amazon-reimbursements.md), keeping cash/inventory quantities, signed amounts
and reversal references separate from the financial ledger until reconciled.
The [detailed inventory ledger](amazon-inventory-movements.md) is also imported as separate movement evidence; it does
not change demand or the summary-ledger balances used for stockout days.

Missing connections and incomplete order history are expected availability states: Restock and Overview retain their actionable source messages without logging a read failure. Unexpected read failures are logged and shown with a retry message; unavailable demand never becomes zero sales.

The Restock page (`POST /api/restock/plan`) works per channel: Amazon as a whole, or one Shopify location counted in inventory. Amazon combines FBA fulfillable and AWD distributable stock, FBA and AWD inbound, open POs to Amazon destinations (the larger of Amazon's inbound and the POs, since a shipped PO appears in both), FBA and FBM sales, and the variation's Amazon stock target, kept in Copacker (0 means not stocked there). Which Amazon warehouse stock goes to is decided on the PO: each line to the `amazon` destination ships to FBA (the default) or AWD US ([Amazon inbound shipments](amazon-inbound.md)). Each variation's supplier is its product's supplier, else the one chosen for it in Copacker, the one it was last ordered from, or the one linked supplier whose active catalog holds its supplier SKU (kept in Copacker). The supplier's lead time (to the buyer's locations, or to Amazon) replaces the page default. Quantities cover the lead time at the sales period's rate plus the stock target, minus available and incoming stock, then rise to the minimum order and round up to whole cases. Suggestions are grouped by supplier; each group opens a new PO with the ticked lines and edited quantities. Restock never suggests moving the buyer's own stock to Amazon.

## Stockout days

A stockout day is a day customers couldn't buy the item in that channel, so its zero sales say nothing about demand. `stock_days` records sellable units per item per day. Amazon FBA comes from the inventory ledger report (GET_LEDGER_SUMMARY_VIEW_DATA, daily, country level), copied for 365 days by the Amazon order sync; a day inside the ledger period with no sellable row counts as zero. Every stock sync also records the lowest count seen that day, for FBA and each Shopify location; Shopify has no inventory history API, so its history starts when recording began. A day counts as a stockout when the count was zero or below and the item didn't sell that day: counts are end of day, and an Amazon listing keeps selling as FBM from the buyer's own stock while FBA is empty. Restock measures the sales rate over the days in stock, never fewer than 7, and shows the stockout days in each line's explanation. A ledger failure is recorded as `stockErrorCode` without failing the order sync.

## Manual API

`POST /api/inventory/demand` reads fulfilled demand straight from a provider for diagnostics; restock uses stored orders
(above), and the endpoint stores nothing. It needs a buyer session with the Orders page and a same-origin `Origin`
header. The server picks the connected account; clients never pass an organization, seller or shop ID.

```json
{
  "source": "shopify",
  "window": {
    "from": "2026-07-31T00:00:00.000Z",
    "to": "2026-09-25T00:00:00.000Z"
  }
}
```

`source` is `shopify` or `amazon` (US). The window’s exclusive end is at least two minutes before now, and it spans at
most 730 days. A Shopify start older than 60 days needs `read_all_orders`. The response has `source`,
`externalAccountId`, `window`, `observedAt`, `basis`, `quantityUnit`, `collectionComplete`, `attributionComplete`,
`rows` and `gaps` (and `excludedFulfilledUnits` for Shopify). Rows carry `variantId`, `buyerSku`, `locationId`, `pool`
(`shopify`, `fba` or `fbm_unassigned`) and `fulfilledUnits`.

A read is limited to five minutes, 2,000 requests, 10,000 orders and 32 MB, and returns no partial report. Responses are
private and `no-store`. Invalid input is 400, a supplier or another origin 403, missing history, grants or a changed
account 409, and other provider failures 503.

## Measurement and attribution

The basis is gross_fulfilled_units_for_orders_created_in_window. This is an order-created cohort, not units shipped during the window, revenue or net units after returns. Divide by actual window duration to calculate observed units/day. A refund does not prove returned stock is sellable; inventory receipts account for restored stock. No opening-stock history is inferred, so this does not provide a sell-through percentage.

- Shopify test/cancelled orders are excluded. Successful fulfillments use actual location IDs. Native web, pos and shopify_draft_order sources are recognized. Other integration/app sources, including Amazon imports, remain channel_unmapped rather than guessed local demand.
- Saved buyer/store inventory_location_mappings classify merchant, amazon_mirror, excluded or unresolved locations. Only merchant locations create local demand; mirrors are excluded. Missing classifications are gaps.
- Unfulfilled Shopify quantities have no proven warehouse in this reader and remain unfulfilled gaps. Refunded fulfilled units remain gross demand.
- Amazon uses Orders API 2026-01-01 with FULFILLMENT and PROCEEDS data, without buyer or recipient requests. Orders come from each North American marketplace the seller sells in (US, Canada, Mexico, Brazil): orders from the others are fulfilled from US FBA stock (remote fulfillment) or shipped by the seller, so they are US FBA or FBM demand like US orders. Cancelled/unfulfillable orders are excluded. FBA and unassigned FBM remain separate. Missing quantities and unfulfilled demand remain explicit; non-Amazon channel orders are gaps.
- AWD is a replenishment pool, not a sales channel. AWD planning can use FBA demand but must never add it a second time. Stock pools stay separate.

Gaps contain orderId, nullable variantId/buyerSku, sourceName, nullable locationId, reason and nullable units. Unmapped locations retain the actual source location ID, and unmapped channels retain the exact source name so the buyer can configure the missing mapping without guessing. A null location means the source did not prove an allocation, not the default warehouse. Reasons identify unknown channel/location/product/quantity/fulfillment or unfulfilled demand. A missing row is not verified zero when a matching gap exists. A gap without usable product identity can affect the entire source. Display known rows as observed fulfilled demand with coverage warnings; do not silently discard gaps when generating recommendations. Explicit order/product reconciliation is required before assigning FBM or adding imported Amazon orders to local demand.

## Bundles and multipacks

A multipack is a Shopify bundle (a variant that requires components), not a separate stocked SKU. The stock sync records each bundle's components and quantities. Pieces per sellable unit on a PO line come from those quantities (`piecesPerUnit`), not from the PO builder, and a bundle line must be a whole number of bundles.

Shopify orders expand a bundle into component lines, each with `lineItemGroup` naming the bundle variant bought; demand rows carry it as `bundleVariantId`. Amazon sells the multipack under the bundle variant's own SKU, so an Amazon row whose SKU matches exactly one Shopify bundle variant is a bundle sale. `bundleSales` combines both into, per variant, units sold alone, units sold inside bundles, and bundles sold. Restock uses it to split each variant's sales between units sold alone and inside bundles (`restock-plan.ts`).

Shopify’s order search quotes its timestamps (`created_at:>='…'`), since unquoted colons cut the value short.

Location classifications are the buyer's saved choice, otherwise automatic from the location's fulfillment service: the store's own locations are merchant, Shopify Collective is excluded, Amazon's fulfillment location is amazon_mirror, and other apps' locations are unresolved.

## Known gaps

Additional sales apps need explicit configuration. Shopify fulfillment-order allocation for pending units, FBM
warehouse reconciliation and non-Amazon MCF demand aren't read yet. These are gaps, not zero demand.

## References

- [Shopify order history](https://shopify.dev/docs/api/admin-graphql/latest/queries/orders)
- [Shopify fulfillment location and lines](https://shopify.dev/docs/api/admin-graphql/2026-07/queries/fulfillment)
- [Amazon Orders model](https://github.com/amzn/selling-partner-api-models/blob/main/models/orders-api-model/orders_2026-01-01.json)

## Confirmed Amazon orders awaiting shipment

Amazon responses additionally include confirmedUnfulfilled rows with buyerSku, pool (fba or fbm_unassigned) and units. Only UNSHIPPED and PARTIALLY_SHIPPED orders with explicit quantityUnfulfilled are included. Pending-payment, pending-availability and cancelled orders do not become confirmed demand. Missing quantities remain gaps; overlapping fulfilled plus unfulfilled quantities above the ordered amount are rejected.

These rows are separate from fulfilledUnits and its gross-fulfilled measurement basis. Consumers can show confirmed open demand without silently changing the sales-velocity definition. Do not add these units again as a stock deduction if the inventory source already reserves them. FBM is still not assigned to a Shopify warehouse. This extension does not resolve Shopify unfulfilled warehouse allocation.

## Availability and committed orders

Confirmed against Shopify inventory-state documentation and Amazon FBA inventory documentation: Shopify available already excludes committed inventory; FBA fulfillableQuantity is separate from reserved customer orders and other reserved states. Never subtract unfulfilled orders again from these values. Do not substitute physical on-hand or FBA totalQuantity for sellable availability. AWD uses availableDistributable, retaining reservedDistributable separately.

Restock uses these source values without another allocation deduction, keeping null availability and negative
Shopify availability. For example, 100 physical units with 20 committed and 80 available, against lead-time demand of
112, means buying 32, not 52.

Unfulfilled orders are therefore already accounted for in available stock. Including confirmed open orders in the historical demand series is a separate forecasting choice; do not confuse it with an extra stock deduction. Supplier PO incoming quantities are a third, separate state and must be reconciled once.

The Shopify sync also copies Shopify Payments balance transactions (`shopify_balance_transactions`: labels, the
Shopify bill paid from payouts, dispute fees; payouts hidden) with the same period and refresh rules, using the
`read_shopify_payments_payouts` permission. Without it, the sync records `feesErrorCode = "reconnect"` and the Overview
asks the buyer to reconnect Shopify.

[Storage and aged-inventory reports](amazon-storage-fees.md) are imported independently for twelve completed months.
Monthly estimates and assessed aged charges remain separate evidence; neither changes demand, stock or profit totals.

[Removal orders and shipments](amazon-removals.md) supply separate disposal, removal-fee and tracking evidence.
Their overlapping quantities never change summary stock, demand or profit during acquisition.

## Marketplace copies in Shopify

The default excluded Shopify tags are `Amazon` and `eBay` (case-insensitive). Tagged copies remain stored as source evidence but are excluded from Shopify order lists, reporting, demand and automatic inventory depletion. Native Amazon and eBay orders remain included. Settings can customize exclusions, including wildcard tags such as `eBay*` for integrations that use suffixed tags. The migration adds eBay only to workspaces whose exclusion list still exactly matches the original Amazon-only default; custom lists are preserved.

## Amazon Financial data card

The Amazon connection shows Orders, Inventory, and Financial data as matching compact cards, without expandable rows.
Financial data summarizes transaction-fee ingestion, returns, reimbursements, monthly and aged storage fees, and removal orders and shipments.
A failed report remains visible even when order ingestion succeeds; unavailable or missing reports do not count as
complete. Previously saved data is retained after failed refreshes.

The Financial data action uses the existing Amazon sales sync endpoint and worker, so it also refreshes orders.
Queued/running state and reconnect requirements are shared. Order-history progress is not displayed as financial
progress. The card summarizes report ingestion, not accounting reconciliation or profitability readiness.
