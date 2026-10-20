# Amazon case packs

Copacker doesn't send case packs to FBA today: every FBA carton is individual units. This page records what case packs
are, how Amazon takes them, and what supporting them would need. Researched October 19, 2026.

## What a case pack is

Amazon has two packing types for FBA ([individual products vs. case-packed products](https://sellercentral.amazon.com/help/hub/reference/external/G200257960?locale=en-US)):

- **Individual units:** a box may mix SKUs and conditions and hold any number of units, and each box's contents are
  listed separately.
- **Case-packed:** usually the manufacturer's sealed case. Every box holds one SKU in one condition, every box of that
  SKU holds the same count (a case of 24 always holds 24), and a box holds at most 150 units. The case is described once
  (units per box, box size and weight), then the number of boxes. A case pack isn't a multi-pack: its units are sold
  one by one.

What choosing case packs changes:

- The case's description stands in for each box's contents, so there's no box-content step for those SKUs.
- The warehouse scans one unit per box, since every box is the same.
- Amazon's placement doesn't split a case pack across shipments.

## How Amazon takes them

- **Send to Amazon (Seller Central):** packing is chosen per SKU. Its Packing details are individual units or a saved
  case-pack template (name, units per box, box size and weight, prep and labeling; up to three per SKU). A file upload
  carries the same thing in optional case-pack columns: the template generator's "Include extra columns for case pack
  information" option.
- **Fulfillment Inbound API 2024-03-20**, which Copacker's FBA booking uses
  ([Amazon inbound](amazon-inbound.md)): has no case-pack concept at all; the word doesn't appear in its
  [model](https://github.com/amzn/selling-partner-api-models/blob/main/models/fulfillment-inbound-api-model/fulfillmentInbound_2024-03-20.json).
  Each box is sent with its own contents, and identical boxes are a `quantity`.
- **AWD** takes nothing but case packs: every SKU uses one packing template per shipment
  ([choose inventory to send](https://sellercentral.amazon.com/help/hub/reference/GZLL7RYU2FJRN9BU?locale=en-US)).
  Copacker's AWD rules already hold every carton to that (see [carton rules](../../../packages/aisle/docs/carton-rules.md)).
- **AGL** is booked in Seller Central from an upload file, so case packs there would skip the box-content template
  step. The AGL booking design (board 10.03) has a "Single-SKU case packs" variation for this.

## Why Copacker doesn't support them yet

Copacker knows every carton's contents and sends them to Amazon itself, so the work case packs save in Seller Central
is already done. Through the API, case-packed and individual-unit boxes look the same. Supporting case packs would add
three rules (one SKU and condition, the same count in every box, 150 units at most) for little gain, so they were left
out, and the case-pack column of board 06.17 (Carton editor errors) became plain FBA.

## Later: ordering by the case

Many products ship in a known case, and buyers think in cases ("5 cases of body wires"). Product details already keeps
case packs per product (name, units, size and weight, `product_defaults.casePacks`), and restock rounds up to whole
cases with them. Supporting case packs could:

- Let a PO line be ordered in cases of a saved case pack, filling its units and each carton's size and weight.
- Add an FBA case-pack carton policy (`oneSku`, `samePacking`, `maxUnits: 150`, with FBA's size and weight) and send a
  line's cartons under it.
- Fill the case-pack columns of AGL's upload file.

Board 06.17 (Carton editor errors) first designed the errors for case-packed FBA cartons: the 150-unit limit, FBA's
size limit, and one SKU and condition per carton.
