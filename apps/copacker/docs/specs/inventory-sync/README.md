# Inventory sync spec

Status: **planned**. Nothing here is built yet; the pages describe how Copacker should work. Written 2026-09-28 from the
decisions below. When a part ships, its behavior moves into the regular docs and this spec is trimmed.

Copacker becomes the place that knows where every unit is, whose count is right, and which platforms it keeps in step.
The spec covers:

- **Phase 1, stock model:** which system holds the master count, how every location and channel on every platform
  behaves, and what each combination of connected accounts does. Read-only: Copacker changes nothing on any platform.
- **Phase 2, two-way quantity sync and receiving:** receiving a purchase order, a sale on one channel or a supplier
  accepting a purchase order updates the count everywhere it should, and nowhere it shouldn't.
- **Phase 3, marketplace orders:** Copacker replaces Marketplace Connect for orders, order status, cancellations,
  refunds and prices between Shopify and the marketplaces.
- **Phase 4, Shopify purchase orders:** a workspace can keep its purchase orders in Shopify instead of Copacker, once
  Shopify publishes a purchase order API.

## Pages

| Page                                        | Covers                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------- |
| [Stock model](stock-model.md)               | The master, locations, channels, quantities, listing links, every permutation         |
| [Purchase orders](purchase-orders.md)       | Supplier acceptance and holds, incoming, receiving, Amazon receipts, closing, PO owner |
| [Quantity sync](quantity-sync.md)           | Sync lines and switches, computing channel quantities, writes, conflicts, safety       |
| [Marketplace orders](marketplace-orders.md) | Replacing Marketplace Connect: orders, status, cancellations, refunds, prices          |
| [Scopes and roles](scopes.md)               | Every Shopify scope, Amazon role and eBay scope each feature needs                     |
| [Stock flow page](stock-flow-ux.md)         | How the setup is shown, edited and audited                                             |
| [Data model](data-model.md)                 | Tables, jobs, actions and migrations                                                   |

## Decisions

Made on 2026-09-28.

| Topic                         | Decision                                                                                                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Master count                  | **Shopify or Copacker**, one per workspace. Marketplaces (eBay, Amazon FBM, later others) are always fed from the master, never masters themselves. An eBay-only seller such as Unic keeps its master in Copacker.                     |
| Edits made outside the master | **Overwritten.** A quantity changed directly on a channel that isn't the master (in eBay, Seller Central, or Shopify when Copacker is the master) is set back to the master's number, and Copacker records the difference.             |
| Accounts                      | **One account per platform per workspace**, as today. The model is a graph, so a second store that shares stock can be added later.                                                                                                   |
| Settings UX                   | A **Stock flow page** of its own: a map of where counts come from, which stock each channel sells and who syncs each line, edited in side panels, with each line's history. Free-form canvas editing is a later step on the same model. |
| When B2B orders hold stock    | **When the supplier accepts the purchase order.** Accepted units stop selling on the supplier's other channels. Accepting a shipment's commercial invoice takes them off the count, as today.                                         |
| Receiving mismatches          | **Recorded only, like Shopify:** the receiver enters received and rejected units per line. Rejected units never enter stock. No supplier confirmation or credit for now.                                                              |
| Closing a purchase order      | **The buyer closes it**, as today.                                                                                                                                                                                                    |
| Incoming in Shopify           | **Copacker writes it**, through Shopify inventory transfers.                                                                                                                                                                          |
| Purchase order owner          | **The workspace picks Copacker or Shopify**, once Shopify's purchase order API exists. Copacker until then.                                                                                                                           |
| Marketplace Connect           | Copacker takes over **inventory, orders, order status, cancellations, refunds and prices**, plus **copying FBA orders into Shopify** for reporting. Not listing creation, not Amazon MCF.                                             |
| Cancellations and refunds     | **Marketplace to Shopify only.** A cancelled or refunded Amazon or eBay order is still copied into Shopify (when orders sync is on) and marked cancelled or returned there.                                                            |
| Sync switches                 | Every sync line can be **switched off or handed to another app**, such as Marketplace Connect.                                                                                                                                        |
| More marketplaces             | No named list. Channels share one adapter contract, so Walmart, TikTok Shop, Etsy or Faire can be added.                                                                                                                              |
| 3PLs                          | **Out of scope.** 3PL locations in Shopify keep today's counting.                                                                                                                                                                     |

## Vocabulary

- **Master:** the system whose count is right for the workspace's own stock: `shopify` or `copacker`.
- **Location:** a place that holds stock and has a count per item.
  - **Managed:** the business counts it, and its count lives in the master. A Shopify merchant location, or a Copacker
    location.
  - **Reported:** someone else counts it and reports the count: Amazon FBA and AWD. Copacker reads it and never writes
    it.
  - **Mirror:** a copy of a reported location inside another system, such as the Amazon app's location in Shopify.
    Never counted, so nothing is counted twice.
  - **Excluded:** not counted at all, such as Shopify Collective.
- **Channel:** somewhere customers buy: the Shopify store, Amazon FBA offers, Amazon FBM offers, eBay, and B2B purchase
  orders for suppliers. A channel sells from one or more locations.
- **Listing:** one sellable thing on a channel (an eBay item or variation, an Amazon seller SKU), linked to one item.
- **Sync line:** one kind of data flowing between two nodes, such as quantities from the master to eBay. Each line has an
  **owner**: Copacker, another app, the platform itself, or nobody (off).
- **Movement:** a recorded change to a managed location's count, with its cause: received, sold, held, shipped B2B,
  adjusted.
- **Hold:** units promised to an accepted B2B purchase order that haven't shipped.
- **Available:** units that can still be sold: on hand, less committed orders, holds and anything else the master sets
  aside.

## Phases

**Phase 1, stock model (read-only).**

- Store the workspace's master and purchase order owner.
- Replace the location classification with location roles.
- Let supplier workspaces connect eBay (and later Shopify and Amazon).
- Read marketplace listings and link them to items.
- Declare every sync line's owner.
- Ship the Stock flow page with validation.
- Copacker writes nothing to any platform in this phase.

**Phase 2, two-way quantity sync and receiving.**

1. **Copacker ledger:** stock levels, movements and holds for Copacker-master workspaces. Supplier stock moves into it.
   Suppliers accept or decline purchase orders.
2. **Sync engine:** outbox, platform adapters, reconciliation and audit history.
3. **eBay:** eBay quantities and eBay sales for Copacker-master workspaces. Unic goes live here.
4. **Amazon FBM:** FBM quantities and FBM sales.
5. **Shopify master:**
   - The receiving page, Shopify incoming through transfers, and Amazon receipts read into shipments.
   - Marketplace sales taken off Shopify stock.
   - Channel quantities pushed from Shopify locations.
   - B2B holds through Shopify's reserved quantity.
6. **Copacker master with the Shopify store as a channel.**

**Phase 3, marketplace orders.**

- Marketplace orders created in Shopify, with fulfillment and tracking going back to the marketplace.
- Cancellations and refunds copied into Shopify.
- Prices pushed to marketplaces.
- FBA orders copied into Shopify.
- A per-line switch-over from Marketplace Connect.

**Phase 4, Shopify purchase orders.** The purchase order owner setting gains Shopify, behind an adapter. This waits on
Shopify's API: the 2026-07 Admin API has no purchase order object.

**Deferred:**

- 3PL integrations.
- Several accounts per platform, including a second store sharing stock.
- Incoming at FBA or AWD shown in Shopify (see [Purchase orders](purchase-orders.md#fba-and-awd-incoming-in-shopify)).
- Amazon marketplaces outside the US.
- Amazon multi-location FBM (supply sources).
- Creating marketplace listings.
- Amazon MCF.

**First slice.** Unic Fencing is a supplier that sells only on eBay and wants B2B purchase orders to take from the same
count. It needs:

- from Phase 1: supplier eBay connection, listing links, the master setting and the map;
- from Phase 2: the ledger with the accept step, the sync engine and eBay.

It is the smallest end-to-end path: Copacker is the master, with one location and one channel, and B2B holds on top.
Build it first.

## Open questions

Each has a recommendation; none is decided.

1. **Copacker locations:** one per workspace in Phase 2, or several? Recommended: one ("Stock"), with several later.
   Suppliers today have a single count per product.
2. **Buyers without Shopify:** a Copacker master for a buyer needs Copacker products for buyers. Today, purchase order
   lines require Shopify variants and `orders.shopifyDomain` is required. Recommended: support Copacker master for
   supplier workspaces in Phase 2, and for buyers once there's a buyer catalog.
3. **Marketplace sales with a Shopify master before Phase 3:** Copacker lowers the Shopify location's available units
   for each eBay or FBM order line, and restores them on cancellation. The order stays fulfilled from the marketplace,
   with no Shopify order until Phase 3. Recommended: yes.
4. **A channel selling from several locations:** which location a sale comes from. Recommended: a priority list per
   channel. The first location with enough available units takes the sale; otherwise the first location, which may go
   negative.
5. **Seeding a Copacker master from eBay:** when Unic turns on its master, fill the counts from eBay's listing
   quantities per SKU, showing conflicts (the same SKU on two listings with different quantities) for a person to pick.
   Recommended: yes, once, before any sync line is turned on.
6. **Supplier corrections:** when a shipment goes back for correction, its taken units return to on hand. Recommended:
   they are held again for the purchase order (not released to eBay), since the shipment will be invoiced again.
7. **Declined purchase orders:** recommended: the buyer can edit and send again, or close.
8. **Canvas rendering:** the map needs either a graph library such as `@xyflow/react` (a new dependency, which needs a
   discussion under the repo's rules) or plain SVG with fixed lanes. Recommended: fixed lanes in SVG first.
9. **History retention:** recommended: keep movements forever (they are the ledger), and sync write history for 400
   days.
10. **Buyer and supplier in one workspace:** Unic may also buy from its own manufacturers. Recommended: out of scope. The
    ledger is the same for both kinds, so a combined workspace can come later.
11. **Prices for Copacker-master channels:** where Unic's eBay prices come from if Copacker pushes prices (Phase 3).
    Recommended: the variant's retail price in Copacker.
12. **Marketplace taxes on orders copied into Shopify:** eBay and Amazon collect and remit sales tax as marketplace
    facilitators. Recommended: record tax lines on the Shopify order marked as collected by the marketplace. Verify what
    Marketplace Connect does so reports match.
13. **Amazon restricted data:** FBM shipping addresses need the Direct-to-Consumer Shipping (Restricted) role, which
    Amazon approves sparingly. Recommended: if it isn't granted, FBM orders are still copied into Shopify for stock and
    reporting, but shipped from Seller Central.
