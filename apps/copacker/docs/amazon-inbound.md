# Amazon inbound shipments

A PO's destination is `amazon`, and each line names its Amazon network (`amazonNetwork`): FBA (the default) or AWD US.
A line starts with its product's Amazon warehouse setting (Products, Edit) and can be changed on the PO. The network
decides how the supplier packs the line's cartons, so the PO and checklist give each network's carton rules and say on
each line which network it's packed for. AWD China is left out until it's clear how it's booked.

Submitting a PO creates a separate packing draft for each network. Each draft lists only that network's products,
so the supplier can upload and submit the AWD packing list while FBA cartons are still being prepared. Older drafts
that do not yet have a network split their cartons at packing submission, copying the invoice to each shipment. Every
shipment has its own packing, Amazon job, labels, release and supplier packet.

## AWD US (`awd_us`)

One AWD inbound order per shipment, with the reference `copacker-{shipmentId}-{revision}`. The job checks eligibility,
creates and confirms the order, then downloads Amazon's SSCC carton labels and matches each page to a carton by SKU,
FNSKU and units. AWD cartons hold one SKU, at most 150 units, packed the same way per SKU.

### Link an existing AWD shipment

The buyer can enter an existing `STAR-�` shipment ID on an AWD packing draft. Copacker verifies it belongs to the
connected seller, is still `CREATED`, and contains only this PO's AWD products within the ordered quantities. The same
Amazon shipment cannot be linked twice in a buyer workspace. Linking or removing a link saves any incomplete packing
first. Suppliers cannot change the link.

On packing submission, the worker checks the existing shipment's pickup location and every carton's contents, count,
size and weight against the packing list. Measurements are compared in metric units (1 mm and 10 g precision), allowing
rotated dimensions and regrouped identical cartons. It then downloads and matches the existing labels. It does not
create, confirm or cancel an Amazon order. Corrections retain the link and repeat these checks; carrier labels and
packet release follow the ordinary workflow.

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
5. Book the buyer's own carrier (small parcel when offered, or less than a truckload for cartons on pallets),
   confirming the first delivery window that starts on or after the ready date, or the latest Amazon offers. The buyer
   can move the window in Seller Central until the shipment closes. Cartons on pallets send each Amazon shipment's
   pallets and the goods' declared value; see [packing](packing.md#what-amazon-gets).
6. Download each box's label on plain paper and match boxes to cartons by contents, then size and weight.
7. For cartons on pallets, download each Amazon shipment's pallet labels; see [packing](packing.md#pallet-labels).

Mixed-SKU cartons are allowed. The [carton table](packing.md#the-carton-table) shows every product and quantity in each
carton, with Add product and individual removal. Saving, reopening, duplicating and counting cartons preserve all their
contents.
AWD cartons keep one product. Cartons are limited to 63.5 cm a side and 22.68 kg unless one holds a single unit.

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

A failed `amazon` job puts the shipment in Needs attention with the error as its issue, such as the reasons Amazon gave
for finding AWD cartons ineligible or rejecting the order. No Amazon error code is handled specially and nothing retries
by itself; the buyer retries with **Retry shipment** (`shipment.retry`). For example, Amazon rejects a new AWD order
with `CAPACITY_UNAVAILABLE` while the account's AWD capacity is taken, such as by open AWD shipments that haven't
arrived. Smaller cartons don't help; retry once capacity frees.

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


## Future improvement: FBA capacity preflight

Research checked October 18, 2026. No documented public SP-API endpoint exposing the Capacity Monitor's live
capacity limit, usage, and remaining volume was identified. Automatic capacity retrieval remains an unverified
dependency, not an available integration.

- [Catalog Items getCatalogItem](https://developer-docs.amazon.com/sp-api/reference/getcatalogitem) returns package
  dimensions. Estimate volume from sellable-unit dimensions and quantities, not outer cartons. Missing dimensions
  must remain unknown.
- [getItemEligibilityPreview](https://developer-docs.amazon.com/sp-api/reference/getitemeligibilitypreview) checks
  ASIN eligibility, but takes no shipment quantity and does not guarantee remaining space.
- Inbound plan creation and its asynchronous operation result provide shipment-specific validation. Surface
  capacity errors such as FBA_INB_0132 before placement or transport charge approval.
- [Capacity Monitor](https://sellercentral.amazon.com/help/hub/reference/external/GAFNWEYTJUV2GBFC) remains the
  source for limits and usage. A manually supplied figure needs a checked-at timestamp and an estimate label.
  Passing a local comparison does not reserve capacity.

If a supported capacity endpoint becomes available, refresh by seller, marketplace, storage type and period.
Show freshness and estimated shipment volume versus available space. Revalidate before booking. Never silently
reduce quantities, change physical packing, or accept charges to pass validation.
