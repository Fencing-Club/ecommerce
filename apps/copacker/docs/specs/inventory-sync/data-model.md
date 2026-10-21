# Data model

Part of the [inventory sync spec](README.md). The tables, jobs, actions and migrations the spec needs. Names are
proposals, and the schema changes only through new Drizzle migrations (`pnpm --filter copacker db:generate`), never by
editing an old one.

## Settings

`organizations` gains:

- `stockMaster`: `shopify` or `copacker`.
- `purchaseOrderOwner`: `copacker` or `shopify`. It stays `copacker` until Phase 4.
- `stockRevision`: optimistic concurrency for the Stock flow page. Every settings change sends the revision it was made
  against, as the location settings do today.

## The graph

The Stock flow map is drawn from these tables. The master, the counting platforms and the purchase orders node are
implied by the workspace and its connections, so they need no rows. Step 2 of the page adds a table for canvas
positions.

**`stock_locations`** replaces `inventory_location_mappings`:

| Column                  | Type                                                                | Notes                                                                                 |
| ----------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `id`                    | uuid                                                                |                                                                                       |
| `orgId`                 | uuid                                                                |                                                                                       |
| `platform`              | `shopify`, `copacker`, `amazon`                                     |                                                                                       |
| `kind`                  | `shopify_location`, `copacker`, `fba`, `awd`                        |                                                                                       |
| `externalId`            | text, nullable                                                      | Shopify location GID, `ATVPDKIKX0DER` for FBA, `us` for AWD, null for Copacker        |
| `name`                  | text                                                                | From the platform, or typed for Copacker locations                                    |
| `role`                  | `managed`, `reported`, `mirror`, `excluded`, `unresolved`           | The saved choice                                                                      |
| `detectedRole`          | same values                                                         | From the fulfillment service, refreshed by every crawl                                |
| `contactId`             | uuid, nullable                                                      | The address of a Copacker location                                                    |
| `active`                | boolean                                                             | False when the platform deactivates or deletes it                                     |
| `revision`              | integer                                                             |                                                                                       |

Unique on (`orgId`, `platform`, `externalId`). The stock crawl creates and updates rows. A person only changes `role`
(and a Copacker location's name and address).

**`stock_channels`:** `id`, `orgId`, `kind`, `settings` and `revision`.

- `kind` is one of `shopify_store`, `amazon_fba`, `amazon_fbm`, `ebay` or `b2b`, with later marketplaces added.
- `settings` (jsonb) holds the rule and eBay's out-of-stock behavior.
- Unique on (`orgId`, `kind`), which is enough while each workspace has one account per platform.

**`stock_channel_sources`:** `channelId`, `locationId` and `position`, the channel's source locations in priority order.

**`sync_lines`:**

| Column          | Type                                                                                                                                 | Notes                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| `id`, `orgId`   | uuid                                                                                                                                 |                                                     |
| `kind`          | `quantities`, `sales`, `holds`, `receipts`, `orders`, `fulfillment`, `cancellations`, `prices`, `fba_orders`                          |                                                     |
| `channelId`     | uuid, nullable                                                                                                                       | Null for receipts and holds, which belong to the workspace |
| `owner`         | `copacker`, `other_app`, `platform`, `off`                                                                                           |                                                     |
| `otherApp`      | text, nullable                                                                                                                       | Such as "Marketplace Connect"                       |
| `state`         | `on`, `paused`, `error`                                                                                                              |                                                     |
| `pausedReason`  | text, nullable                                                                                                                       | A message key                                       |
| `settings`      | jsonb                                                                                                                                | Per-line options                                    |
| `revision`, `updatedBy`, `updatedAt` |                                                                                                                                      |                                                     |

Unique on (`orgId`, `kind`, `channelId`).

**`listings`:**

| Column                                    | Type                                                | Notes                                                                                   |
| ----------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `id`, `orgId`, `channelId`                | uuid                                                |                                                                                         |
| `externalId`                              | text                                                | eBay item ID, plus the variation SKU for variations; the Amazon seller SKU               |
| `api`                                     | `trading`, `inventory`, `listings_items`            | Which API writes it                                                                     |
| `sku`, `title`                            | text                                                | As the platform shows them; the title is only for display, never matching               |
| `productType`                             | text, nullable                                      | Amazon's, needed for patches                                                            |
| `item`                                    | text, nullable                                      | A Shopify variant GID, or a Copacker product ID                                         |
| `unitsPerListing`                         | integer                                             | 1, or the pack size                                                                     |
| `link`                                    | `auto`, `manual`, `unlinked`, `ignored`             |                                                                                         |
| `rule`                                    | jsonb, nullable                                     | A per-listing override                                                                  |
| `liveQuantity`, `liveQuantityAt`          |                                                     | The last read                                                                           |
| `pushedQuantity`, `pushedAt`              |                                                     | The last confirmed write                                                                |
| `livePrice`, `pushedPrice`                | Phase 3                                             |                                                                                         |
| `revision`                                | integer                                             |                                                                                         |

Unique on (`channelId`, `externalId`).

## The Copacker ledger

Only for Copacker-master workspaces. Items are supplier products until there's a buyer catalog (open question 2).

**`stock_levels`:** `locationId`, `productId`, `onHand`, `committed`, `held`, `revision` and `updatedAt`.

- Primary key (`locationId`, `productId`).
- Available is on hand − committed − held.
- It replaces `supplier_products.onHand`. `trackInventory` and `continueSelling` stay on the product.
- Rows are locked `FOR UPDATE` in `productId` order, as `trackedProducts` does today.

**`stock_movements`:**

| Column                                          | Type        | Notes                                                                                                                                                                              |
| ----------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `orgId`, `locationId`, `productId`        | uuid        |                                                                                                                                                                                    |
| `onHandDelta`, `committedDelta`, `heldDelta`    | integer     |                                                                                                                                                                                    |
| `reason`                                        | text enum   | `seeded`, `counted`, `received`, `receipt_reversed`, `sold`, `sale_shipped`, `sale_cancelled`, `held`, `hold_released`, `b2b_taken`, `b2b_returned`, `master_switched`             |
| `cause`                                         | jsonb       | `{ type, id }`: a purchase order, shipment, receipt, marketplace order line, or person                                                                                             |
| `actor`                                         | uuid, nullable | The person, or null for Copacker                                                                                                                                                 |
| `createdAt`                                     | timestamp   |                                                                                                                                                                                    |

Indexed on (`orgId`, `productId`, `createdAt`). Movements are never edited or deleted; a mistake is corrected with a new
movement.

**`purchase_order_holds`:** `orderId`, `productId`, `locationId` and `units`, the units still held for each accepted
purchase order. It is kept in step with `stock_levels.held`, so closing or correcting a purchase order releases exactly
what it held.

**`marketplace_order_lines`:**

| Column                                          | Type                                      | Notes                                                     |
| ----------------------------------------------- | ----------------------------------------- | --------------------------------------------------------- |
| `channelId`, `externalOrderId`, `externalLineId` |                                           | The key                                                   |
| `productId`, `locationId`                       |                                           | Where the sale was taken from                             |
| `units`                                         | integer                                   |                                                           |
| `state`                                         | `committed`, `shipped`, `cancelled`       |                                                           |
| `updatedAt`                                     | timestamp                                 |                                                           |

It tracks each marketplace line's effect once, whichever event arrives first or again. With a Shopify master, it
records the Phase 2 adjustment so a cancellation reverses exactly that.

## Purchase orders and receiving

- **`orders.status`** gains `accepted` and `declined`.
- **`orders` gains:**
  - `acceptedAt`, `acceptedBy`, `declinedAt`, `declinedBy`, `declineReason`.
  - `shopifyLocationId`, saved when the purchase order is sent.
  - `shopifyTransferId`.
  - For Phase 4, `source` (`copacker` or `shopify`) and `externalId`.
- **`shipments.status`** gains `receiving`.
- **`shipments` gains** `shopifyInventoryShipmentId`, `amazonStatus` and `amazonCheckedAt`.
- **`shipments.stockTaken`** is replaced by `b2b_taken` movements.

**`shipment_receipts`:** `id`, `shipmentId`, `source` (`manual`, `shopify` or `amazon`), `actor`, `reversesId` (for a
reversal) and `createdAt`.

**`shipment_receipt_lines`:** `receiptId`, `item`, `received` and `rejected`.

- `item` is a Shopify inventory item GID, an Amazon seller SKU or a supplier product.
- Amazon receipts store the change since Copacker's last read, so a shipment's received total is always the sum of its
  receipts.

**New timeline event keys:**

- `purchaseOrderAccepted`.
- `purchaseOrderDeclined`, with the reason.
- `shipmentReceiving`, with the receipt's totals.
- `shipmentReceived`, with received, rejected, short and extra.
- `amazonReceiptUpdated`.

The purchase order's events keep today's shape, and a new nullable `shipmentId` column lets a receipt event link to its
shipment.

## Sync outbox and history

**`sync_writes`:**

| Column                        | Type          | Notes                                                                                                                                                                                                                                             |
| ----------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `orgId`, `lineId`       | uuid          |                                                                                                                                                                                                                                                   |
| `target`                      | jsonb         | `{ platform, object, id }`, such as an eBay listing or a Shopify inventory level                                                                                                                                                                  |
| `operation`                   | text enum     | `set_quantity`, `adjust_quantity`, `move_quantity`, `set_price`, `transfer_create`, `transfer_update`, `shipment_in_transit`, `shipment_receive`, `order_create`, `order_cancel`, `order_edit`, `refund_create`, `return_create`, `fulfillment_create`, `tracking_send` |
| `payload`                     | jsonb         | The desired value or change                                                                                                                                                                                                                       |
| `cause`                       | jsonb         | A movement, receipt, marketplace order, rule change or reconcile                                                                                                                                                                                  |
| `idempotencyKey`              | text, unique  |                                                                                                                                                                                                                                                   |
| `status`                      | text enum     | `pending`, `sending`, `confirmed`, `failed`, `superseded`, `unknown`                                                                                                                                                                              |
| `attempts`, `nextAttemptAt`, `sentAt`, `confirmedAt` |               |                                                                                                                                                                                                                                                   |
| `error`, `response`           | text, jsonb   | The platform's message and a short summary of its answer                                                                                                                                                                                          |
| `createdAt`                   | timestamp     |                                                                                                                                                                                                                                                   |

- **Indexes:** (`orgId`, `lineId`, `createdAt`) for history, and (`status`, `nextAttemptAt`) for the worker.
- **Superseded writes:** a pending `set_quantity` or `set_price` for the same target is marked `superseded` when a newer
  one is queued.
- **Cleanup:** the daily reconcile deletes rows older than 400 days (open question 9).

**`marketplace_orders`** (Phase 3): `channelId`, `externalOrderId`, `shopifyOrderId`, `state` and the timestamps.

- `state` is one of `created`, `cancelled`, `refunded`, `returned`, `held_unlinked` or `double_owned`.
- Unique on (`channelId`, `externalOrderId`).
- No buyer names or addresses are stored.

## Jobs

New `jobs.kind` values, run by the existing worker:

| Kind                 | Key                                        | Does                                                                                   |
| -------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------- |
| `listings`           | `listings:{channelId}:{revision}`          | Reads a channel's listings and links them by SKU                                       |
| `sync-push`          | `sync-push:{channelId}`                    | Sends a channel's pending writes, coalesced; runs again while any are pending          |
| `sync-reconcile`     | `sync-reconcile:{channelId}:{hour}`        | Reads live quantities (and prices) and queues any differences                          |
| `shopify-transfer`   | `shopify-transfer:{orderId}:{revision}`    | Creates or updates a purchase order's transfer and its shipments                       |
| `amazon-receipts`    | `amazon-receipts:{shipmentId}:{window}`    | Reads Amazon's received counts for an open Amazon shipment                             |
| `marketplace-order`  | `marketplace-order:{channelId}:{orderId}`  | Phase 3: creates, cancels, edits or refunds one Shopify order                          |

- **Existing jobs:** the `stock` job gains a targeted refresh for single inventory levels. The `reconcile` job queues the
  hourly and daily work.
- **Unknown outcomes:** any job whose write times out records `unknown` and reads the target back before sending again.

## Actions and routes

- **New actions:**
  - `order.accept` and `order.decline` (supplier).
  - `shipment.receive`, with receipt lines.
  - `shipment.reverseReceipt`.
  - `shipment.finishReceiving`.
- **Removed:** `shipment.received`.
- **Stock flow:**
  - `GET /api/stock-flow`: the graph with its numbers.
  - `PATCH /api/stock-flow`: the master, locations, channels and lines. Admins only, checked against
    `organizations.stockRevision`.
  - `POST /api/stock-flow/preview`.
  - `GET /api/stock-flow/history`.
- **Listings:** `PATCH /api/listings/:id`, to link, ignore or set a rule.
- **Removed:** `PATCH /api/inventory/locations`, replaced by the location panel.
- **Existing routes changed:** `/api/supplier-catalog/stock` writes `counted` movements instead of setting
  `supplier_products.onHand`.

## Migrations

In order, each as its own migration:

1. **Settings:** add them. `stockMaster` becomes `shopify` for buyer workspaces with a Shopify connection and `copacker`
   for everyone else; `purchaseOrderOwner` becomes `copacker`.
2. **Locations:**
   - Create `stock_locations` from the latest Shopify snapshots, with FBA and AWD rows for Amazon connections.
   - Carry over saved classifications: `merchant` becomes `managed`, `amazon_mirror` becomes `mirror`, and `excluded`
     and `unresolved` stay.
   - Drop `inventory_location_mappings`.
3. **Supplier stock:**
   - Create a "Stock" location for each supplier workspace, and `stock_levels` from each tracked product's
     `supplier_products.onHand`, with a `seeded` movement each.
   - Mark every `submitted` purchase order to an on-platform supplier as `accepted`, since those are already in progress,
     and hold their untaken units.
   - Turn each `shipments.stockTaken` into a `b2b_taken` movement.
   - Then drop `supplier_products.onHand` and `shipments.stockTaken`.
4. **Status values:** add them to `orders.status` and `shipments.status`, with the new columns.

## Code this replaces

- `src/server/supplier-stock.ts` becomes the ledger module:
  - `checkSupplierStock` checks available units against holds.
  - `takeSupplierStock` and `returnSupplierStock` write movements.
  - `openDemand` is removed.
- `src/server/inventory-locations.ts`, `inventory-location-settings.ts` and the Settings location dialog become location
  roles on `stock_locations`.
- `receiveShipment` in `src/server/orders.ts` becomes the receipt flow.
- `packages/copacker-marketplaces`:
  - `shopify.ts` gains the inventory mutations and transfers.
  - `amazon.ts` gains Listings Items writes and inbound receipts.
  - `ebay.ts` gains a Trading API client and the Inventory API.
- The buyer-only gates in `src/server/stock.ts`, `sales-orders.ts` and the connection routes open for supplier
  workspaces, starting with eBay.
