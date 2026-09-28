# Amazon inbound shipments

A PO's destination is `amazon`, and each line names its Amazon network (`amazonNetwork`): FBA (the default) or AWD US.
A line starts with its product's Amazon warehouse setting (Products, Edit) and can be changed on the PO. The network
decides how the supplier packs the line's cartons, so the PO and checklist give each network's carton rules and say on
each line which network it's packed for. AWD China is left out until it's clear how it's booked.

When the supplier submits packing, each carton must hold products for one network, following that network's rules.
Submitting (or approving invoice changes) splits the cartons into one shipment per network: the shipment keeps the first
network's cartons (FBA, then AWD US) and each other network's become a new shipment with the same ready date, pickup
address and invoice. Each shipment records its `amazonNetwork`, gets its own `amazon` job, labels, shipping-label upload,
release and packet. The job creates the shipment in Amazon and fetches a label for every carton; the shipment then waits
for the buyer's carrier labels, the same way for both networks.

## AWD US (`awd_us`)

One AWD inbound order per shipment, with the reference `copacker-{shipmentId}-{revision}`. The job checks eligibility,
creates and confirms the order, then downloads Amazon's SSCC carton labels and matches each page to a carton by SKU,
FNSKU and units. AWD cartons hold one SKU, at most 150 units, packed the same way per SKU.

## FBA (`fba`)

One inbound plan (Fulfillment Inbound 2024-03-20) per shipment, named `cp-{shipmentId without dashes}-{revision}`
(Amazon allows 40 characters). Amazon does each step in the background; the job starts it, waits on its operation and
runs again, reading the plan to find where it is:

1. Create the plan with each SKU's sellable units.
2. Confirm the packing option with the fewest packing groups (then lowest fees) that keeps each carton's products in one
   group. When none does, the shipment needs attention: the supplier repacks those products separately.
3. Send each carton as a box with its size, weight and contents.
4. Confirm the placement with the lowest fees (then fewest shipments). A plan can split into several Amazon shipments;
   `amazonShipmentId` lists the ones its cartons travel in, comma-separated, and each carton label records its own.
5. Book the buyer's own carrier (small parcel when offered), confirming the first delivery window that starts on or after
   the ready date, or the latest Amazon offers. The buyer can move the window in Seller Central until the shipment closes.
6. Download each box's label on plain paper and match boxes to cartons by contents, then size and weight.

Mixed-SKU cartons are allowed. Cartons are limited to 63.5 cm a side and 22.68 kg unless one holds a single unit.

## Origin

Amazon collects from the supplier's pickup address, or, for a PO with a forwarder stop on the way (`via`), from that
forwarder address, which then needs a phone number. The supplier's packing list and checklist keep its own pickup
address.

## Prep and labels

Both networks take each SKU's prep category and owner constraints from Amazon's record
(`GET /inbound/fba/2024-03-20/items/prepDetails`). Amazon reads only the first of repeated `mskus` parameters, so they're
sent comma-separated. AWD gets the category (`NONE` becomes `NO_PREP`); FBA gets the prep and label owner the
constraints allow, the supplier otherwise. An FBA SKU without a record, or with category `UNKNOWN`, has to be set up in
Seller Central first. The PO line's preparation remains the supplier's instruction.

## Failures and cancellation

A create request Amazon rejects outright (4xx) returns the shipment to unsent so it can be retried. Any other failure
after the request leaves the outcome unknown; the buyer links the existing AWD order (`STAR-…`) or inbound plan (`wf…`)
with `shipment.reconcile`, which checks its reference or name. `shipment.cancelAmazon`, from a shipment in correction,
cancels the AWD order or voids the inbound plan and marks the shipment cancelled once Amazon confirms.

Amazon rejects a new AWD order with `CAPACITY_UNAVAILABLE` while the account's AWD capacity is taken, such as by open
AWD shipments that haven't arrived. Smaller cartons don't help; the shipment stays in Needs attention until capacity
frees and it's retried.

## Seller Central links

For the buyer, each Amazon shipment ID opens the shipment in Seller Central: the shipment page's title (one link per
Amazon shipment when an FBA plan splits) and the Shipments list. Seller Central opens either page on the shipment's
events:

- FBA: `https://sellercentral.amazon.com/fba/inbound-shipment/summary/{FBA shipment ID}`
- AWD: `https://sellercentral.amazon.com/awd/inbound-shipment/{STAR shipment ID}`

The supplier can't open the buyer's Seller Central, so it sees the IDs as text.

## Shipments list

The buyer's Shipments list shows every inbound shipment in its connected Amazon account after its purchase order
shipments, whoever created them: FBA from `GET /fba/inbound/v0/shipments` in every status but deleted, AWD from
`GET /awd/2024-05-09/inboundShipments`. A shipment a purchase order shipment already shows isn't repeated. The list is
read from Amazon when the page loads and cached for two minutes; if Amazon can't be read, the page says so and shows the
purchase order shipments. Open shipments come first, then FBA before AWD, newest first (FBA lists no dates, so its
shipment IDs order it).
