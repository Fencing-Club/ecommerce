# Purchase order flow spec

Status: **mixed**. Each part is marked **Today** (what the code does, mapped on 2026-09-28), **Planned** (decided, not
built) or **Proposed** (not decided). The published page, [Copacker Purchase Order Flow](https://claude.ai/artifact/8nR5mRPPF1EFiiamh7HzHy),
shows the same content with an interactive route explorer. Every route's steps, gates, documents and closing are in
[routes.md](routes.md), generated from the page's route model.

It covers every route a purchase order can take from a supplier to your warehouse, FBA, AWD or Amazon's warehouses in
China: what's required at each phase, who does it, which gates stop it, where you act in Amazon, which documents it
needs, and when the shipment and the purchase order close. Stock counts and receiving are in the
[inventory sync spec](../inventory-sync/README.md).

## Decisions

Made on 2026-09-28.

| Topic                          | Decision                                                                                                                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shipping labels                | Each purchase order says **who arranges shipping**, and so who provides the shipping labels: the supplier, you, your forwarder or Amazon.                                                  |
| Several destinations           | One order can send lines to **FBA, AWD US and your warehouse**. Amazon lines start at FBA, and a product can be set to AWD. You confirm the packing differences before sending.            |
| Splitting a line               | One line's units can be **split across destinations**, for example 600 to FBA and 400 to your warehouse.                                                                                  |
| Warehouses and stops           | **One delivery address and one forwarder stop** per order, for now. The stop applies to every destination on the order.                                                                   |
| Bill of lading                 | **Whoever handles customs** uploads it to the shipment, or whoever arranges shipping for truck freight within the US. The upload is **optional for now** and never blocks anything.         |
| Commercial invoice             | **Copacker generates it** for every shipment. The supplier can upload its own instead.                                                                                                     |
| Combined shipments             | With a forwarder, **several shipments can be combined** and sent on together. The forwarder combines them, or you do for a forwarder not on Copacker.                                       |
| Freight on combined shipments  | Split across purchase orders by **chargeable weight**: each carton's actual or volumetric weight, whichever is greater, for the leg's mode.                                                 |
| Amazon Global Logistics        | Copacker does **as much of it as Amazon allows**, and prepares the rest for you.                                                                                                           |
| Amazon's warehouses in China   | **GWD becomes a destination.** Delivery requests stay in Seller Central until Amazon offers an API, linked to the shipment in Copacker.                                                    |
| Importer of record             | Your **EIN is stored in Copacker** and used wherever a document needs it.                                                                                                                  |
| Receiving and closing          | Received and rejected units per line, like Shopify, and **you close** the purchase order (inventory sync spec).                                                                            |

## Routes

| Route                                         | Status today      | Shipping arranged by | Steps in Amazon |
| --------------------------------------------- | ----------------- | -------------------- | --------------- |
| Supplier ships to your warehouse (Unic)       | Supported today   | Supplier             | 0               |
| Your carrier to your warehouse                | Partly supported  | You                  | 0               |
| Forwarder combines orders, then your warehouse | Not supported yet | Forwarder            | 0               |
| Supplier to FBA, your carrier                 | Supported today   | You                  | 4               |
| Supplier to FBA, Amazon's partnered carrier   | Not supported yet | Amazon               | 3               |
| FBA through Amazon Global Logistics           | Not supported yet | Amazon               | 7               |
| FBA through your forwarder                    | Partly supported  | Forwarder            | 3               |
| Supplier to AWD US, your carrier              | Supported today   | You                  | 3               |
| Amazon GWD in China                           | Not supported yet | Supplier             | 4               |
| AWD US, from China (Global Logistics)         | Not supported yet | Amazon               | 6               |
| AWD through your forwarder                    | Partly supported  | Forwarder            | 2               |
| FBA and AWD on one order                      | Supported today   | You                  | 4               |
| FBA, AWD and your warehouse on one order      | Not supported yet | You                  | 4               |

Each route's full steps, reasons and documents are in [routes.md](routes.md). "Steps in Amazon" counts what you do by
hand in Seller Central or Global Logistics.

## Shipping arranged by

Planned. A purchase order field that decides the label and tracking gates.

| Value     | Typical Incoterm             | Shipping labels from                        | What Copacker waits for                                        | Default on                       |
| --------- | ---------------------------- | ------------------------------------------- | -------------------------------------------------------------- | -------------------------------- |
| Supplier  | `DAP`, or `DDP` across a border | The supplier's own carrier                  | Nothing from you; the supplier enters carrier and tracking     | Your warehouse, direct           |
| You       | `EXW` or `FCA`               | You upload one per carton                   | Your labels before the packet is released                      | FBA and AWD, direct (today)      |
| Forwarder | `EXW` or `FOB`               | The forwarder, for the onward leg           | The forwarder's carrier and reference when it forwards         | Every route through a forwarder  |
| Amazon    | Set in the Global Logistics booking | Amazon's partnered carrier, or none for Global Logistics | The fetched labels, or the Global Logistics booking number     | Global Logistics routes          |

An Incoterm field on the purchase order is proposed, printed on the purchase order and invoice and checked against who
arranges shipping. Labels on the goods follow the destination, not this field: Amazon needs FNSKU unit labels and
Amazon's carton labels; your warehouse needs neither unless a product is set to get SKU labels.

## One order, several destinations

Planned. Today FBA and AWD already share an order: each line takes its product's Amazon warehouse setting (FBA unless set
to AWD) and packing splits the shipment by network. Planned:

- Each line gets a destination: FBA, AWD US or your warehouse, and a line's units can be split across them. The order
  keeps a default for new lines. One delivery address and one forwarder stop per order.
- When an order has more than one destination, or any AWD line, sending shows the packing rules below and you confirm
  them. The supplier sees each line's destination and rules on the purchase order, the email and the checklist.
- One destination per carton. Submitting packing splits the shipment by destination; each follows its own route.
- In the data, the line's `amazonNetwork` becomes a list of destinations with their units (`fba`, `awd_us`,
  `warehouse`), a delivery address is required when any line goes to your warehouse, and each shipment records its
  destination.

| Rule                   | FBA                                                        | AWD US                                   | Your warehouse                            |
| ---------------------- | ---------------------------------------------------------- | ---------------------------------------- | ----------------------------------------- |
| Products per carton    | Mixed, if they fit one Amazon packing group                | One SKU per carton                       | Mixed                                     |
| Carton size and weight | At most 63.5 cm a side and 22.67 kg, unless one unit       | At most 63.5 cm a side and 22.67 kg      | No limit                                  |
| Units per carton       | No limit                                                   | At most 150                              | No limit                                  |
| Cartons of one SKU     | Can differ                                                 | Must match in contents, size and weight  | Can differ                                |
| Unit labels            | FNSKU on every unit                                        | FNSKU on every unit                      | Only for products set to get SKU labels   |
| Unit prep              | Amazon's prep category, such as a polybag with a warning   | Amazon's prep category                   | Your instructions                         |
| Carton labels          | Amazon's box label                                         | Amazon's SSCC label                      | None                                      |
| Trucks                 | Can share with other FBA freight                           | Never share a trailer with FBA freight   | Your carrier's rules                      |

## Combined shipments

Planned. Today each shipment is forwarded on its own.

- Each shipment goes shipped, at the forwarder, combined, received. The combined shipment goes open (adding
  shipments), departed (carrier, freight, bill of lading), received.
- Shipments combine when they're at the same forwarder, for the same buyer, going to the same place. FBA and AWD never
  combine, because AWD trailers take only AWD freight.
- For FBA or AWD, Copacker creates one Amazon inbound from the forwarder's address with every member's cartons when the
  forwarder closes the combined shipment, and you release its carton labels to the forwarder. Today the inbound is
  created as each supplier submits packing.
- Freight is split across the members' purchase orders by chargeable weight: ocean counts 1 cubic meter as 1,000 kg,
  air divides cm³ by 6,000, courier by 5,000, and truck freight uses actual weight. The onward leg records its mode.
  Duties and tariffs split by customs value, and insurance by value.
- Members can be added or removed until it departs. Receiving it receives every member.
- Data: a `consolidations` table (buyer, forwarder, destination, status, carrier, reference, freight, mode, Amazon IDs)
  and `shipments.consolidationId`, with its own packing list.

## Amazon Global Logistics

Planned. Amazon has no API for booking Global Logistics; its AWD guide says to create the inbound through the API and
book Global Logistics separately. Global Logistics ships from China (and from Vietnam's ports to FBA).

- **Copacker:** creates the FBA inbound plan or AWD inbound order from the supplier's China address through the API
  (for AWD, preferring a region Global Logistics delivers to, east or west); fetches Amazon's carton labels; generates
  the commercial invoice and packing list with HS codes and your EIN; prepares a booking sheet (cargo ready date,
  cartons, volume, weight, Incoterm, pickup address, shipper, importer of record, destination contact, ISF parties);
  records the booking number; shows Amazon's inbound status and receipts; keeps the bill of lading.
- **You, in Seller Central:** set up Global Logistics once (account, payment method, importer of record, bond); book
  and accept the charges; upload the invoice and packing list; pay; download the bill of lading.

## Amazon's warehouses in China (GWD)

Planned as a destination. Global Warehousing and Distribution is Amazon's bulk storage in China: Shenzhen (April 9,
2026), Shanghai (July 16, 2026) and Ningbo. There's no GWD in Vietnam. You create a delivery request in Seller Central
(no documented API), the supplier delivers inside China, and Amazon replenishes FBA from it through Global Logistics.
Amazon quotes storage up to 45% cheaper than AWD in the US. Copacker packs the cartons, generates the documents, and
links the delivery request and Amazon's carton labels to the shipment. The shipment closes when GWD receives it; customs
happens later, when Amazon moves stock to the US, with you as importer of record. GWD's carton rules still need
checking.

## Parties and access

Today. A supplier or forwarder that isn't on Copacker can't act, so you do its steps.

| Action                                            | You                                   | Supplier on Copacker          | Forwarder on Copacker |
| ------------------------------------------------- | ------------------------------------- | ----------------------------- | --------------------- |
| Draft, send, delete a draft, close                | Yes                                   | No                            | No                    |
| Propose changes                                   | No                                    | Yes, until a shipment submits | No                    |
| Approve changes, approve invoice changes          | Yes, with price access                | No                            | No                    |
| Pack, upload the invoice, correct a shipment      | Yes                                   | Yes                           | No                    |
| Retry, link or cancel an Amazon shipment          | Yes                                   | No                            | No                    |
| Upload shipping labels, release                   | Yes                                   | No                            | No                    |
| Mark shipped                                      | Only for a supplier not on Copacker   | Yes                           | No                    |
| Forward, with freight cost                        | Only for a forwarder not on Copacker  | No                            | Yes                   |
| Mark received, close                              | Yes                                   | No                            | No                    |
| Comment                                           | Yes                                   | Yes                           | No                    |

Forwarders see sent purchase orders that name them, on a Purchase orders page only, and can read the invoice, packing
list and labels.

## Statuses

- **Purchase order:** draft, sent (awaiting the supplier), accepted (planned), closed by you; sent can become declined
  (planned), then edited and sent again, or closed.
- **Shipment to Amazon:** packing, approval (if prices changed), queued, creating, waiting for labels, ready, shipped,
  forwarded (with a stop), receiving (planned), received.
- **Shipment to your warehouse:** packing, approval, ready (no release step), shipped, at the forwarder (planned),
  forwarded, receiving (planned), received.
- **Side states:** correction, needs attention, cancelled. A shipment in correction with no Amazon order can't be
  cancelled today and blocks closing.

## Gates

| Gate                                                                                             | Blocks                     | Status   |
| ------------------------------------------------------------------------------------------------ | -------------------------- | -------- |
| Products exist in Shopify, ASINs match Amazon                                                    | Saving a draft             | Today    |
| The supplier has the units available (suppliers on Copacker with tracked stock)                  | Saving and sending         | Today    |
| Amazon connected and every SKU listed                                                            | Sending an Amazon order    | Today    |
| The supplier's catalog quantity rules                                                            | Sending                    | Today    |
| No pending proposal                                                                              | New shipments and packing  | Today    |
| Packing complete: cartons, whole packs, never more than ordered, pickup address and phone, ready date, invoice | Submitting packing | Today    |
| Amazon carton rules                                                                              | Submitting packing         | Today    |
| Invoice price or SKU changes approved                                                            | Moving on after packing    | Today    |
| Prep categories, packing groups, forwarder phone, AWD eligibility and capacity                   | Amazon inbound             | Today    |
| Complete packet and a booking reference                                                          | Release                    | Today    |
| Current commercial invoice                                                                       | Marking shipped            | Today    |
| Freight in the purchase order's currency, carrier and reference                                  | Forwarding                 | Today    |
| Every shipment received or cancelled                                                             | Closing                    | Today    |
| The supplier accepts                                                                             | Packing                    | Planned  |
| Shipping labels uploaded, only when you arrange shipping                                         | Release                    | Planned  |
| Carrier and tracking, when the supplier arranges shipping                                        | Marking shipped            | Planned  |
| Customs details on the invoice, for goods from overseas                                          | Submitting packing         | Planned  |
| Global Logistics booking number                                                                  | Release                    | Planned  |
| Packing requirements confirmed, for several destinations or any AWD line                         | Sending                    | Planned  |
| Only matching shipments combine                                                                  | Combining                  | Planned  |
| Pickup phone only when Amazon or your carrier picks up                                           | Submitting packing         | Proposed |
| Arrival recorded at the forwarder                                                                | Forwarding                 | Proposed |

The bill of lading is optional and blocks nothing.

## Steps in Amazon

What someone does by hand in Seller Central or Carrier Central, checked against Amazon's published API models on
2026-09-28.

| Step                                                           | Routes                                      | Could Copacker do it?                                                                                               |
| -------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Create each product's listing (ASIN, FNSKU)                    | FBA, AWD, GWD                               | Not planned; the Listings API could.                                                                                |
| Give a SKU a prep category                                     | FBA                                         | Yes: `setPrepDetails` takes the prep category and prep types.                                                       |
| Give Amazon tracking, or freight bill and bill of lading numbers | FBA and AWD with your or the supplier's carrier | Yes: FBA `updateShipmentTrackingDetails`; AWD `updateInboundShipmentTransportDetails`.                          |
| Move the delivery window                                       | FBA                                         | Yes: `generateDeliveryWindowOptions`, `confirmDeliveryWindowOptions`; choose from the expected arrival.             |
| Book Amazon's partnered carrier for AWD                        | AWD, Amazon's carrier                       | No; the AWD API only takes your own carrier.                                                                        |
| Book a delivery appointment                                    | FBA and AWD by truck                        | No; the carrier does this in Carrier Central.                                                                       |
| Set up Global Logistics                                        | Global Logistics                            | No API.                                                                                                             |
| Book Global Logistics, upload its invoice and packing list, pay, download the bill of lading | Global Logistics | No API; Copacker prepares the booking sheet and files.                                                  |
| Create the AWD inbound from China by hand                      | AWD US from China                           | Likely not needed: the AWD origin address takes any country; the first order confirms it.                           |
| Create a GWD delivery request, download its carton labels      | GWD                                         | No documented API.                                                                                                  |
| Open a case for missing or damaged units                       | FBA, AWD                                    | No; Copacker can show the difference once it reads receipts.                                                        |

## Documents

| Document                                  | Needed on                                     | Issued by                         | Copacker today                                                          | Next                                                                  |
| ----------------------------------------- | --------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Purchase order                            | Every route                                   | You                               | Makes it                                                                |                                                                       |
| Commercial invoice                        | Every route; customs details on overseas routes | The supplier, as seller          | Uploaded, or generated after approved changes, with no customs fields   | Planned: generated for every shipment, with your EIN overseas         |
| Packing list, packing checklist           | Every route                                   | The supplier, Copacker            | Makes them                                                              |                                                                       |
| Unit labels (FNSKU or SKU), suffocation warnings | Amazon routes; your warehouse if set     | Applied by the supplier           | Makes them                                                              |                                                                       |
| FBA box labels, AWD SSCC labels           | FBA, AWD                                      | Amazon                            | Fetches them                                                            |                                                                       |
| GWD carton labels                         | GWD                                           | Amazon                            | Not handled                                                             | Planned: you upload them from the delivery request                    |
| Shipping labels                           | When you or Amazon arrange shipping           | The carrier                       | You upload one per carton, on Amazon routes                             | Proposed: fetched for Amazon's partnered carrier on FBA                |
| Pallet labels, truck bill of lading       | Truck freight to Amazon                       | Amazon, the carrier               | Not handled                                                             | Planned: optional bill of lading upload; proposed: fetched if partnered |
| Bill of lading (ocean, air, truck)        | Overseas legs                                 | The carrier, forwarder or Global Logistics | Not handled                                                    | Planned: optional upload by whoever handles customs                    |
| ISF (10+2) data                           | Ocean into the US                             | Your broker files it              | Not handled                                                             | Proposed: drafted in part (HTS codes, importer numbers missing)       |
| Customs entry, arrival notice, certificate of origin, compliance files | Imports                 | Broker, forwarder, supplier       | Not handled                                                             |                                                                       |
| Global Logistics documents                | Global Logistics                              | Amazon                            | Not handled                                                             |                                                                       |
| Freight invoice                           | Forwarder and carrier legs                    | The forwarder or carrier          | Records the amount when forwarding                                      |                                                                       |
| Proof of delivery                         | Every route                                   | The carrier                       | Not handled                                                             |                                                                       |

For customs, Copacker already has the parties, lines, prices, currency, cartons with gross weights, pickup address and
country of origin (from Shopify). It needs HS codes and unit weights (both stored in Shopify), an Incoterm, the
importer of record profile, and the manufacturer when it isn't the supplier.

## Bill of lading

Planned. Optional for now. The shipment has a place for it once the goods leave origin; nothing waits for it.

| Route                                                 | Handles customs            | Uploads it                                              |
| ----------------------------------------------------- | -------------------------- | ------------------------------------------------------- |
| Through a forwarder                                   | The forwarder              | The forwarder, or you for a forwarder not on Copacker   |
| Amazon Global Logistics                               | Amazon                     | You, after downloading it from the booking              |
| The supplier ships from overseas, duty paid (`DDP`)   | The supplier               | The supplier, or you for a supplier not on Copacker     |
| You arrange shipping, or `DAP`, `FOB`, `EXW`          | You, through your broker   | You                                                     |
| Truck freight within the US                           | No customs                 | Whoever arranges shipping                               |

A "Customs handled by" field on the purchase order, defaulted from the route and Incoterm, says who owes it. Several can
be attached (house and master bills, air waybills). Amazon's FBA API takes a truck bill of lading number, so Copacker
can pass it on.

## Customs

Today customs runs outside Copacker. On every overseas route you are the importer of record, never Amazon: an EIN or
CBP-assigned number and a continuous customs bond (Global Logistics requires both). ISF is filed at least 24 hours
before ocean loading. Your broker files the entry and you pay duties, recorded as landed costs by hand. Planned: your
EIN and bond in Settings, printed on the commercial invoice, the ISF data and the Global Logistics booking sheet.

## Closing

| Route                    | Shipment closes when                                  | Planned                                                                |
| ------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| Your warehouse           | You receive it (one button today)                     | Received and rejected units per line                                   |
| Through a forwarder      | You receive it after the forwarder forwards it        | Arrival at the forwarder recorded first                                |
| Combined at a forwarder  | The combined shipment is received                     | Members close with it                                                  |
| FBA or AWD               | You mark it received                                  | Copacker reads Amazon's receipts and closes it when Amazon closes it   |
| GWD                      | GWD receives it                                       | Linked to the delivery request                                         |

The purchase order closes when you close it, once every shipment is received or cancelled. Shipments still being packed
are cancelled then. Nothing closes a purchase order automatically.

## Changes

**Planned**, in the order that unblocks the most routes: shipping arranged by; supplier-arranged shipping (carrier and
tracking at ship, labels gate only when you arrange shipping); your shipping labels to your warehouse; the commercial
invoice for every shipment; the importer of record profile; one order with several destinations and split lines; the
bill of lading on the shipment; combined shipments; Amazon Global Logistics; AWD US from China; the GWD destination;
freight split by chargeable weight.

**Proposed**: tracking to Amazon through the API; prep categories through the API; a delivery window from the expected
arrival; an Incoterm field; HS codes and unit weights from Shopify; the pickup phone only when needed; forwarder arrival,
emails and packing list; Amazon's partnered carrier for FBA; cancelling sent orders and stuck shipments; emails to you.

## Open questions

None. Facts still to check: GWD's carton rules, and whether Shopify shows Incoming for a transfer with no origin
(inventory sync spec).

## Sources

- [AWD inbound shipment creation guide](https://m.media-amazon.com/images/G/01/awd-files/inbound/AWD_Inbound_Process.pdf)
- [Using Amazon Global Logistics in Seller Central](https://m.media-amazon.com/images/G/01/AGL/AGL_onboarding_US_FINAL-en_us1.pdf)
- [AWD API: create an inbound order](https://developer-docs.amazon/sp-api/docs/create-an-inbound-order)
- [Fulfillment Inbound API 2024-03-20 model](https://github.com/amzn/selling-partner-api-models/blob/main/models/fulfillment-inbound-api-model/fulfillmentInbound_2024-03-20.json)
- [AWD API 2024-05-09 model](https://github.com/amzn/selling-partner-api-models/blob/main/models/amazon-warehousing-and-distribution-model/awd_2024-05-09.json)
- [Introducing Global Warehousing & Distribution](https://sellercentral.amazon.com/seller-forums/discussions/t/91f2bda1-ff49-456e-9319-9b61058c7c03)
- [Global Logistics importer setup and customs](https://sellercentral.amazon.com/help/hub/reference/external/GASFW4BD897LNTNN)
