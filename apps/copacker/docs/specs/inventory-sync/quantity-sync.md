# Quantity sync (Phase 2)

Part of the [inventory sync spec](README.md). How Copacker keeps channel quantities and the master in step once it
starts writing. Order copying into Shopify is [Phase 3](marketplace-orders.md).

## Sync lines

A sync line is one kind of data flowing along one path. Each line has an owner and a state.

| Line                      | Flows                                                            | Phase |
| ------------------------- | ---------------------------------------------------------------- | ----- |
| Quantities                | From the master's locations to a channel's listings              | 2     |
| Sales                     | From a channel's orders to the master's count, without creating Shopify orders | 2     |
| Holds                     | From accepted B2B purchase orders to the supplier's count        | 2     |
| Incoming and receipts     | From purchase orders to a destination location                   | 2     |
| Orders                    | From a marketplace to Shopify, as Shopify orders                 | 3     |
| Fulfillment and tracking  | From Shopify to the marketplace, and marketplace shipments to Shopify | 3     |
| Cancellations and refunds | From the marketplace to Shopify                                  | 3     |
| Prices                    | From the master to a marketplace                                 | 3     |
| FBA orders                | From Amazon to Shopify, for reporting                            | 3     |

- **Owners:**
  - `copacker`.
  - `other_app`, with the app's name, such as Marketplace Connect.
  - `platform`, when the platform does it natively, like Shopify selling from its own locations.
  - `off`.
- **States:** on, paused (with a reason), error.
- **The switch.** Every Copacker line can be switched off.
  - Switching off stops new writes. Writes already sent aren't undone.
  - Switching back on recomputes and shows a preview first (see [Safety](#safety)).
- **Defaults.**
  - Every Copacker quantities line starts off. A person turns it on after its preview.
  - With a Copacker master, sales, holds and receipts lines start on, because without them its count is wrong.
  - With a Shopify master, lines start as the [permutations](stock-model.md#permutations) propose.
- **Sales and orders lines.** Both make a marketplace's sales lower the master, so only one of them runs for a channel.
  - The sales line lowers the count directly.
  - The orders line (Phase 3, Shopify master) creates Shopify orders, and Shopify commits their units itself.
  - When a channel's orders line is on, whether Copacker's or another app's, Copacker switches that channel's sales line
    off.
- **Declaring another app.** A line owned by another app is only a declaration. Copacker can't read Marketplace
  Connect's settings; it uses the declaration to refuse setups that double-count ([validation](stock-model.md#validation)),
  and watches for conflicts ([other apps](#other-apps)).

## Channel settings

Per channel, edited in the channel's side panel:

- **Sells from:** one or more managed locations, in priority order. The priority decides which location a sale comes from
  (open question 4).
- **Rule:**
  - "All available" (the default).
  - "Keep N back": a buffer, subtracted first.
  - "At most N": a cap, applied after the buffer.
  - "Always N": fixed.
- **Per-listing overrides:** a listing can have its own rule, or be left out of sync.
- **Out-of-stock behavior** (eBay): whether the seller's account has out-of-stock control on. Read with Trading
  `GetUserPreferences`. With it off, a quantity of 0 ends a good-til-cancelled listing, so Copacker warns and never sends
  0 to such a listing without the person's confirmation.

## Computing a listing's quantity

For a linked listing:

1. **Available:** sum the item's available units across the channel's source locations.
   - Shopify master: Shopify's `available`.
   - Copacker master: on hand − committed − held.
2. **Bundles:** a bundle's available is the smallest, across its components, of the component's available divided by its
   quantity, rounded down.
3. **Multipacks:** a listing that sells packs divides by the units per pack, rounded down.
4. **Rule:** apply the channel's or the listing's rule.
5. **Floor:** never below 0. A negative count is pushed as 0.

The result is always a whole number, rounded down, so Copacker never offers a unit it doesn't have.

## When Copacker pushes

- **Triggers:**
  - A movement at a source location (Copacker master).
  - A Shopify inventory level change (Shopify master).
  - A hold being created or released.
  - A rule change.
  - A new listing link.
  - A quantities line being turned on.
- **Speed:** a change reaches every affected listing within 60 seconds.
  - Today's Shopify event handling waits for 5-minute buckets plus a 3-minute settle, and then re-reads the whole
    catalog. That is too slow for quantities.
  - Phase 2 reads just the changed inventory levels from the webhook's inventory item and location, and keeps the full
    crawl for reconciliation.
- **Coalescing:** writes are coalesced per listing. A newer target replaces a pending one, because only the latest
  number matters for a set.
- **Reconciliation:**
  - Every hour, Copacker reads every linked listing's live quantity and pushes any difference.
  - The existing daily reconcile does a full stock crawl as today.

## Writes by platform

| Target                                       | Operation                                                                                                                                       | Notes                                                                                                                                                                                                         |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| eBay listing made in Seller Hub or the Trading API | Trading `ReviseInventoryStatus`, up to 4 listings or variations per call                                                                        | Variations by SKU. Seller Hub listings can't take Inventory API calls unless migrated, and migrating locks them out of Seller Hub, so Copacker never migrates.                                                  |
| eBay listing made with the Inventory API     | Inventory API `bulkUpdatePriceQuantity`, up to 25 offers per call                                                                               | Needs `sell.inventory`.                                                                                                                                                                                       |
| Amazon FBM offer                             | Listings Items `patchListingsItem`, merging `fulfillment_availability` with `fulfillment_channel_code: DEFAULT` and the quantity                   | Needs the listing's product type (from `getListingsItem`). Over 100 changes at once go as one `JSON_LISTINGS_FEED`. Amazon's `AMAZON_NA` entry is never touched.                                               |
| Shopify location, Copacker master            | `inventorySetQuantities` on `available`, with `changeFromQuantity` set to the last value read                                                   | If the compare fails (a Shopify order landed meanwhile), Copacker re-reads, records the order, recomputes and tries again.                                                                                    |
| Shopify location, Shopify master: a marketplace sale | `inventoryAdjustQuantities` on `available`, −units, reason `other`, reference the marketplace order's URL                                       | Only while the sales line is Copacker's and orders aren't copied into Shopify (Phase 3 replaces it). A cancellation before shipping adds the units back.                                                      |
| Shopify location, Shopify master: a B2B hold | `inventoryMoveQuantities` from `available` to `reserved`, and back                                                                             | See [supplier acceptance](purchase-orders.md#supplier-acceptance).                                                                                                                                             |
| Shopify location, Shopify master: a receipt  | `inventoryShipmentReceive` on Copacker's transfer                                                                                               | See [receiving](purchase-orders.md#receiving-at-your-own-locations).                                                                                                                                           |

**Every write carries an idempotency key** built from its cause, target and operation.

- Shopify requires the `@idempotent` directive on inventory mutations from API 2026-04. Copacker's current version,
  2026-07, already needs it. The canceled receive action needs 2026-10, so this work moves the client to 2026-10 or
  later.
- Sets are safe to repeat. Adjustments and moves rely on the key.
- A write that times out is an unknown outcome. Copacker reads the target back before deciding, and never sends a
  delta twice blindly. The same rule applies to Amazon inbound creates today.

## Sales reaching the master

A channel's sales line lowers the count when something sells there.

**Copacker master:**

- Copacker already hears about new orders:
  - eBay `ORDER_CONFIRMATION`
  - Amazon `ORDER_CHANGE`
  - Shopify order webhooks, when Shopify is a channel
- Each order line **commits** its units at the channel's first source location with enough available (otherwise the
  first location, which may go negative).
- When the platform reports the line shipped, the units come off on hand and committed together.
- A cancellation before shipping releases the committed units.
- Committed units are tracked per order line, so a late or repeated event can't count twice.

**Shopify master:**

- Shopify commits its own orders.
- For a marketplace order, Copacker adjusts the source location's available, as in the table above, until Phase 3 copies
  the order into Shopify.
- If another app copies marketplace orders into Shopify, the sales line belongs to that app, and Copacker adjusts
  nothing.

**Refunds and returns** don't put units back automatically on any master. Whether a returned unit is sellable is only
known once someone checks it, so restocking is a count change made by a person. Marketplace Connect works the same way.

## Edits made outside the master

The master wins.

- **Detection:** Copacker compares each listing's live quantity with the last value it pushed, less any sales since. A
  difference no order explains was set by someone or something else.
- **Correction:** the next push or the hourly reconcile sets it back. History records the edit: "Changed in eBay from 7
  to 12, set back to 7."
- **Shopify as a channel:** with a Copacker master, a Shopify location is treated the same way.
- **Conflict guard:**
  - If something changes a listing three times within an hour after Copacker set it, Copacker pauses that channel's
    quantities line.
  - It then shows "Another app is changing eBay quantities."
  - This is usually Marketplace Connect with its inventory sync still on.

## Other apps

- **Declared owners:** each line records which app owns it. A channel can't have Copacker and another app owning the same
  line.
- **Detecting another app:**
  - Shopify orders whose source or tag shows another app copying a marketplace's orders mean that app owns orders for
    that marketplace. Fencing Club's eBay orders arrive tagged `eBay` from Marketplace Connect.
  - Repeated quantity changes that Copacker didn't make mean another app is setting quantities (the conflict guard
    above).
- **Taking over:** moving a line from another app to Copacker follows the
  [switch-over](marketplace-orders.md#switching-from-marketplace-connect). The person turns the feature off in the other
  app first, then turns Copacker's line on after its preview.

## Safety

- **Preview:** turning on a quantities line shows every linked listing with its current and new quantity, and the
  listings that need linking. Nothing is sent until the person confirms.
- **Pause:** each line can be paused, and there's a workspace-wide pause for everything Copacker writes.
- **Stale counts:**
  - If the last good read of a source is older than 30 minutes (for example, Shopify webhooks stopped), Copacker only
    pushes decreases.
  - When unsure, it sells less.
- **Bulk guard:**
  - If one recompute would change more than a quarter of a channel's listings, Copacker pauses the line and asks first.
  - This catches a bad read, such as a crawl that came back empty.
- **Rate limits:** each platform's limits are respected with backoff. Writes are spread over time rather than dropped.
- **Errors:** a listing Amazon or eBay rejects shows on the Stock flow page with the platform's message. The others keep
  syncing.

## History

Every movement and every write is recorded with its cause, so any number can be explained. For example:

> eBay order 12-34567 sold 1 unit of UF-2142L-A. Stock at Unic went from 10 to 9 on hand. Copacker set eBay listing
> 1234 to 9 (confirmed 14:02). Copacker set Amazon FBM SKU UF-2142L-A to 9 (confirmed 14:02).

- **Where it shows:** each line's panel on the Stock flow page, and each item's stock view
  ([Stock flow page](stock-flow-ux.md#history)).
- **What is recorded:** writes are recorded whether they succeeded or failed. Failures include the platform's response.
- **Retention:** movements are kept as long as the ledger. Write history is kept for 400 days (open question 9).
