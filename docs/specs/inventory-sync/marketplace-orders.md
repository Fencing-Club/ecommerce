# Marketplace orders (Phase 3)

Part of the [inventory sync spec](README.md). Copacker replaces Marketplace Connect for the jobs decided on 2026-09-28:

- inventory;
- marketplace orders into Shopify;
- order status;
- cancellations;
- refunds;
- prices;
- FBA orders copied into Shopify for reporting.

Creating listings and Amazon MCF stay out. Every line here needs a Shopify master: with a Copacker master, marketplace
orders are sales in Copacker's ledger ([quantity sync](quantity-sync.md#sales-reaching-the-master)).

## Orders into Shopify

**Which orders:**

- Amazon FBM orders and eBay orders become Shopify orders that are fulfilled from Shopify.
- FBA orders become reporting-only orders ([below](#fba-orders-into-shopify)).
- Later marketplaces work like eBay.

**When:** on the marketplace's new-order event (eBay `ORDER_CONFIRMATION`, Amazon `ORDER_CHANGE`), with the order sync
as a backstop.

- **Cancelled before it's copied:** the order is still created, then cancelled at once, so Shopify has a record of every
  marketplace order.
- **Only new orders:** orders from before the switch to Copacker are left to the app that handled them.

**Creating the order** uses `orderCreate`:

- **Lines:**
  - Each line is the linked item's Shopify variant, at the marketplace's price.
  - A line whose listing isn't linked holds the order in Needs linking. The person links the listing, or chooses
    "Create without stock", which uses a custom line item and doesn't touch stock.
- **Stock:**
  - `inventoryBehaviour: DECREMENT_IGNORING_POLICY`.
  - The sale already happened, so the order must exist even if Shopify's count says there's nothing to sell. Shopify then
    commits the units itself.
- **Location:**
  - The units are committed at the channel's first source location.
  - If Shopify routes the order elsewhere, Copacker moves the fulfillment order (`fulfillmentOrderMove`).
- **No customer record:**
  - The shipping address goes on the order so it can be shipped. No Shopify customer is created.
  - Receipts and shipping confirmations are off (`sendReceipt: false`, `sendFulfillmentReceipt: false`), since the
    marketplace talks to its buyer.
- **Payment:** one successful sale transaction, with the marketplace as its gateway name (`eBay`, `Amazon`).
- **Shipping:** a shipping line with the marketplace's title and price.
- **Taxes:** tax lines as collected by the marketplace (open question 12).
- **Identity:**
  - Tags: the marketplace (`eBay`, `Amazon`) and `Copacker`.
  - Note attributes: the marketplace name and order ID.
  - Shopify assigns the order name.
- **No duplicates:**
  - Copacker records every marketplace order it copies (`marketplace_orders`, keyed by channel and order ID) and never
    creates one twice.
  - Before creating, it looks for a Shopify order with the same marketplace order ID made by another app. If it finds
    one, it doesn't create another, and it flags the orders line as double-owned.
- **Sales history:**
  - Copacker's own sales sync skips Shopify orders it created (by the note attribute), since it already reads those
    orders from the marketplace.
  - This replaces the tag lists (`excludedShopifyTags`) for orders Copacker makes.
- **Replacing Phase 2:** once the orders line is Copacker's, the Phase 2 adjustment for that channel stops. Shopify's own
  commit takes over.

**PII:**

- Amazon only returns FBM shipping addresses with the Direct-to-Consumer Shipping (Restricted) role
  ([scopes](scopes.md#amazon)). Amazon's Data Protection Policy applies.
- Copacker passes the address to Shopify and doesn't store it. Only the marketplace order ID is kept.
- If Amazon doesn't grant the role, FBM orders are created without an address, for stock and reporting, and are shipped
  from Seller Central (open question 13).

## Fulfillment and tracking

- **Shopify to the marketplace:** when a Copacker-created order is fulfilled in Shopify (the `FULFILLMENTS_CREATE`
  webhook the app already has), Copacker sends the carrier and tracking number.
  - eBay: `createShippingFulfillment` in the Fulfillment API.
  - Amazon: `confirmShipment` in the Orders API.
  - Partial fulfillments send their own lines.
- **The marketplace to Shopify:** when an order is shipped on the marketplace (a label bought in Seller Central or on
  eBay), Copacker fulfills the Shopify order with the same tracking, without notifying anyone.
- **Status:** the Shopify order follows the marketplace (unfulfilled, partly fulfilled, fulfilled). Delivery isn't
  tracked.

## Cancellations

Marketplace to Shopify only.

- **Whole order, not yet fulfilled:**
  - Copacker cancels the Shopify order (`orderCancel`).
  - The reason is mapped from the marketplace's (customer or other).
  - Stock is restocked, since Shopify committed it.
  - There's no refund (no money moved in Shopify), and no notification.
- **One line cancelled:** an order edit removes that line's quantity, restocking it (`orderEditBegin`,
  `orderEditSetQuantity`, `orderEditCommit`).
- **After fulfillment:** handled as a refund or return.
- **Cancelled in Shopify:** a Copacker-created order cancelled in Shopify isn't cancelled on the marketplace. The Stock
  flow page lists it as needing the same cancellation on the marketplace.

## Refunds and returns

Marketplace to Shopify only.

- **Refunds:** a refund on the marketplace, whole or partial, becomes a Shopify refund on the order (`refundCreate`). It
  carries the same amounts per line and shipping, a refund transaction on the marketplace gateway, and no notification.
- **Returns:**
  - A return opened on the marketplace becomes a Shopify return on the order (`returnCreate`).
  - It is closed when the marketplace closes it or refunds it.
- **No automatic restocking:** a returned unit goes back to stock only when a person restocks it, in Shopify's return or
  as a count change. This matches Marketplace Connect and the rule that a refund doesn't prove a unit is sellable.
- **Sources:**
  - eBay: the order's refunds in the Fulfillment API, and returns in the Post-Order API.
  - Amazon: order status in the Orders API; refund events in the Finances API (already copied); returns from the returns
    reports.
- **FBA orders:** refunds are recorded on the reporting order, with no stock involved.

## Prices

- **Source:**
  - Shopify master: the Shopify variant's price.
  - Copacker master (Phase 3 for suppliers such as Unic): the variant's retail price in Copacker (open question 11).
- **Rule per channel:**
  - Adjust by a percentage or a fixed amount.
  - Optionally end in .99.
  - Optionally stay at least or at most a given price.
  - Convert currency when the source currency isn't the marketplace's, using the exchange rates the app already stores.
  - A listing can override with its own price, or be left out.
- **Writes:**
  - eBay: `ReviseInventoryStatus` (`StartPrice`) or `bulkUpdatePriceQuantity`, alongside quantities.
  - Amazon: `patchListingsItem` on `purchasable_offer` (`our_price` in USD for the US marketplace), within any minimum
    and maximum the seller set.
- **When:**
  - On a price change (Shopify product webhooks, or a Copacker price edit).
  - In the daily reconcile.
- **Same as quantities:** the same preview, pause and history, and edits made outside the master are overwritten.
- **Out of scope:** sale prices and Amazon's business prices.

## FBA orders into Shopify

For reporting in Shopify, never for stock.

- **How they're created:**
  - `orderCreate` with `inventoryBehaviour: BYPASS`, created as already fulfilled.
  - Fulfilled at the Amazon app's location if the store has one, otherwise the first counted location. With `BYPASS`,
    no count moves.
- **Identity:** tagged `Amazon FBA` and `Copacker`, with the Amazon order ID in the note attributes.
- **Money:** a sale transaction on the `Amazon` gateway. Amazon's fees aren't copied; the Overview reports them.
- **After creating:** refunds follow [refunds and returns](#refunds-and-returns). Cancellations of FBA orders happen
  before shipping, so a cancelled FBA order is created and cancelled, with no restock.

## Switching from Marketplace Connect

**Steps, per channel and per line:**

1. The Stock flow page shows the line owned by "another app: Marketplace Connect".
2. The person turns that feature off in Marketplace Connect.
3. They confirm in Copacker, and the line's preview runs.
4. Copacker takes over from that moment. Anything created before it stays with the other app, and the duplicate check
   stops Copacker from recreating it.

**Order:**

1. Quantities.
   - This works on its own only if Marketplace Connect keeps copying the orders into Shopify. Verify that its order and
     inventory sync can be turned off separately.
2. Orders, fulfillment and tracking, cancellations, and refunds and returns.
   - These move together, because they act on the same Shopify orders.
3. Prices.
4. FBA orders.

**Going back:** turn Copacker's line off, then turn the feature back on in Marketplace Connect. Orders Copacker created
stay in Shopify. Marketplace Connect might copy them again, since it can't see Copacker's record, so the page warns
before going back.

## Marketplace adapter

Every marketplace sits behind one contract, so Walmart, TikTok Shop, Etsy or Faire can be added without changing the
rest.

- **Listings:** list listings with their SKU, quantity and price; set quantities; set prices.
- **Orders:** list orders changed since a cursor; get one order with its lines, shipping, taxes and cancellations.
- **After the sale:** refunds and returns since a cursor; send shipment tracking.
- **Events:** subscribe to the marketplace's events where it has them, and fall back to polling where it doesn't.
- **Capabilities:** each adapter reports what it supports (for example, partial cancellations or return records), so the
  settings hide what a marketplace can't do.
