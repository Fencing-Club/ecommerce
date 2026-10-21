# Scopes and roles

Part of the [inventory sync spec](README.md). Every Shopify scope, Amazon role and eBay scope the two-way sync needs, by
feature and phase. "Have" means the app requests it today (`src/app/api/connections/[provider]/route.ts`,
`shopify.app.toml`, `packages/copacker-marketplaces/src/ebay.ts`).

Adding a scope or role means every connected account has to approve it again:

- **Record what was granted.** Copacker stores what each connection granted (`connections.scopes`, filled for Shopify
  today). Fill it for eBay too, and for Amazon record the roles the app had when the seller authorized.
- **Only the features that need a new grant wait for it.** A sync line whose scope is missing shows "Reconnect Shopify"
  (or eBay, or Amazon) on the Stock flow page and stays off until the reconnect. Everything else keeps working.

## Shopify

| Scope                                        | Status | Phase | Needed for                                                                                                                                                                                             |
| -------------------------------------------- | ------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `read_products`                              | Have   | 1     | Variants, SKUs, bundles, prices (the price source for marketplaces)                                                                                                                                    |
| `write_products`                             | Have   | 3     | Variant price writes when the Shopify store is a channel of a Copacker master                                                                                                                          |
| `read_inventory`                             | Have   | 1     | Inventory levels and quantity names                                                                                                                                                                    |
| `write_inventory`                            | Have   | 2     | `inventorySetQuantities` (Copacker master pushes), `inventoryAdjustQuantities` (marketplace sales, receipt reversals), `inventoryMoveQuantities` (B2B holds to and from `reserved`), unit cost (today)      |
| `read_locations`                             | Have   | 1     | Locations and fulfillment services, for location roles                                                                                                                                                 |
| `read_orders`                                | Have   | 1     | Shopify orders, as sales for restock, and as sales in the ledger when Shopify is a channel of a Copacker master                                                                                        |
| `read_all_orders`                            | Have   | 1     | Order history older than 60 days                                                                                                                                                                       |
| `read_fulfillments`                          | Have   | 3     | Fulfillment events to send tracking to marketplaces                                                                                                                                                    |
| `read_customers`                             | Have   | –     | Unchanged. No customer records are created for marketplace orders                                                                                                                                      |
| `read_shopify_payments_accounts`, `read_shopify_payments_payouts` | Have   | –     | Unchanged (Overview fees)                                                                                                                                                                              |
| `read_inventory_transfers`                   | New    | 2     | Reading Copacker's transfers and changes made to them in Shopify admin                                                                                                                                 |
| `write_inventory_transfers`                  | New    | 2     | Creating the transfer for a purchase order (Incoming), editing its lines, removing unshipped units on close                                                                                           |
| `read_inventory_shipments`                   | New    | 2     | Reading transfer shipments and their tracking                                                                                                                                                          |
| `write_inventory_shipments`                  | New    | 2     | `inventoryShipmentCreateInTransit` when a purchase order shipment ships, with tracking                                                                                                                 |
| `read_inventory_shipments_received_items`    | New    | 2     | Reading receipts made in Shopify admin                                                                                                                                                                 |
| `write_inventory_shipments_received_items`   | New    | 2     | `inventoryShipmentReceive`: accepted, rejected and canceled units                                                                                                                                      |
| `write_orders`                               | New    | 3     | `orderCreate` (marketplace and FBA orders), `orderCancel`, `refundCreate`, `orderUpdate`                                                                                                               |
| `read_order_edits`, `write_order_edits`      | New    | 3     | Partial cancellations (`orderEditBegin`, `orderEditSetQuantity`, `orderEditCommit`)                                                                                                                     |
| `read_returns`, `write_returns`              | New    | 3     | Returns opened on marketplaces (`returnCreate`, closing them)                                                                                                                                          |
| `read_merchant_managed_fulfillment_orders`, `write_merchant_managed_fulfillment_orders` | New    | 3     | Moving a copied order to the channel's location (`fulfillmentOrderMove`), fulfilling orders shipped on the marketplace (`fulfillmentCreate`)                                                            |
| `read_third_party_fulfillment_orders`        | New    | 3     | Only if copied orders can route to a 3PL location: reading their fulfillment orders to send tracking                                                                                                   |
| `write_fulfillments`                         | Later  | –     | Only for the deferred AWD location (a Copacker fulfillment service)                                                                                                                                    |
| `read_markets`                               | Later  | –     | Only if prices come from a market's price list rather than the variant                                                                                                                                 |
| Purchase order scopes                        | Later  | 4     | Not published yet; the Admin API 2026-07 has no purchase order object                                                                                                                                  |

Also needed:

- **Protected customer data.** Marketplace orders carry the buyer's name, shipping address and possibly phone. Creating
  them needs protected customer data access (level 2: name, address, phone) set up for the app in the Partner Dashboard.
- **API version.** Copacker's Shopify client is on 2026-07. The canceled receive action needs 2026-10, and inventory
  mutations need the `@idempotent` directive from 2026-04.
- **New webhook topics:** inventory transfer and shipment topics (verify their names), and returns. They need the read
  scopes above.

## Amazon

Selling Partner API access is by role: the app's developer profile holds the roles, and a seller's authorization grants
them. Adding a role means sellers authorize again, and restricted roles need Amazon's approval.

| Role                                        | Status | Phase | Needed for                                                                                                                                                                                                                                             |
| ------------------------------------------- | ------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Inventory and Order Tracking                | Have   | 2, 3  | Orders (`searchOrders`, `getOrder`) for FBM and FBA sales (today); `confirmShipment` to send tracking (Phase 3)                                                                                                                                        |
| Product Listing                             | Have   | 1–3   | Reading listings (today: ASIN and FNSKU); `searchListingsItems` and the `GET_MERCHANT_LISTINGS_ALL_DATA` report (Phase 1); `patchListingsItem` and `JSON_LISTINGS_FEED` for FBM quantities (Phase 2) and prices (Phase 3); listing notifications      |
| Amazon Fulfillment                          | Have   | 2     | FBA inventory (today); FBA inbound (today); received quantities (`getShipmentItemsByShipmentId`, `getShipments`)                                                                                                                                       |
| Amazon Warehousing and Distribution         | Have   | 2     | AWD inventory and inbound (today); received quantities (`getInboundShipment` with `skuQuantities=SHOW`)                                                                                                                                                |
| Finance and Accounting                      | Have   | 3     | Refund events (Finances API, already copied)                                                                                                                                                                                                           |
| Direct-to-Consumer Shipping (Restricted)    | New    | 3     | FBM shipping addresses and buyer details (`getOrder` or `searchOrders` with `includedData=BUYER,RECIPIENT`, Orders API 2026-01-01, no Restricted Data Token), so FBM orders can be shipped from Shopify                                              |

Also needed:

- **Restricted data rules.** The Direct-to-Consumer Shipping role comes with Amazon's Data Protection Policy (encryption,
  access control and a retention limit for PII) and an approval Amazon grants sparingly.
  - Copacker passes addresses to Shopify and stores none.
  - If the role is refused, FBM orders are copied without addresses and shipped from Seller Central
    ([marketplace orders](marketplace-orders.md)).
- **Notifications.** Add `LISTINGS_ITEM_STATUS_CHANGE` and `LISTINGS_ITEM_ISSUES_CHANGE` (Product Listing) to catch
  listings Amazon suppresses or rejects after a push. `ORDER_CHANGE` and `FBA_INVENTORY_AVAILABILITY_CHANGES` are
  subscribed today. There is no inbound shipment notification to subscribe to, so receipts are polled.
- **Returns reports** (FBA customer returns, FBM returns). Check which role each report needs; the Reports API lists
  several.
- **Region.** US only, as today: `sellingpartnerapi-na`, marketplace `ATVPDKIKX0DER`. Orders also come from CA, MX and
  BR today.

## eBay

eBay's REST APIs use OAuth scopes on the seller's user token. The Trading and Post-Order APIs take the same user token
but don't check scopes. Copacker has one production keyset, and the scopes it requests must be enabled on it.

| Scope or API                                           | Status | Phase | Needed for                                                                                                                                                                                                  |
| ------------------------------------------------------ | ------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `https://api.ebay.com/oauth/api_scope`                 | Have   | 1–3   | The base scope; also what the Trading API calls run under                                                                                                                                                   |
| `…/api_scope/commerce.identity.readonly`               | Have   | –     | The seller's user ID (today)                                                                                                                                                                                |
| `…/api_scope/commerce.notification.subscription`       | Have   | 1–3   | `ORDER_CONFIRMATION` (today); any listing topics `getTopics` offers                                                                                                                                          |
| `…/api_scope/sell.fulfillment.readonly`                | Have   | –     | Orders, including cancellation status and refunds (today). Replaced by `sell.fulfillment`                                                                                                                   |
| `…/api_scope/sell.fulfillment`                         | New    | 3     | `createShippingFulfillment` to send tracking; everything the read-only scope did                                                                                                                            |
| `…/api_scope/sell.inventory`                           | New    | 1–3   | Reading listings made with the Inventory API (Phase 1); `bulkUpdatePriceQuantity` for their quantities (Phase 2) and prices (Phase 3)                                                                       |
| Trading API (no scope)                                 | New    | 1–3   | `GetSellerList` and `GetItem` to read Seller Hub listings (Phase 1); `ReviseInventoryStatus` for their quantities (Phase 2) and prices (Phase 3); `GetUserPreferences` for out-of-stock control              |
| Post-Order API (no scope)                              | New    | 3     | Returns and cancellation details. Verify it accepts the OAuth user token for this app                                                                                                                       |
| `…/api_scope/sell.account.readonly`                    | Not needed | –     | Business policies; only needed to migrate listings to the Inventory API, which Copacker won't do                                                                                                            |
| `…/api_scope/sell.finances`                            | Not needed | –     | eBay fees and payouts. Not part of this spec                                                                                                                                                                |

Also needed:

- **Reconnecting.** eBay's user tokens carry the scopes they were granted, so adding `sell.inventory` and
  `sell.fulfillment` means each seller connects again. Only production can complete eBay sign-in (eBay needs HTTPS).
- **Notification topics.** Call `getTopics` to see which listing and order topics the keyset can subscribe to. Copacker
  polls orders and listings where there's no topic: the hourly reconcile, and the order sync's 30-day re-read, which
  already picks up cancellations.
- **Supplier workspaces** can connect eBay once Phase 1 lifts the buyer-only gates in the connection and sync code.

## Summary by feature

| Feature                                            | Shopify                                                              | Amazon                                           | eBay                                             |
| -------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------ |
| Read stock, locations, listings (Phase 1)          | Have                                                                 | Have                                             | `sell.inventory`, Trading API                    |
| Incoming and receiving (Phase 2)                   | Transfer, shipment and received-items scopes                         | Have                                             | –                                                |
| Quantities to channels (Phase 2)                   | Have (`write_inventory`)                                             | Have (Product Listing)                           | `sell.inventory`, Trading API                    |
| Marketplace sales off Shopify stock (Phase 2)      | Have (`write_inventory`)                                             | Have                                             | Have                                             |
| B2B holds (Phase 2)                                | Have (`write_inventory`)                                             | –                                                | –                                                |
| Orders into Shopify (Phase 3)                      | `write_orders`, fulfillment order scopes, protected customer data    | Direct-to-Consumer Shipping (Restricted)         | Have                                             |
| Tracking to marketplaces (Phase 3)                 | Have (`read_fulfillments`)                                           | Have                                             | `sell.fulfillment`                               |
| Cancellations into Shopify (Phase 3)               | `write_orders`, order edit scopes                                    | Have                                             | Have                                             |
| Refunds and returns into Shopify (Phase 3)         | `write_orders`, return scopes                                        | Have (returns reports: verify the role)          | Post-Order API                                   |
| Prices to channels (Phase 3)                       | Have                                                                 | Have (Product Listing)                           | `sell.inventory`, Trading API                    |
| FBA orders into Shopify (Phase 3)                  | `write_orders`                                                       | Have                                             | –                                                |
