# Purchase orders and receiving

Part of the [inventory sync spec](README.md). How purchase orders hold, add to and receive stock. The supplier's accept
step and the receiving changes ship in Phase 2; the Shopify purchase order owner is Phase 4.

## Today

What exists before this spec, so the changes are clear:

- **Statuses:**
  - A purchase order is `draft`, `submitted` or `closed`. There is no cancel after sending.
  - A shipment moves through packing, approval, queued, creating, waiting_labels, ready, shipped, forwarded and
    received, plus correction, needs_attention and cancelled.
- **Receiving:** one "Mark received" button with no quantities. It changes no count anywhere. Amazon's own receipt
  status is never read for purchase order shipments.
- **Closing:** the buyer closes the purchase order by hand, only once every shipment is received or cancelled.
- **Destinations:** a destination is an Amazon network or a delivery address. The address can be linked to a Shopify
  location (`contacts.shopifyLocationId`), which is looked up when the purchase order is read.
- **Supplier stock:** it is reserved when the purchase order is sent (`openDemand`), and taken when a shipment's
  commercial invoice is accepted (`takeSupplierStock`). A correction returns it.

## Supplier acceptance

**A new step for suppliers on Copacker.** A purchase order sent to a supplier with a Copacker workspace waits for the
supplier to accept or decline it.

- **Statuses** become `draft`, `submitted`, `accepted`, `declined` and `closed`.
  - `submitted` now means sent and awaiting the supplier.
  - A supplier without a Copacker workspace can't accept, so its purchase orders become `accepted` as soon as they're
    sent. The buyer runs them as today.
- **Before accepting**, the supplier can read the purchase order, propose changes (the existing order proposals), accept
  or decline. Packing needs an accepted purchase order.
- **Accept:**
  - Checks that each tracked product has enough available units (on hand − committed − held). If one doesn't, the
    accept is refused with the short lines, as sending is refused today. The supplier then proposes changes instead.
  - When it passes, a hold is created for every tracked product on the purchase order.
  - The supplier's channels drop by the held units ([quantity sync](quantity-sync.md)): eBay shows fewer as soon as Unic
    accepts.
- **Decline:** the supplier gives a reason, and nothing is held. The buyer can edit and send again, or close (open
  question 7).
- **Sending:**
  - Still refused when the supplier is short, using available units, but no longer reserves anything.
  - `openDemand` is replaced by holds.
  - A sent purchase order that isn't accepted doesn't reduce what the supplier's channels can sell.
- **Holds follow the purchase order:**
  - An approved change of quantity raises or lowers the hold. A raise is refused if the supplier is short.
  - Accepting a shipment's commercial invoice takes the packed units off on hand and releases that much of the hold, so
    available doesn't change.
  - A correction puts the taken units back on hand and holds them again (open question 6).
  - Closing releases whatever is still held.
- **With a Shopify master (supplier), holds go through Shopify's quantities:**
  - A hold moves units from `available` to `reserved` at the supplier's location (reason `reservation_created`, ledger
    document `gid://copacker/PurchaseOrder/{id}`).
  - Taking lowers `reserved`, which lowers on hand.
  - Releasing moves the units back (reason `reservation_deleted`).
- **Who can accept:** supplier members who can edit purchase orders ([roles](../../permissions.md)).
- **Timeline events:** `purchaseOrderAccepted`, and `purchaseOrderDeclined` with its reason.

## Incoming in Shopify

**Applies to:** a Shopify master, and a purchase order to one of the buyer's own locations.

Shopify doesn't let apps set `incoming` directly; it comes from Shopify's transfers and Shopify's own purchase orders.
Copacker uses a transfer. Shopify's transfers accept an external origin such as a supplier, with no origin location.

**Setup:**

- **When:** the purchase order is accepted (on sending, for suppliers not on Copacker).
- **The transfer:** Copacker creates a Shopify inventory transfer with:
  - no origin location;
  - destination: the delivery address's Shopify location;
  - reference: the purchase order number;
  - tag: `Copacker`;
  - a note linking back to the purchase order.
- **Its lines:** each inventory item with its units. A bundle's line becomes its components.
- **Which address:** sending refuses a purchase order whose address isn't linked to a Shopify merchant location
  ([validation 3](stock-model.md#validation)). The location is saved on the purchase order at that moment, so a later
  edit to the address doesn't move open stock.

**Keeping the transfer in step:**

- **When a shipment ships** (marked shipped, or forwarded), Copacker adds an in-transit shipment to the transfer with its
  packed units, carrier and tracking number.
- **Purchase order changes:** a new revision that changes quantities updates the transfer's lines.
- **Closing:**
  - Units that never shipped are removed from the transfer.
  - Units that shipped but were never received are marked canceled (the canceled receive action, Admin API 2026-10).
- **Restock:** reads Shopify's `incoming` less the open units on Copacker's own transfers, because it already counts
  those purchase order units. Without this, each unit would be counted twice.

**Verify in a development store before building:**

1. **When Incoming appears.** Does a transfer with no origin show Incoming at the destination once it's ready to ship,
   or only when a shipment is in transit?
   - Goal: all accepted units show as Incoming from acceptance.
   - If Shopify only counts in-transit shipments, unshipped units show as incoming in Copacker only.
2. **Transfer webhooks.** Which topics are sent when someone receives a Copacker transfer in Shopify admin, or whether
   Copacker has to poll.
3. **Editing a transfer.** How a transfer's lines are edited after it's ready to ship.

**Copacker master:** incoming stays in Copacker, computed from open purchase orders.

## Receiving at your own locations

**The Receive page replaces "Mark received"** for shipments to the buyer's own locations. It opens from a shipment that
is shipped, forwarded or receiving.

- **Rows:** one per inventory item, with columns for shipped, already received, received and rejected. "Receive all"
  fills received with what's still expected.
- **Saving:**
  - Saving records a receipt (who, when, each line's received and rejected units). The shipment becomes `receiving`.
  - Several receipts are allowed, for goods that arrive in parts.
- **Finish receiving:**
  - Moves the shipment to `received`.
  - Units shipped but neither received nor rejected are recorded as short.
  - Received beyond shipped is recorded as extra and enters stock.
- **Rejected units never enter stock**, as in Shopify.
- **Mismatches are only recorded:** short, extra and rejected show on the shipment and in the close summary. There is no
  supplier confirmation or credit for now.
- **Mistakes:** until receiving is finished, a receipt can be reversed, which writes the opposite change. After that, a
  wrong count is corrected in the master like any other count.
- **Effect by master:**
  - Shopify: `inventoryShipmentReceive` on the transfer's shipment, with the accepted and rejected units. Shopify moves
    accepted units from incoming to available and drops rejected ones.
  - Copacker: a `received` movement of the accepted units at the destination location.
- **Receiving in Shopify admin also counts.** If someone receives a Copacker transfer in Shopify, Copacker reads it back
  into the shipment as a receipt from Shopify. Whichever side records a unit first wins, and the other side shows it.
- **Who can receive:** buyer members who can edit shipments.
- **Timeline events:** `shipmentReceiving` (per receipt, with its totals), and `shipmentReceived` (on finishing, with
  received, rejected, short and extra totals).

## Receiving at Amazon

FBA and AWD count their own stock, so Copacker never adds it. It reads Amazon's receipts into the shipment instead.

- **FBA:**
  - For each Amazon shipment ID of the inbound plan (a plan can split), `GET /fba/inbound/v0/shipments/{id}/items`
    gives `QuantityShipped` and `QuantityReceived` per seller SKU.
  - `GET /fba/inbound/v0/shipments` gives `ShipmentStatus`: WORKING, READY_TO_SHIP, SHIPPED, IN_TRANSIT, DELIVERED,
    CHECKED_IN, RECEIVING, CLOSED, CANCELLED, DELETED or ERROR.
  - Inbound 2024-03-20 doesn't: its `listShipmentItems` has no received quantity (checked against Amazon's API model
    on 2026-09-28), so receipts come from v0.
- **AWD:** `GET /awd/2024-05-09/inboundShipments/{id}?skuQuantities=SHOW` gives expected and received quantities per
  SKU, and `shipmentStatus` (CREATED, SHIPPED, IN_TRANSIT, RECEIVING, DELIVERED, CLOSED or CANCELLED).
- **Units:** Amazon counts sellable units. Copacker converts them to units per the line's pack size.
- **When Copacker reads:**
  - Every 6 hours for each Amazon shipment that is shipped, forwarded or receiving.
  - When its page opens (cached for 2 minutes, like the Shipments list).
  - In the daily reconcile.
  - Amazon sends no inbound shipment notifications that the app subscribes to.
- **Status:**
  - The shipment becomes `receiving` once Amazon reports it delivered, checked in or receiving, or reports any units
    received.
  - It becomes `received` once every Amazon shipment in it is closed or cancelled.
  - The buyer can finish receiving by hand after Amazon reports it delivered, keeping Amazon's counts at that time.
  - Receipts from Amazon are saved with source `amazon`. Short is shipped less received. Amazon reports no rejected
    units.
- **Out of scope:** Amazon's own reconciliation and claims.

## Closing

The buyer closes the purchase order, as today.

- **The summary:** closing shows ordered, shipped, received, rejected, short and extra units per line.
- **When it's allowed:** today's rules, so every shipment must be received or cancelled.
- **What closing does:**
  - Releases any supplier holds.
  - Removes or cancels whatever is left on Copacker's Shopify transfer.
  - Drops the purchase order out of incoming and on order, as today.

## FBA and AWD incoming in Shopify

Deferred. Here is what's known.

- **FBA:**
  - The Amazon app's location in Shopify is managed by that app, which posts FBA stock into it.
  - Copacker could add an in-transit transfer into that location so Shopify shows Incoming. When Amazon closes the
    shipment, Copacker would mark the transfer's units canceled rather than received, so the Amazon app alone posts the
    real stock.
  - Whether Shopify accepts a transfer into a location another app manages is unknown. Test it in a development store.
- **AWD:** it has no Shopify location. Showing its incoming needs a location Copacker creates as a fulfillment service
  (`write_fulfillments`). Shopify might then route customer orders to it, so it also needs the location kept out of
  order routing, which also has to be verified.
- **Decision:** leave both out until a store asks, and keep Amazon incoming in Copacker, where restock already reads it.

## Purchase order owner

A workspace setting: `copacker` (the default, and the only choice until Shopify publishes a purchase order API) or
`shopify`.

- **Copacker owner:**
  - Purchase orders live in Copacker.
  - Until Shopify's API exists, Shopify sees them as transfers (Incoming, receipts).
  - Once it exists, Copacker creates a real Shopify purchase order instead, so Shopify's purchase order list, Incoming
    and receiving are native.
  - Transfers already open finish as transfers.
- **Shopify owner (Phase 4):**
  - Purchase orders made in Shopify appear in Copacker when they're marked ordered. Each is linked to a Copacker
    supplier by the Shopify supplier name, or linked by hand.
  - New purchase order in Copacker creates the purchase order in Shopify first.
  - The supplier workflow (acceptance, proposals, packing, invoices, documents, forwarders, Amazon inbound) runs in
    Copacker.
  - Approved changes and receipts are written back to the Shopify purchase order. Shopify then updates Incoming and
    Available itself, with no transfer.
  - Purchase orders to Amazon stay in Copacker until Shopify purchase orders can have an Amazon destination.
- **Adapter:** purchase order storage sits behind one contract.
  - Operations: create, update lines, mark ordered, receive (accepted and rejected per line), close, cancel, and list
    changes since a cursor.
  - It reports what the platform supports, so the page can hide what a Shopify purchase order can't do.
  - The contract is written against Shopify's API when it appears. The Admin API 2026-07 has no purchase order object.
