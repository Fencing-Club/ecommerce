# Purchase order routes

Part of the [purchase order flow spec](README.md). Every named route, step by step, generated from the route model
the published page's explorer uses. Status: Today is what the code does; Planned is decided but not built; Proposed
isn't decided. Steps in Amazon counts what you do by hand in Seller Central or Global Logistics.

## Supplier ships to your warehouse

Unic, from its US warehouse.

- **Status today:** Supported today.
- **Shipping arranged by:** Supplier.
- **Steps you take in Amazon:** 0.
- Packing asks for a pickup phone even though nobody picks up from the supplier.
- The supplier can't record carrier and tracking yet.

| Phase | Who | Where | Status | Step | Gate |
| --- | --- | --- | --- | --- | --- |
| Before the first order | You | In Copacker | Today | Connect Shopify. Purchase order lines are Shopify variants. |  |
| Before the first order | You | In Copacker | Today | Save the delivery address and link it to its Shopify location. |  |
| Draft and send | You | In Copacker | Today | Draft the purchase order: supplier, reference, destination, products in whole packs, prices, currency, required-by date, payment terms and notes. | Products must exist in Shopify and ASINs must match Amazon. A supplier on Copacker must have the units available. |
| Draft and send | You | In Copacker | Planned | Set who arranges shipping, here the supplier. That decides who provides the shipping labels. |  |
| Draft and send | You | In Copacker | Proposed | Set the Incoterm. |  |
| Draft and send | You | In Copacker | Today | Send. Copacker emails the supplier the purchase order with its PDF, and opens the first shipment. |  |
| Supplier response | Supplier | In Copacker | Planned | Accept or decline. Accepting holds the units on the supplier's other channels. |  |
| Supplier response | Supplier | In Copacker | Today | Optionally propose changes: quantities, prices, products, payment terms or the ready date. | Only until a shipment is submitted. |
| Supplier response | You | In Copacker | Today | Approve or decline the changes. Approving makes a new revision, and Copacker files a commercial invoice it generates. |  |
| Make and pack | Supplier | Outside Copacker | Today | Make the goods and set the ready date. |  |
| Make and pack | Supplier | In Copacker | Today | Enter the cartons with contents, size in cm and weight in kg, the pickup address and phone, and the ready date. | Whole packs only, never more than ordered, with a current invoice. |
| Make and pack | Supplier | In Copacker | Today | Upload the commercial invoice, or keep the one Copacker generated. | Required to submit packing, and again to ship. |
| Make and pack | Copacker | In Copacker | Planned | Generate the commercial invoice from the purchase order and packing. The supplier can upload its own instead. |  |
| Make and pack | You | In Copacker | Today | Approve any price or supplier SKU changes on the invoice. |  |
| Book transport | Supplier | Outside Copacker | Today | Book and pay its own carrier. |  |
| Release | Copacker | In Copacker | Today | No release step. The shipment is ready as soon as packing is submitted. |  |
| Ship | Supplier | Outside Copacker | Today | Label units only if a product is set to get SKU labels. No carton labels. |  |
| Ship | Supplier | In Copacker | Today | Mark shipped. | The commercial invoice must still be current. |
| Ship | Supplier | In Copacker | Planned | Enter the carrier and tracking number. |  |
| Delivery and receiving | You | In Copacker | Today | Mark received. Today that's one button with no quantities. |  |
| Delivery and receiving | You | In Copacker | Planned | Receive per line: received and rejected units. Rejected units never enter stock. |  |
| Close | Copacker | In Copacker | Today | The shipment closes when you receive it. |  |
| Close | You | In Copacker | Today | Close the purchase order once every shipment is received or cancelled. Shipments still being packed are cancelled. |  |

| Document | From | Copacker today | Next |
| --- | --- | --- | --- |
| Purchase order | You | Copacker makes it |  |
| Commercial invoice | The supplier, as seller | Copacker makes it in some cases | Planned: Copacker generates it. Today Copacker generates one only after approved changes. Planned: generated for every shipment; the supplier can upload its own instead. |
| Packing list | The supplier | Copacker makes it |  |
| Packing checklist | Copacker | Copacker makes it |  |
| SKU labels | Only for products set to get them | Copacker makes it |  |
| Shipping labels | The supplier's carrier | Not from Copacker | Nothing for you to provide. |
| Proof of delivery | The carrier | Not from Copacker |  |

**Closes.** The shipment closes when you receive it. The purchase order closes when you close it, once every shipment is received or cancelled.

## Your carrier to your warehouse

- **Status today:** Partly supported.
- **Shipping arranged by:** You.
- **Steps you take in Amazon:** 0.
- Shipments to your warehouse have no step for your shipping labels.

| Phase | Who | Where | Status | Step | Gate |
| --- | --- | --- | --- | --- | --- |
| Before the first order | You | In Copacker | Today | Connect Shopify. Purchase order lines are Shopify variants. |  |
| Before the first order | You | In Copacker | Today | Save the delivery address and link it to its Shopify location. |  |
| Draft and send | You | In Copacker | Today | Draft the purchase order: supplier, reference, destination, products in whole packs, prices, currency, required-by date, payment terms and notes. | Products must exist in Shopify and ASINs must match Amazon. A supplier on Copacker must have the units available. |
| Draft and send | You | In Copacker | Planned | Set who arranges shipping, here you. That decides who provides the shipping labels. |  |
| Draft and send | You | In Copacker | Proposed | Set the Incoterm. |  |
| Draft and send | You | In Copacker | Today | Send, then email the purchase order PDF to the supplier yourself. Copacker opens the first shipment. |  |
| Make and pack | Supplier | Outside Copacker | Today | Make the goods and set the ready date. |  |
| Make and pack | You | In Copacker | Today | Enter the cartons with contents, size in cm and weight in kg, the pickup address and phone, and the ready date. | Whole packs only, never more than ordered, with a current invoice. |
| Make and pack | You | In Copacker | Today | Upload the commercial invoice, or keep the one Copacker generated. | Required to submit packing, and again to ship. |
| Make and pack | Copacker | In Copacker | Planned | Generate the commercial invoice from the purchase order and packing. The supplier can upload its own instead. |  |
| Book transport | You | Outside Copacker | Planned | Book your carrier, for example on your UPS account. |  |
| Book transport | You | In Copacker | Planned | Upload one shipping label per carton. |  |
| Release | Copacker | In Copacker | Today | No release step. The shipment is ready as soon as packing is submitted. |  |
| Release | You | In Copacker | Planned | Release once your shipping labels are uploaded, so the supplier can print them. |  |
| Ship | Supplier | Outside Copacker | Today | Label units only if a product is set to get SKU labels. No carton labels. Apply your shipping labels. |  |
| Ship | You | In Copacker | Today | Mark shipped. | The commercial invoice must still be current. |
| Delivery and receiving | You | In Copacker | Today | Mark received. Today that's one button with no quantities. |  |
| Delivery and receiving | You | In Copacker | Planned | Receive per line: received and rejected units. Rejected units never enter stock. |  |
| Close | Copacker | In Copacker | Today | The shipment closes when you receive it. |  |
| Close | You | In Copacker | Today | Close the purchase order once every shipment is received or cancelled. Shipments still being packed are cancelled. |  |

| Document | From | Copacker today | Next |
| --- | --- | --- | --- |
| Purchase order | You | Copacker makes it |  |
| Commercial invoice | The supplier, as seller | Copacker makes it in some cases | Planned: Copacker generates it. Today Copacker generates one only after approved changes. Planned: generated for every shipment; the supplier can upload its own instead. |
| Packing list | The supplier | Copacker makes it |  |
| Packing checklist | Copacker | Copacker makes it |  |
| SKU labels | Only for products set to get them | Copacker makes it |  |
| Shipping labels | Your carrier | Not from Copacker | You upload one per carton. |
| Proof of delivery | The carrier | Not from Copacker |  |

**Closes.** The shipment closes when you receive it. The purchase order closes when you close it, once every shipment is received or cancelled.

## Forwarder combines orders, then your warehouse

- **Status today:** Not supported yet.
- **Shipping arranged by:** Forwarder.
- **Handles customs:** Forwarder.
- **Steps you take in Amazon:** 0.
- Forwarders can't combine shipments from several purchase orders yet.
- Customs runs outside Copacker, the commercial invoice has no customs fields, and there's nowhere to attach the bill of lading.
- There's no arrival step at the forwarder, and forwarders get no shipment emails.
- Packing asks for a pickup phone even though nobody picks up from the supplier.

| Phase | Who | Where | Status | Step | Gate |
| --- | --- | --- | --- | --- | --- |
| Before the first order | You | In Copacker | Today | Connect Shopify. Purchase order lines are Shopify variants. |  |
| Before the first order | You | In Copacker | Today | Save the delivery address and link it to its Shopify location. |  |
| Before the first order | You | In Copacker | Today | Save the forwarder and its address. |  |
| Before the first order | You | Outside Copacker | Today | Be the importer of record: an EIN or CBP-assigned number, a continuous customs bond, and a customs broker. |  |
| Draft and send | You | In Copacker | Today | Draft the purchase order: supplier, reference, destination, products in whole packs, prices, currency, required-by date, payment terms and notes. | Products must exist in Shopify and ASINs must match Amazon. A supplier on Copacker must have the units available. |
| Draft and send | You | In Copacker | Today | Pick the forwarder stop. The purchase order then shows the forwarder as ship-to. |  |
| Draft and send | You | In Copacker | Planned | Set who arranges shipping, here the forwarder. That decides who provides the shipping labels. |  |
| Draft and send | You | In Copacker | Proposed | Set the Incoterm. |  |
| Draft and send | You | In Copacker | Today | Send, then email the purchase order PDF to the supplier yourself. Copacker opens the first shipment. |  |
| Draft and send | Copacker | In Copacker | Proposed | Email the forwarder that a shipment is coming. |  |
| Make and pack | Supplier | Outside Copacker | Today | Make the goods and set the ready date. |  |
| Make and pack | You | In Copacker | Today | Enter the cartons with contents, size in cm and weight in kg, the pickup address and phone, and the ready date. | Whole packs only, never more than ordered, with a current invoice. |
| Make and pack | You | In Copacker | Today | Upload the commercial invoice, or keep the one Copacker generated. | Required to submit packing, and again to ship. |
| Make and pack | Copacker | In Copacker | Planned | Generate the commercial invoice from the purchase order and packing, with customs details and your EIN as importer of record. The supplier can upload its own instead. |  |
| Make and pack | You | In Copacker | Planned | Check the invoice's customs details: HS codes, country of origin, Incoterm and importer of record. |  |
| Book transport | Supplier | Outside Copacker | Today | Deliver to the forwarder's address on the purchase order. |  |
| Book transport | Forwarder | Outside Copacker | Today | Book the combined onward shipment. |  |
| Release | Copacker | In Copacker | Today | No release step. The shipment is ready as soon as packing is submitted. |  |
| Ship | Supplier | Outside Copacker | Today | Label units only if a product is set to get SKU labels. No carton labels. |  |
| Ship | You | In Copacker | Today | Mark shipped. | The commercial invoice must still be current. |
| At the forwarder | Forwarder | In Copacker | Proposed | Record the shipment's arrival, and any damage. |  |
| At the forwarder | Forwarder | In Copacker | Planned | Combine shipments from several purchase orders into one onward shipment. You do it for a forwarder that isn't on Copacker. | Only shipments at this forwarder, for you, going to the same place. |
| At the forwarder | Forwarder | In Copacker | Today | Forward: carrier, reference and freight cost. You do it for a forwarder that isn't on Copacker. | Freight must be in the purchase order's currency. |
| Customs | Forwarder | Outside Copacker | Today | Clear export at origin. |  |
| Customs | Customs broker | Outside Copacker | Today | File the ISF at least 24 hours before loading, for ocean freight. |  |
| Customs | Customs broker | Outside Copacker | Today | File the customs entry, with you as importer of record, and pay duties and tariffs. |  |
| Customs | Forwarder | In Copacker | Planned | Upload the bill of lading to the shipment. Whoever handles customs does this. | Optional for now. Nothing waits for it. |
| Customs | You | In Copacker | Today | Record duties and tariffs as landed costs. |  |
| Delivery and receiving | You | In Copacker | Today | Mark received. Today that's one button with no quantities. |  |
| Delivery and receiving | You | In Copacker | Planned | Receive per line: received and rejected units. Rejected units never enter stock. |  |
| Close | Copacker | In Copacker | Today | Each shipment closes when the combined shipment is received. |  |
| Close | You | In Copacker | Today | Close the purchase order once every shipment is received or cancelled. Shipments still being packed are cancelled. |  |

| Document | From | Copacker today | Next |
| --- | --- | --- | --- |
| Purchase order | You | Copacker makes it |  |
| Commercial invoice, with customs details | The supplier, as seller | Copacker makes it in some cases | Planned: Copacker generates it. Today Copacker generates one only after approved changes, without customs fields. Planned: generated for every shipment, with customs details and your EIN; the supplier can upload its own instead. |
| Packing list | The supplier | Copacker makes it |  |
| Packing checklist | Copacker | Copacker makes it |  |
| SKU labels | Only for products set to get them | Copacker makes it |  |
| Onward shipping documents | The forwarder | Not from Copacker |  |
| Bill of lading | The forwarder's carrier | Not from Copacker | Planned: optional upload on the shipment. Planned: an optional upload on the shipment, by the forwarder, who handles customs. |
| ISF data | Your customs broker files it | Not from Copacker | Proposed: Copacker drafts it. Proposed: drafted in part; HTS codes and importer numbers are missing. |
| Customs entry | Your customs broker | Not from Copacker |  |
| Freight invoice | The forwarder | Copacker records the amount | Copacker records the amount when forwarding. |
| Proof of delivery | The carrier | Not from Copacker |  |

**Closes.** Each shipment closes when the combined shipment is received. The purchase order closes when you close it, once every shipment is received or cancelled.

## Supplier to FBA, your carrier

- **Status today:** Supported today.
- **Shipping arranged by:** You.
- **Steps you take in Amazon:** 4.

| Phase | Who | Where | Status | Step | Gate |
| --- | --- | --- | --- | --- | --- |
| Before the first order | You | In Copacker | Today | Connect Shopify. Purchase order lines are Shopify variants. |  |
| Before the first order | You | In Copacker | Today | Connect Amazon, US marketplace. |  |
| Before the first order | You | Seller Central | Today | Create each product's listing, so it has an ASIN and FNSKU. | Sending is refused for any SKU without a listing. |
| Before the first order | You | Seller Central | Today | Give Amazon a prep category for any SKU it has none for. | The FBA inbound stops on a SKU without one. |
| Before the first order | Copacker | Copacker, through Amazon's API | Proposed | Set the missing prep category through Amazon's API instead, from the product's prep setting, once you confirm it. |  |
| Draft and send | You | In Copacker | Today | Draft the purchase order: supplier, reference, destination, products in whole packs, prices, currency, required-by date, payment terms and notes. | Products must exist in Shopify and ASINs must match Amazon. A supplier on Copacker must have the units available. |
| Draft and send | You | In Copacker | Today | Set each line's network to FBA. |  |
| Draft and send | You | In Copacker | Planned | Set who arranges shipping, here you. That decides who provides the shipping labels. |  |
| Draft and send | You | In Copacker | Proposed | Set the Incoterm. |  |
| Draft and send | You | In Copacker | Today | Send, then email the purchase order PDF to the supplier yourself. Copacker opens the first shipment. | Amazon must be connected and list every SKU. |
| Make and pack | Supplier | Outside Copacker | Today | Make the goods and set the ready date. |  |
| Make and pack | You | In Copacker | Today | Enter the cartons with contents, size in cm and weight in kg, the pickup address and phone, and the ready date. | Whole packs only, never more than ordered, with a current invoice. FBA cartons are at most 91.44 × 63.5 × 63.5 cm and 22.67 kg unless one unit is larger. |
| Make and pack | You | In Copacker | Today | Upload the commercial invoice, or keep the one Copacker generated. | Required to submit packing, and again to ship. |
| Make and pack | Copacker | In Copacker | Planned | Generate the commercial invoice from the purchase order and packing. The supplier can upload its own instead. |  |
| Amazon inbound | Copacker | Copacker, through Amazon's API | Today | Create the FBA inbound plan: packing option, placement, box contents, your own carrier, a delivery window and box labels. | Every SKU needs a prep category, and each carton's products must fit one packing group. |
| Amazon inbound | You | In Copacker | Today | If creation fails, fix it and retry, or link the order you made in Seller Central. |  |
| Book transport | You | Outside Copacker | Today | Book your carrier outside Amazon. |  |
| Book transport | You | In Copacker | Today | Upload one shipping label per carton. |  |
| Book transport | You | Seller Central | Today | Give Amazon the tracking numbers, or the freight bill and bill of lading numbers for truck freight. |  |
| Book transport | Copacker | Copacker, through Amazon's API | Proposed | Send them to Amazon instead: a tracking number per box for small parcel, or the freight bill and bill of lading numbers for truck freight. |  |
| Book transport | Carrier | Carrier Central | Today | For truck freight, book a delivery appointment. |  |
| Release | You | In Copacker | Today | Release the packet, then share it with the supplier yourself. Copacker only emails suppliers on Copacker. | Every carton needs its Amazon label and a shipping label; the packing list, checklist and product labels must be current; you enter a booking reference. |
| Ship | Supplier | Outside Copacker | Today | Print the packet. Label every Amazon unit with its FNSKU and every Amazon carton with Amazon's label, then apply your carrier labels. |  |
| Ship | You | In Copacker | Today | Mark shipped. | The commercial invoice must still be current. |
| Delivery and receiving | Amazon | Outside Copacker | Today | Receive and count the cartons. |  |
| Delivery and receiving | You | In Copacker | Today | Mark the shipment received by hand. |  |
| Delivery and receiving | Copacker | Copacker, through Amazon's API | Planned | Read Amazon's received counts, and close the shipment when Amazon closes it. |  |
| Delivery and receiving | You | Seller Central | Today | Open a case with Amazon for missing or damaged units. |  |
| Close | Copacker | In Copacker | Today | The shipment closes when it's marked received: by you today, and when Amazon closes it once receipts are read. |  |
| Close | You | In Copacker | Today | Close the purchase order once every shipment is received or cancelled. Shipments still being packed are cancelled. |  |

| Document | From | Copacker today | Next |
| --- | --- | --- | --- |
| Purchase order | You | Copacker makes it |  |
| Commercial invoice | The supplier, as seller | Copacker makes it in some cases | Planned: Copacker generates it. Today Copacker generates one only after approved changes. Planned: generated for every shipment; the supplier can upload its own instead. |
| Packing list | The supplier | Copacker makes it |  |
| Packing checklist | Copacker | Copacker makes it |  |
| Unit labels (FNSKU) | Applied by the supplier | Copacker makes it |  |
| Suffocation warnings | Applied by the supplier, on polybags | Copacker makes it |  |
| FBA box labels | Amazon | Copacker fetches it from Amazon |  |
| Shipping labels | Your carrier | Not from Copacker | You upload one per carton. |
| Pallet labels and bill of lading, for truck freight | Amazon and the carrier | Not from Copacker | Planned: optional upload on the shipment. Planned: the bill of lading is an optional upload on the shipment, by you, who arranges shipping. |
| Proof of delivery | The carrier | Not from Copacker |  |

**Closes.** The shipment closes when it's marked received: by you today, and when Amazon closes it once receipts are read. The purchase order closes when you close it, once every shipment is received or cancelled.

## Supplier to FBA, Amazon's partnered carrier

- **Status today:** Not supported yet.
- **Shipping arranged by:** Amazon.
- **Steps you take in Amazon:** 3.
- Copacker only books your own carrier for FBA today.

| Phase | Who | Where | Status | Step | Gate |
| --- | --- | --- | --- | --- | --- |
| Before the first order | You | In Copacker | Today | Connect Shopify. Purchase order lines are Shopify variants. |  |
| Before the first order | You | In Copacker | Today | Connect Amazon, US marketplace. |  |
| Before the first order | You | Seller Central | Today | Create each product's listing, so it has an ASIN and FNSKU. | Sending is refused for any SKU without a listing. |
| Before the first order | You | Seller Central | Today | Give Amazon a prep category for any SKU it has none for. | The FBA inbound stops on a SKU without one. |
| Before the first order | Copacker | Copacker, through Amazon's API | Proposed | Set the missing prep category through Amazon's API instead, from the product's prep setting, once you confirm it. |  |
| Draft and send | You | In Copacker | Today | Draft the purchase order: supplier, reference, destination, products in whole packs, prices, currency, required-by date, payment terms and notes. | Products must exist in Shopify and ASINs must match Amazon. A supplier on Copacker must have the units available. |
| Draft and send | You | In Copacker | Today | Set each line's network to FBA. |  |
| Draft and send | You | In Copacker | Planned | Set who arranges shipping, here Amazon. That decides who provides the shipping labels. |  |
| Draft and send | You | In Copacker | Proposed | Set the Incoterm. |  |
| Draft and send | You | In Copacker | Today | Send, then email the purchase order PDF to the supplier yourself. Copacker opens the first shipment. | Amazon must be connected and list every SKU. |
| Make and pack | Supplier | Outside Copacker | Today | Make the goods and set the ready date. |  |
| Make and pack | You | In Copacker | Today | Enter the cartons with contents, size in cm and weight in kg, the pickup address and phone, and the ready date. | Whole packs only, never more than ordered, with a current invoice. FBA cartons are at most 91.44 × 63.5 × 63.5 cm and 22.67 kg unless one unit is larger. |
| Make and pack | You | In Copacker | Today | Upload the commercial invoice, or keep the one Copacker generated. | Required to submit packing, and again to ship. |
| Make and pack | Copacker | In Copacker | Planned | Generate the commercial invoice from the purchase order and packing. The supplier can upload its own instead. |  |
| Amazon inbound | Copacker | Copacker, through Amazon's API | Today | Create the FBA inbound plan: packing option, placement, box contents, your own carrier, a delivery window and box labels. | Every SKU needs a prep category, and each carton's products must fit one packing group. |
| Amazon inbound | You | In Copacker | Today | If creation fails, fix it and retry, or link the order you made in Seller Central. |  |
| Book transport | Copacker | Copacker, through Amazon's API | Proposed | Confirm Amazon's partnered carrier, then fetch its labels, and the bill of lading for truck freight. |  |
| Release | You | In Copacker | Today | Release the packet, then share it with the supplier yourself. Copacker only emails suppliers on Copacker. | Every carton needs its Amazon label and the partnered carrier's label, which Copacker fetches; the packing list, checklist and product labels must be current; you enter a booking reference. |
| Ship | Supplier | Outside Copacker | Today | Print the packet. Label every Amazon unit with its FNSKU and every Amazon carton with Amazon's label. |  |
| Ship | You | In Copacker | Today | Mark shipped. | The commercial invoice must still be current. |
| Delivery and receiving | Amazon | Outside Copacker | Today | Receive and count the cartons. |  |
| Delivery and receiving | You | In Copacker | Today | Mark the shipment received by hand. |  |
| Delivery and receiving | Copacker | Copacker, through Amazon's API | Planned | Read Amazon's received counts, and close the shipment when Amazon closes it. |  |
| Delivery and receiving | You | Seller Central | Today | Open a case with Amazon for missing or damaged units. |  |
| Close | Copacker | In Copacker | Today | The shipment closes when it's marked received: by you today, and when Amazon closes it once receipts are read. |  |
| Close | You | In Copacker | Today | Close the purchase order once every shipment is received or cancelled. Shipments still being packed are cancelled. |  |

| Document | From | Copacker today | Next |
| --- | --- | --- | --- |
| Purchase order | You | Copacker makes it |  |
| Commercial invoice | The supplier, as seller | Copacker makes it in some cases | Planned: Copacker generates it. Today Copacker generates one only after approved changes. Planned: generated for every shipment; the supplier can upload its own instead. |
| Packing list | The supplier | Copacker makes it |  |
| Packing checklist | Copacker | Copacker makes it |  |
| Unit labels (FNSKU) | Applied by the supplier | Copacker makes it |  |
| Suffocation warnings | Applied by the supplier, on polybags | Copacker makes it |  |
| FBA box labels | Amazon | Copacker fetches it from Amazon |  |
| Shipping labels | Amazon's partnered carrier | Not from Copacker | Proposed: Copacker fetches it. Proposed: fetched through the API. |
| Pallet labels and bill of lading, for truck freight | Amazon | Not from Copacker | Proposed: Copacker fetches it. Proposed: fetched through the API. |
| Proof of delivery | The carrier | Not from Copacker |  |

**Closes.** The shipment closes when it's marked received: by you today, and when Amazon closes it once receipts are read. The purchase order closes when you close it, once every shipment is received or cancelled.

## FBA through Amazon Global Logistics

- **Status today:** Not supported yet.
- **Shipping arranged by:** Amazon.
- **Handles customs:** Amazon.
- **Steps you take in Amazon:** 7.
- Copacker has no Amazon Global Logistics route yet.
- Customs runs outside Copacker, the commercial invoice has no customs fields, and there's nowhere to attach the bill of lading.
- FBA's delivery window is chosen from the ready date, before the goods have crossed.

| Phase | Who | Where | Status | Step | Gate |
| --- | --- | --- | --- | --- | --- |
| Before the first order | You | In Copacker | Today | Connect Shopify. Purchase order lines are Shopify variants. |  |
| Before the first order | You | In Copacker | Today | Connect Amazon, US marketplace. |  |
| Before the first order | You | Seller Central | Today | Create each product's listing, so it has an ASIN and FNSKU. | Sending is refused for any SKU without a listing. |
| Before the first order | You | Seller Central | Today | Give Amazon a prep category for any SKU it has none for. | The FBA inbound stops on a SKU without one. |
| Before the first order | Copacker | Copacker, through Amazon's API | Proposed | Set the missing prep category through Amazon's API instead, from the product's prep setting, once you confirm it. |  |
| Before the first order | You | Outside Copacker | Today | Be the importer of record: an EIN or CBP-assigned number, a continuous customs bond, and a customs broker. |  |
| Before the first order | You | Global Logistics in Seller Central | Today | Set up Amazon Global Logistics once: account, payment method, importer of record and bond. |  |
| Draft and send | You | In Copacker | Today | Draft the purchase order: supplier, reference, destination, products in whole packs, prices, currency, required-by date, payment terms and notes. | Products must exist in Shopify and ASINs must match Amazon. A supplier on Copacker must have the units available. |
| Draft and send | You | In Copacker | Today | Set each line's network to FBA. |  |
| Draft and send | You | In Copacker | Planned | Set who arranges shipping, here Amazon. That decides who provides the shipping labels. |  |
| Draft and send | You | In Copacker | Proposed | Set the Incoterm. |  |
| Draft and send | You | In Copacker | Today | Send, then email the purchase order PDF to the supplier yourself. Copacker opens the first shipment. | Amazon must be connected and list every SKU. |
| Make and pack | Supplier | Outside Copacker | Today | Make the goods and set the ready date. |  |
| Make and pack | You | In Copacker | Today | Enter the cartons with contents, size in cm and weight in kg, the pickup address and phone, and the ready date. | Whole packs only, never more than ordered, with a current invoice. FBA cartons are at most 91.44 × 63.5 × 63.5 cm and 22.67 kg unless one unit is larger. |
| Make and pack | You | In Copacker | Today | Upload the commercial invoice, or keep the one Copacker generated. | Required to submit packing, and again to ship. |
| Make and pack | Copacker | In Copacker | Planned | Generate the commercial invoice from the purchase order and packing, with customs details and your EIN as importer of record. The supplier can upload its own instead. |  |
| Make and pack | You | In Copacker | Planned | Check the invoice's customs details: HS codes, country of origin, Incoterm and importer of record. |  |
| Amazon inbound | Copacker | Copacker, through Amazon's API | Planned | Create the FBA inbound plan from the supplier's address in China, with box contents and labels, leaving transport to Global Logistics. |  |
| Amazon inbound | Copacker | Copacker, through Amazon's API | Proposed | Choose the delivery window from the expected arrival. Today it's chosen from the ready date, which is too early for goods still in transit. |  |
| Amazon inbound | You | In Copacker | Today | If creation fails, fix it and retry, or link the order you made in Seller Central. |  |
| Book transport | Copacker | In Copacker | Planned | Prepare a booking sheet to copy from: cargo ready date, cartons, volume, weight, Incoterm, pickup address, shipper, your EIN as importer of record, destination contact and ISF parties. |  |
| Book transport | You | Global Logistics in Seller Central | Today | Book Global Logistics: ocean FCL or LCL, or air; origin port; cargo ready date; Incoterm; pickup at the supplier; palletization; shipper, importer of record, destination contact and ISF parties. Accept the charges. |  |
| Book transport | You | Global Logistics in Seller Central | Today | Upload the commercial invoice and packing list to the booking. | Copacker makes both files. Only the upload is by hand. |
| Book transport | You | In Copacker | Planned | Enter the Global Logistics booking number in Copacker. |  |
| Release | You | In Copacker | Today | Release the packet, then share it with the supplier yourself. Copacker only emails suppliers on Copacker. | Every carton needs its Amazon label; the packing list, checklist and product labels must be current; the booking reference is the Global Logistics booking number. Today release also demands a shipping label per carton. Planned: only when you arrange shipping. |
| Ship | Supplier | Outside Copacker | Today | Print the packet. Label every Amazon unit with its FNSKU and every Amazon carton with Amazon's label. |  |
| Ship | You | In Copacker | Today | Mark shipped. | The commercial invoice must still be current. |
| Customs | Amazon | Outside Copacker | Today | Clear export at origin. |  |
| Customs | Amazon | Outside Copacker | Today | File the ISF at least 24 hours before loading, for ocean freight. |  |
| Customs | Amazon | Outside Copacker | Today | File the customs entry, with you as importer of record, and pay duties and tariffs. |  |
| Customs | You | Global Logistics in Seller Central | Planned | Download the bill of lading from the Global Logistics booking. |  |
| Customs | You | In Copacker | Planned | Upload the bill of lading to the shipment. Whoever handles customs does this. | Optional for now. Nothing waits for it. |
| Customs | You | In Copacker | Today | Record duties and tariffs as landed costs. |  |
| Delivery and receiving | Amazon | Outside Copacker | Today | Receive and count the cartons. |  |
| Delivery and receiving | You | In Copacker | Today | Mark the shipment received by hand. |  |
| Delivery and receiving | Copacker | Copacker, through Amazon's API | Planned | Read Amazon's received counts, and close the shipment when Amazon closes it. |  |
| Delivery and receiving | You | Seller Central | Today | Open a case with Amazon for missing or damaged units. |  |
| Close | Copacker | In Copacker | Today | The shipment closes when it's marked received: by you today, and when Amazon closes it once receipts are read. |  |
| Close | You | In Copacker | Today | Close the purchase order once every shipment is received or cancelled. Shipments still being packed are cancelled. |  |

| Document | From | Copacker today | Next |
| --- | --- | --- | --- |
| Purchase order | You | Copacker makes it |  |
| Commercial invoice, with customs details | The supplier, as seller | Copacker makes it in some cases | Planned: Copacker generates it. Today Copacker generates one only after approved changes, without customs fields. Planned: generated for every shipment, with customs details and your EIN; the supplier can upload its own instead. |
| Packing list | The supplier | Copacker makes it |  |
| Packing checklist | Copacker | Copacker makes it |  |
| Unit labels (FNSKU) | Applied by the supplier | Copacker makes it |  |
| Suffocation warnings | Applied by the supplier, on polybags | Copacker makes it |  |
| FBA box labels | Amazon | Copacker fetches it from Amazon |  |
| Bill of lading | Amazon Global Logistics | Not from Copacker | Planned: optional upload on the shipment. Planned: an optional upload on the shipment, by you, downloading it from the Global Logistics booking, since Amazon handles customs. |
| ISF data | Your customs broker files it | Not from Copacker | Proposed: Copacker drafts it. Proposed: drafted in part; HTS codes and importer numbers are missing. |
| Customs entry | Amazon Global Logistics | Not from Copacker |  |
| Letter of guarantee and rate arrangement | Amazon Global Logistics | Not from Copacker |  |
| Proof of delivery | The carrier | Not from Copacker |  |

**Closes.** The shipment closes when it's marked received: by you today, and when Amazon closes it once receipts are read. The purchase order closes when you close it, once every shipment is received or cancelled.

## FBA through your forwarder

- **Status today:** Partly supported.
- **Shipping arranged by:** Forwarder.
- **Handles customs:** Forwarder.
- **Steps you take in Amazon:** 3.
- Customs runs outside Copacker, the commercial invoice has no customs fields, and there's nowhere to attach the bill of lading.
- There's no arrival step at the forwarder, and forwarders get no shipment emails.
- FBA's delivery window is chosen from the ready date, before the goods have crossed.

| Phase | Who | Where | Status | Step | Gate |
| --- | --- | --- | --- | --- | --- |
| Before the first order | You | In Copacker | Today | Connect Shopify. Purchase order lines are Shopify variants. |  |
| Before the first order | You | In Copacker | Today | Connect Amazon, US marketplace. |  |
| Before the first order | You | Seller Central | Today | Create each product's listing, so it has an ASIN and FNSKU. | Sending is refused for any SKU without a listing. |
| Before the first order | You | Seller Central | Today | Give Amazon a prep category for any SKU it has none for. | The FBA inbound stops on a SKU without one. |
| Before the first order | Copacker | Copacker, through Amazon's API | Proposed | Set the missing prep category through Amazon's API instead, from the product's prep setting, once you confirm it. |  |
| Before the first order | You | In Copacker | Today | Save the forwarder and its address with a phone number. Amazon uses it as the pickup contact. |  |
| Before the first order | You | Outside Copacker | Today | Be the importer of record: an EIN or CBP-assigned number, a continuous customs bond, and a customs broker. |  |
| Draft and send | You | In Copacker | Today | Draft the purchase order: supplier, reference, destination, products in whole packs, prices, currency, required-by date, payment terms and notes. | Products must exist in Shopify and ASINs must match Amazon. A supplier on Copacker must have the units available. |
| Draft and send | You | In Copacker | Today | Set each line's network to FBA. |  |
| Draft and send | You | In Copacker | Today | Pick the forwarder stop. The purchase order then shows the forwarder as ship-to. |  |
| Draft and send | You | In Copacker | Planned | Set who arranges shipping, here the forwarder. That decides who provides the shipping labels. |  |
| Draft and send | You | In Copacker | Proposed | Set the Incoterm. |  |
| Draft and send | You | In Copacker | Today | Send, then email the purchase order PDF to the supplier yourself. Copacker opens the first shipment. | Amazon must be connected and list every SKU. |
| Draft and send | Copacker | In Copacker | Proposed | Email the forwarder that a shipment is coming. |  |
| Make and pack | Supplier | Outside Copacker | Today | Make the goods and set the ready date. |  |
| Make and pack | You | In Copacker | Today | Enter the cartons with contents, size in cm and weight in kg, the pickup address and phone, and the ready date. | Whole packs only, never more than ordered, with a current invoice. FBA cartons are at most 91.44 × 63.5 × 63.5 cm and 22.67 kg unless one unit is larger. |
| Make and pack | You | In Copacker | Today | Upload the commercial invoice, or keep the one Copacker generated. | Required to submit packing, and again to ship. |
| Make and pack | Copacker | In Copacker | Planned | Generate the commercial invoice from the purchase order and packing, with customs details and your EIN as importer of record. The supplier can upload its own instead. |  |
| Make and pack | You | In Copacker | Planned | Check the invoice's customs details: HS codes, country of origin, Incoterm and importer of record. |  |
| Amazon inbound | Copacker | Copacker, through Amazon's API | Today | Create the FBA inbound plan: packing option, placement, box contents, your own carrier, a delivery window and box labels. | Every SKU needs a prep category, and each carton's products must fit one packing group. The forwarder's address needs a phone. |
| Amazon inbound | Copacker | Copacker, through Amazon's API | Proposed | Choose the delivery window from the expected arrival. Today it's chosen from the ready date, which is too early for goods still in transit. |  |
| Amazon inbound | Copacker | Copacker, through Amazon's API | Today | Send the forwarder's address to Amazon as the origin. |  |
| Amazon inbound | You | In Copacker | Today | If creation fails, fix it and retry, or link the order you made in Seller Central. |  |
| Book transport | Supplier | Outside Copacker | Today | Deliver to the forwarder's address on the purchase order. |  |
| Book transport | Forwarder | Outside Copacker | Today | Book the onward leg. |  |
| Release | You | In Copacker | Today | Release the packet, then share it with the supplier yourself. Copacker only emails suppliers on Copacker. | Every carton needs its Amazon label; the packing list, checklist and product labels must be current; you enter a booking reference. Today release also demands a shipping label per carton. Planned: only when you arrange shipping. |
| Ship | Supplier | Outside Copacker | Today | Print the packet. Label every Amazon unit with its FNSKU and every Amazon carton with Amazon's label. |  |
| Ship | You | In Copacker | Today | Mark shipped. | The commercial invoice must still be current. |
| At the forwarder | Forwarder | In Copacker | Proposed | Record the shipment's arrival, and any damage. |  |
| At the forwarder | Forwarder | In Copacker | Today | Forward: carrier, reference and freight cost. You do it for a forwarder that isn't on Copacker. | Freight must be in the purchase order's currency. |
| Customs | Forwarder | Outside Copacker | Today | Clear export at origin. |  |
| Customs | Customs broker | Outside Copacker | Today | File the ISF at least 24 hours before loading, for ocean freight. |  |
| Customs | Customs broker | Outside Copacker | Today | File the customs entry, with you as importer of record, and pay duties and tariffs. |  |
| Customs | Forwarder | In Copacker | Planned | Upload the bill of lading to the shipment. Whoever handles customs does this. | Optional for now. Nothing waits for it. |
| Customs | You | In Copacker | Today | Record duties and tariffs as landed costs. |  |
| Delivery and receiving | Amazon | Outside Copacker | Today | Receive and count the cartons. |  |
| Delivery and receiving | You | In Copacker | Today | Mark the shipment received by hand. |  |
| Delivery and receiving | Copacker | Copacker, through Amazon's API | Planned | Read Amazon's received counts, and close the shipment when Amazon closes it. |  |
| Delivery and receiving | You | Seller Central | Today | Open a case with Amazon for missing or damaged units. |  |
| Close | Copacker | In Copacker | Today | The shipment closes when it's marked received: by you today, and when Amazon closes it once receipts are read. |  |
| Close | You | In Copacker | Today | Close the purchase order once every shipment is received or cancelled. Shipments still being packed are cancelled. |  |

| Document | From | Copacker today | Next |
| --- | --- | --- | --- |
| Purchase order | You | Copacker makes it |  |
| Commercial invoice, with customs details | The supplier, as seller | Copacker makes it in some cases | Planned: Copacker generates it. Today Copacker generates one only after approved changes, without customs fields. Planned: generated for every shipment, with customs details and your EIN; the supplier can upload its own instead. |
| Packing list | The supplier | Copacker makes it |  |
| Packing checklist | Copacker | Copacker makes it |  |
| Unit labels (FNSKU) | Applied by the supplier | Copacker makes it |  |
| Suffocation warnings | Applied by the supplier, on polybags | Copacker makes it |  |
| FBA box labels | Amazon | Copacker fetches it from Amazon |  |
| Onward shipping documents | The forwarder | Not from Copacker |  |
| Bill of lading | The forwarder's carrier | Not from Copacker | Planned: optional upload on the shipment. Planned: an optional upload on the shipment, by the forwarder, who handles customs. |
| ISF data | Your customs broker files it | Not from Copacker | Proposed: Copacker drafts it. Proposed: drafted in part; HTS codes and importer numbers are missing. |
| Customs entry | Your customs broker | Not from Copacker |  |
| Freight invoice | The forwarder | Copacker records the amount | Copacker records the amount when forwarding. |
| Proof of delivery | The carrier | Not from Copacker |  |

**Closes.** The shipment closes when it's marked received: by you today, and when Amazon closes it once receipts are read. The purchase order closes when you close it, once every shipment is received or cancelled.

## Supplier to AWD US, your carrier

- **Status today:** Supported today.
- **Shipping arranged by:** You.
- **Steps you take in Amazon:** 3.
- The purchase order lists each network's packing rules, but nobody confirms them before sending.

| Phase | Who | Where | Status | Step | Gate |
| --- | --- | --- | --- | --- | --- |
| Before the first order | You | In Copacker | Today | Connect Shopify. Purchase order lines are Shopify variants. |  |
| Before the first order | You | In Copacker | Today | Connect Amazon, US marketplace. |  |
| Before the first order | You | Seller Central | Today | Create each product's listing, so it has an ASIN and FNSKU. | Sending is refused for any SKU without a listing. |
| Draft and send | You | In Copacker | Today | Draft the purchase order: supplier, reference, destination, products in whole packs, prices, currency, required-by date, payment terms and notes. | Products must exist in Shopify and ASINs must match Amazon. A supplier on Copacker must have the units available. |
| Draft and send | You | In Copacker | Today | Set each line's network to AWD US. |  |
| Draft and send | You | In Copacker | Planned | Confirm the packing requirements for each destination, since the supplier packs each one differently. | Sending is refused until you confirm. |
| Draft and send | You | In Copacker | Planned | Set who arranges shipping, here you. That decides who provides the shipping labels. |  |
| Draft and send | You | In Copacker | Proposed | Set the Incoterm. |  |
| Draft and send | You | In Copacker | Today | Send, then email the purchase order PDF to the supplier yourself. Copacker opens the first shipment. | Amazon must be connected and list every SKU. |
| Make and pack | Supplier | Outside Copacker | Today | Make the goods and set the ready date. |  |
| Make and pack | You | In Copacker | Today | Enter the cartons with contents, size in cm and weight in kg, the pickup address and phone, and the ready date. | Whole packs only, never more than ordered, with a current invoice. AWD cartons hold one SKU, at most 150 units, packed the same way. |
| Make and pack | You | In Copacker | Today | Upload the commercial invoice, or keep the one Copacker generated. | Required to submit packing, and again to ship. |
| Make and pack | Copacker | In Copacker | Planned | Generate the commercial invoice from the purchase order and packing. The supplier can upload its own instead. |  |
| Amazon inbound | Copacker | Copacker, through Amazon's API | Today | Check AWD eligibility, create and confirm the inbound order, and fetch the SSCC carton labels. | Amazon must find the cartons eligible and have AWD capacity. |
| Amazon inbound | You | In Copacker | Today | If creation fails, fix it and retry, or link the order you made in Seller Central. |  |
| Book transport | You | Outside Copacker | Today | Book your carrier outside Amazon. |  |
| Book transport | You | In Copacker | Today | Upload one shipping label per carton. |  |
| Book transport | You | Seller Central | Today | Give Amazon the tracking numbers, or the freight bill and bill of lading numbers for truck freight. |  |
| Book transport | Copacker | Copacker, through Amazon's API | Proposed | Send them to Amazon instead: a tracking number per box for small parcel, or the freight bill and bill of lading numbers for truck freight. |  |
| Book transport | Carrier | Carrier Central | Today | For truck freight, book a delivery appointment. |  |
| Release | You | In Copacker | Today | Release the packet, then share it with the supplier yourself. Copacker only emails suppliers on Copacker. | Every carton needs its Amazon label and a shipping label; the packing list, checklist and product labels must be current; you enter a booking reference. |
| Ship | Supplier | Outside Copacker | Today | Print the packet. Label every Amazon unit with its FNSKU and every Amazon carton with Amazon's label, then apply your carrier labels. |  |
| Ship | You | In Copacker | Today | Mark shipped. | The commercial invoice must still be current. |
| Delivery and receiving | Amazon | Outside Copacker | Today | Receive and count the cartons. |  |
| Delivery and receiving | You | In Copacker | Today | Mark the shipment received by hand. |  |
| Delivery and receiving | Copacker | Copacker, through Amazon's API | Planned | Read Amazon's received counts, and close the shipment when Amazon closes it. |  |
| Delivery and receiving | You | Seller Central | Today | Open a case with Amazon for missing or damaged units. |  |
| Close | Copacker | In Copacker | Today | The shipment closes when it's marked received: by you today, and when Amazon closes it once receipts are read. |  |
| Close | You | In Copacker | Today | Close the purchase order once every shipment is received or cancelled. Shipments still being packed are cancelled. |  |

| Document | From | Copacker today | Next |
| --- | --- | --- | --- |
| Purchase order | You | Copacker makes it |  |
| Commercial invoice | The supplier, as seller | Copacker makes it in some cases | Planned: Copacker generates it. Today Copacker generates one only after approved changes. Planned: generated for every shipment; the supplier can upload its own instead. |
| Packing list | The supplier | Copacker makes it |  |
| Packing checklist | Copacker | Copacker makes it |  |
| Unit labels (FNSKU) | Applied by the supplier | Copacker makes it |  |
| Suffocation warnings | Applied by the supplier, on polybags | Copacker makes it |  |
| AWD SSCC carton labels | Amazon | Copacker fetches it from Amazon |  |
| Shipping labels | Your carrier | Not from Copacker | You upload one per carton. |
| Pallet labels and bill of lading, for truck freight | Amazon and the carrier | Not from Copacker | Planned: optional upload on the shipment. Planned: the bill of lading is an optional upload on the shipment, by you, who arranges shipping. |
| Proof of delivery | The carrier | Not from Copacker |  |

**Closes.** The shipment closes when it's marked received: by you today, and when Amazon closes it once receipts are read. The purchase order closes when you close it, once every shipment is received or cancelled.

## Amazon GWD in China

Amazon's warehouses in China; it moves stock on to FBA.

- **Status today:** Not supported yet.
- **Shipping arranged by:** Supplier.
- **Handles customs:** Amazon.
- **Steps you take in Amazon:** 4.
- Copacker has no GWD destination yet.
- Amazon documents no API for GWD delivery requests, so they're made in Seller Central.
- GWD's carton rules still need checking.

| Phase | Who | Where | Status | Step | Gate |
| --- | --- | --- | --- | --- | --- |
| Before the first order | You | In Copacker | Today | Connect Shopify. Purchase order lines are Shopify variants. |  |
| Before the first order | You | In Copacker | Today | Connect Amazon, US marketplace. |  |
| Before the first order | You | Seller Central | Today | Create each product's listing, so it has an ASIN and FNSKU. |  |
| Before the first order | You | Global Logistics in Seller Central | Today | Set up the importer of record and bond for Global Logistics. Amazon uses them when it moves stock from GWD to the US. |  |
| Draft and send | You | In Copacker | Planned | Draft the purchase order with Amazon GWD in China as the destination. |  |
| Draft and send | You | In Copacker | Planned | Set who arranges shipping, here the supplier. |  |
| Draft and send | You | In Copacker | Today | Send, then email the purchase order PDF to the supplier yourself. Copacker opens the first shipment. |  |
| Make and pack | Supplier | Outside Copacker | Today | Make the goods and set the ready date. |  |
| Make and pack | You | In Copacker | Today | Enter the cartons with contents, size in cm and weight in kg, the pickup address and phone, and the ready date. | GWD's carton rules still need checking. |
| Make and pack | You | In Copacker | Today | Upload the commercial invoice, or keep the one Copacker generated. | Required to submit packing, and again to ship. |
| Make and pack | Copacker | In Copacker | Planned | Generate the commercial invoice from the purchase order and packing, with your EIN as importer of record. The supplier can upload its own instead. |  |
| Amazon inbound | You | Seller Central | Planned | Create the delivery request to GWD. Amazon documents no API for it. |  |
| Amazon inbound | You | In Copacker | Planned | Link the delivery request to the shipment. |  |
| Book transport | Supplier | Outside Copacker | Today | Deliver to the GWD warehouse, inside China. |  |
| Release | You | Seller Central | Planned | Download Amazon's carton labels from the delivery request. |  |
| Release | You | In Copacker | Planned | Upload them to the shipment, release the packet, and share it with the supplier yourself. |  |
| Ship | Supplier | Outside Copacker | Today | Label every unit with its FNSKU and every carton with Amazon's label. |  |
| Ship | You | In Copacker | Today | Mark shipped. | The commercial invoice must still be current. |
| Delivery and receiving | Amazon | Outside Copacker | Today | Receive and store the cartons at GWD. |  |
| Delivery and receiving | You | In Copacker | Planned | Mark the shipment received once Amazon checks it in, or let Copacker read it if Amazon offers an API for GWD. |  |
| Close | Copacker | In Copacker | Today | The shipment closes when GWD receives it. Moving stock on to FBA is Amazon's job, outside the purchase order. |  |
| Close | Amazon | Outside Copacker | Today | Later, when it moves stock to FBA: clear export and US import, with you as importer of record. |  |
| Close | You | In Copacker | Today | Record duties and tariffs as landed costs when Amazon charges them, and close the purchase order once every shipment is received or cancelled. |  |

| Document | From | Copacker today | Next |
| --- | --- | --- | --- |
| Purchase order | You | Copacker makes it |  |
| Commercial invoice, with customs details | The supplier, as seller | Copacker makes it in some cases | Planned: Copacker generates it. Planned: generated for every shipment, with your EIN; the supplier can upload its own instead. |
| Packing list | The supplier | Copacker makes it |  |
| Packing checklist | Copacker | Copacker makes it |  |
| Unit labels (FNSKU) | Applied by the supplier | Copacker makes it |  |
| GWD carton labels | Amazon, from the delivery request | Not from Copacker | Planned: optional upload on the shipment. Planned: you upload them from Seller Central. |
| Bill of lading | Amazon Global Logistics, when stock moves to the US | Not from Copacker |  |
| Proof of delivery | The carrier | Not from Copacker |  |

**Closes.** The shipment closes when Amazon receives it at GWD. The purchase order closes when you close it, once every shipment is received or cancelled.

## AWD US, from China

Amazon Global Logistics, not Amazon's warehouses in China (GWD).

- **Status today:** Not supported yet.
- **Shipping arranged by:** Amazon.
- **Handles customs:** Amazon.
- **Steps you take in Amazon:** 6.
- Copacker has no Amazon Global Logistics route yet.
- Customs runs outside Copacker, the commercial invoice has no customs fields, and there's nowhere to attach the bill of lading.
- The purchase order lists each network's packing rules, but nobody confirms them before sending.
- FBA's delivery window is chosen from the ready date, before the goods have crossed.

| Phase | Who | Where | Status | Step | Gate |
| --- | --- | --- | --- | --- | --- |
| Before the first order | You | In Copacker | Today | Connect Shopify. Purchase order lines are Shopify variants. |  |
| Before the first order | You | In Copacker | Today | Connect Amazon, US marketplace. |  |
| Before the first order | You | Seller Central | Today | Create each product's listing, so it has an ASIN and FNSKU. | Sending is refused for any SKU without a listing. |
| Before the first order | You | Outside Copacker | Today | Be the importer of record: an EIN or CBP-assigned number, a continuous customs bond, and a customs broker. |  |
| Before the first order | You | Global Logistics in Seller Central | Today | Set up Amazon Global Logistics once: account, payment method, importer of record and bond. |  |
| Draft and send | You | In Copacker | Today | Draft the purchase order: supplier, reference, destination, products in whole packs, prices, currency, required-by date, payment terms and notes. | Products must exist in Shopify and ASINs must match Amazon. A supplier on Copacker must have the units available. |
| Draft and send | You | In Copacker | Today | Set each line's network to AWD US. |  |
| Draft and send | You | In Copacker | Planned | Confirm the packing requirements for each destination, since the supplier packs each one differently. | Sending is refused until you confirm. |
| Draft and send | You | In Copacker | Planned | Set who arranges shipping, here Amazon. That decides who provides the shipping labels. |  |
| Draft and send | You | In Copacker | Proposed | Set the Incoterm. |  |
| Draft and send | You | In Copacker | Today | Send, then email the purchase order PDF to the supplier yourself. Copacker opens the first shipment. | Amazon must be connected and list every SKU. |
| Make and pack | Supplier | Outside Copacker | Today | Make the goods and set the ready date. |  |
| Make and pack | You | In Copacker | Today | Enter the cartons with contents, size in cm and weight in kg, the pickup address and phone, and the ready date. | Whole packs only, never more than ordered, with a current invoice. AWD cartons hold one SKU, at most 150 units, packed the same way. |
| Make and pack | You | In Copacker | Today | Upload the commercial invoice, or keep the one Copacker generated. | Required to submit packing, and again to ship. |
| Make and pack | Copacker | In Copacker | Planned | Generate the commercial invoice from the purchase order and packing, with customs details and your EIN as importer of record. The supplier can upload its own instead. |  |
| Make and pack | You | In Copacker | Planned | Check the invoice's customs details: HS codes, country of origin, Incoterm and importer of record. |  |
| Amazon inbound | Copacker | Copacker, through Amazon's API | Planned | Create the AWD inbound order from the supplier's address in China, preferring a region Global Logistics delivers to (east or west). | Amazon's AWD API takes any origin country; the first China order confirms Amazon accepts it. |
| Amazon inbound | You | In Copacker | Today | If creation fails, fix it and retry, or link the order you made in Seller Central. |  |
| Book transport | Copacker | In Copacker | Planned | Prepare a booking sheet to copy from: cargo ready date, cartons, volume, weight, Incoterm, pickup address, shipper, your EIN as importer of record, destination contact and ISF parties. |  |
| Book transport | You | Global Logistics in Seller Central | Today | Book Global Logistics: ocean FCL or LCL, or air; origin port; cargo ready date; Incoterm; pickup at the supplier; palletization; shipper, importer of record, destination contact and ISF parties. Accept the charges. |  |
| Book transport | You | Global Logistics in Seller Central | Today | Upload the commercial invoice and packing list to the booking. | Copacker makes both files. Only the upload is by hand. |
| Book transport | You | In Copacker | Planned | Enter the Global Logistics booking number in Copacker. |  |
| Release | You | In Copacker | Today | Release the packet, then share it with the supplier yourself. Copacker only emails suppliers on Copacker. | Every carton needs its Amazon label; the packing list, checklist and product labels must be current; the booking reference is the Global Logistics booking number. Today release also demands a shipping label per carton. Planned: only when you arrange shipping. |
| Ship | Supplier | Outside Copacker | Today | Print the packet. Label every Amazon unit with its FNSKU and every Amazon carton with Amazon's label. |  |
| Ship | You | In Copacker | Today | Mark shipped. | The commercial invoice must still be current. |
| Customs | Amazon | Outside Copacker | Today | Clear export at origin. |  |
| Customs | Amazon | Outside Copacker | Today | File the ISF at least 24 hours before loading, for ocean freight. |  |
| Customs | Amazon | Outside Copacker | Today | File the customs entry, with you as importer of record, and pay duties and tariffs. |  |
| Customs | You | Global Logistics in Seller Central | Planned | Download the bill of lading from the Global Logistics booking. |  |
| Customs | You | In Copacker | Planned | Upload the bill of lading to the shipment. Whoever handles customs does this. | Optional for now. Nothing waits for it. |
| Customs | You | In Copacker | Today | Record duties and tariffs as landed costs. |  |
| Delivery and receiving | Amazon | Outside Copacker | Today | Receive and count the cartons. |  |
| Delivery and receiving | You | In Copacker | Today | Mark the shipment received by hand. |  |
| Delivery and receiving | Copacker | Copacker, through Amazon's API | Planned | Read Amazon's received counts, and close the shipment when Amazon closes it. |  |
| Delivery and receiving | You | Seller Central | Today | Open a case with Amazon for missing or damaged units. |  |
| Close | Copacker | In Copacker | Today | The shipment closes when it's marked received: by you today, and when Amazon closes it once receipts are read. |  |
| Close | You | In Copacker | Today | Close the purchase order once every shipment is received or cancelled. Shipments still being packed are cancelled. |  |

| Document | From | Copacker today | Next |
| --- | --- | --- | --- |
| Purchase order | You | Copacker makes it |  |
| Commercial invoice, with customs details | The supplier, as seller | Copacker makes it in some cases | Planned: Copacker generates it. Today Copacker generates one only after approved changes, without customs fields. Planned: generated for every shipment, with customs details and your EIN; the supplier can upload its own instead. |
| Packing list | The supplier | Copacker makes it |  |
| Packing checklist | Copacker | Copacker makes it |  |
| Unit labels (FNSKU) | Applied by the supplier | Copacker makes it |  |
| Suffocation warnings | Applied by the supplier, on polybags | Copacker makes it |  |
| AWD SSCC carton labels | Amazon | Copacker fetches it from Amazon |  |
| Bill of lading | Amazon Global Logistics | Not from Copacker | Planned: optional upload on the shipment. Planned: an optional upload on the shipment, by you, downloading it from the Global Logistics booking, since Amazon handles customs. |
| ISF data | Your customs broker files it | Not from Copacker | Proposed: Copacker drafts it. Proposed: drafted in part; HTS codes and importer numbers are missing. |
| Customs entry | Amazon Global Logistics | Not from Copacker |  |
| Letter of guarantee and rate arrangement | Amazon Global Logistics | Not from Copacker |  |
| Proof of delivery | The carrier | Not from Copacker |  |

**Closes.** The shipment closes when it's marked received: by you today, and when Amazon closes it once receipts are read. The purchase order closes when you close it, once every shipment is received or cancelled.

## AWD through your forwarder

- **Status today:** Partly supported.
- **Shipping arranged by:** Forwarder.
- **Handles customs:** Forwarder.
- **Steps you take in Amazon:** 2.
- Customs runs outside Copacker, the commercial invoice has no customs fields, and there's nowhere to attach the bill of lading.
- There's no arrival step at the forwarder, and forwarders get no shipment emails.
- The purchase order lists each network's packing rules, but nobody confirms them before sending.
- FBA's delivery window is chosen from the ready date, before the goods have crossed.

| Phase | Who | Where | Status | Step | Gate |
| --- | --- | --- | --- | --- | --- |
| Before the first order | You | In Copacker | Today | Connect Shopify. Purchase order lines are Shopify variants. |  |
| Before the first order | You | In Copacker | Today | Connect Amazon, US marketplace. |  |
| Before the first order | You | Seller Central | Today | Create each product's listing, so it has an ASIN and FNSKU. | Sending is refused for any SKU without a listing. |
| Before the first order | You | In Copacker | Today | Save the forwarder and its address with a phone number. Amazon uses it as the pickup contact. |  |
| Before the first order | You | Outside Copacker | Today | Be the importer of record: an EIN or CBP-assigned number, a continuous customs bond, and a customs broker. |  |
| Draft and send | You | In Copacker | Today | Draft the purchase order: supplier, reference, destination, products in whole packs, prices, currency, required-by date, payment terms and notes. | Products must exist in Shopify and ASINs must match Amazon. A supplier on Copacker must have the units available. |
| Draft and send | You | In Copacker | Today | Set each line's network to AWD US. |  |
| Draft and send | You | In Copacker | Planned | Confirm the packing requirements for each destination, since the supplier packs each one differently. | Sending is refused until you confirm. |
| Draft and send | You | In Copacker | Today | Pick the forwarder stop. The purchase order then shows the forwarder as ship-to. |  |
| Draft and send | You | In Copacker | Planned | Set who arranges shipping, here the forwarder. That decides who provides the shipping labels. |  |
| Draft and send | You | In Copacker | Proposed | Set the Incoterm. |  |
| Draft and send | You | In Copacker | Today | Send, then email the purchase order PDF to the supplier yourself. Copacker opens the first shipment. | Amazon must be connected and list every SKU. |
| Draft and send | Copacker | In Copacker | Proposed | Email the forwarder that a shipment is coming. |  |
| Make and pack | Supplier | Outside Copacker | Today | Make the goods and set the ready date. |  |
| Make and pack | You | In Copacker | Today | Enter the cartons with contents, size in cm and weight in kg, the pickup address and phone, and the ready date. | Whole packs only, never more than ordered, with a current invoice. AWD cartons hold one SKU, at most 150 units, packed the same way. |
| Make and pack | You | In Copacker | Today | Upload the commercial invoice, or keep the one Copacker generated. | Required to submit packing, and again to ship. |
| Make and pack | Copacker | In Copacker | Planned | Generate the commercial invoice from the purchase order and packing, with customs details and your EIN as importer of record. The supplier can upload its own instead. |  |
| Make and pack | You | In Copacker | Planned | Check the invoice's customs details: HS codes, country of origin, Incoterm and importer of record. |  |
| Amazon inbound | Copacker | Copacker, through Amazon's API | Today | Check AWD eligibility, create and confirm the inbound order, and fetch the SSCC carton labels. | Amazon must find the cartons eligible and have AWD capacity. The forwarder's address needs a phone. |
| Amazon inbound | Copacker | Copacker, through Amazon's API | Today | Send the forwarder's address to Amazon as the origin. |  |
| Amazon inbound | You | In Copacker | Today | If creation fails, fix it and retry, or link the order you made in Seller Central. |  |
| Book transport | Supplier | Outside Copacker | Today | Deliver to the forwarder's address on the purchase order. |  |
| Book transport | Forwarder | Outside Copacker | Today | Book the onward leg. |  |
| Release | You | In Copacker | Today | Release the packet, then share it with the supplier yourself. Copacker only emails suppliers on Copacker. | Every carton needs its Amazon label; the packing list, checklist and product labels must be current; you enter a booking reference. Today release also demands a shipping label per carton. Planned: only when you arrange shipping. |
| Ship | Supplier | Outside Copacker | Today | Print the packet. Label every Amazon unit with its FNSKU and every Amazon carton with Amazon's label. |  |
| Ship | You | In Copacker | Today | Mark shipped. | The commercial invoice must still be current. |
| At the forwarder | Forwarder | In Copacker | Proposed | Record the shipment's arrival, and any damage. |  |
| At the forwarder | Forwarder | In Copacker | Today | Forward: carrier, reference and freight cost. You do it for a forwarder that isn't on Copacker. | Freight must be in the purchase order's currency. |
| Customs | Forwarder | Outside Copacker | Today | Clear export at origin. |  |
| Customs | Customs broker | Outside Copacker | Today | File the ISF at least 24 hours before loading, for ocean freight. |  |
| Customs | Customs broker | Outside Copacker | Today | File the customs entry, with you as importer of record, and pay duties and tariffs. |  |
| Customs | Forwarder | In Copacker | Planned | Upload the bill of lading to the shipment. Whoever handles customs does this. | Optional for now. Nothing waits for it. |
| Customs | You | In Copacker | Today | Record duties and tariffs as landed costs. |  |
| Delivery and receiving | Amazon | Outside Copacker | Today | Receive and count the cartons. |  |
| Delivery and receiving | You | In Copacker | Today | Mark the shipment received by hand. |  |
| Delivery and receiving | Copacker | Copacker, through Amazon's API | Planned | Read Amazon's received counts, and close the shipment when Amazon closes it. |  |
| Delivery and receiving | You | Seller Central | Today | Open a case with Amazon for missing or damaged units. |  |
| Close | Copacker | In Copacker | Today | The shipment closes when it's marked received: by you today, and when Amazon closes it once receipts are read. |  |
| Close | You | In Copacker | Today | Close the purchase order once every shipment is received or cancelled. Shipments still being packed are cancelled. |  |

| Document | From | Copacker today | Next |
| --- | --- | --- | --- |
| Purchase order | You | Copacker makes it |  |
| Commercial invoice, with customs details | The supplier, as seller | Copacker makes it in some cases | Planned: Copacker generates it. Today Copacker generates one only after approved changes, without customs fields. Planned: generated for every shipment, with customs details and your EIN; the supplier can upload its own instead. |
| Packing list | The supplier | Copacker makes it |  |
| Packing checklist | Copacker | Copacker makes it |  |
| Unit labels (FNSKU) | Applied by the supplier | Copacker makes it |  |
| Suffocation warnings | Applied by the supplier, on polybags | Copacker makes it |  |
| AWD SSCC carton labels | Amazon | Copacker fetches it from Amazon |  |
| Onward shipping documents | The forwarder | Not from Copacker |  |
| Bill of lading | The forwarder's carrier | Not from Copacker | Planned: optional upload on the shipment. Planned: an optional upload on the shipment, by the forwarder, who handles customs. |
| ISF data | Your customs broker files it | Not from Copacker | Proposed: Copacker drafts it. Proposed: drafted in part; HTS codes and importer numbers are missing. |
| Customs entry | Your customs broker | Not from Copacker |  |
| Freight invoice | The forwarder | Copacker records the amount | Copacker records the amount when forwarding. |
| Proof of delivery | The carrier | Not from Copacker |  |

**Closes.** The shipment closes when it's marked received: by you today, and when Amazon closes it once receipts are read. The purchase order closes when you close it, once every shipment is received or cancelled.

## FBA and AWD on one order

- **Status today:** Supported today.
- **Shipping arranged by:** You.
- **Steps you take in Amazon:** 4.
- The purchase order lists each network's packing rules, but nobody confirms them before sending.

| Phase | Who | Where | Status | Step | Gate |
| --- | --- | --- | --- | --- | --- |
| Before the first order | You | In Copacker | Today | Connect Shopify. Purchase order lines are Shopify variants. |  |
| Before the first order | You | In Copacker | Today | Connect Amazon, US marketplace. |  |
| Before the first order | You | Seller Central | Today | Create each product's listing, so it has an ASIN and FNSKU. | Sending is refused for any SKU without a listing. |
| Before the first order | You | Seller Central | Today | Give Amazon a prep category for any SKU it has none for. | The FBA inbound stops on a SKU without one. |
| Before the first order | Copacker | Copacker, through Amazon's API | Proposed | Set the missing prep category through Amazon's API instead, from the product's prep setting, once you confirm it. |  |
| Draft and send | You | In Copacker | Today | Draft the purchase order: supplier, reference, destination, products in whole packs, prices, currency, required-by date, payment terms and notes. | Products must exist in Shopify and ASINs must match Amazon. A supplier on Copacker must have the units available. |
| Draft and send | You | In Copacker | Today | Pick FBA or AWD US for each line. Lines start at FBA, or at AWD for products set to it. |  |
| Draft and send | You | In Copacker | Planned | Confirm the packing requirements for each destination, since the supplier packs each one differently. | Sending is refused until you confirm. |
| Draft and send | You | In Copacker | Planned | Set who arranges shipping, here you. That decides who provides the shipping labels. |  |
| Draft and send | You | In Copacker | Proposed | Set the Incoterm. |  |
| Draft and send | You | In Copacker | Today | Send, then email the purchase order PDF to the supplier yourself. Copacker opens the first shipment. | Amazon must be connected and list every SKU. |
| Make and pack | Supplier | Outside Copacker | Today | Make the goods and set the ready date. |  |
| Make and pack | You | In Copacker | Today | Enter the cartons with contents, size in cm and weight in kg, the pickup address and phone, and the ready date. | Whole packs only, never more than ordered, with a current invoice. FBA cartons are at most 91.44 × 63.5 × 63.5 cm and 22.67 kg unless one unit is larger. AWD cartons hold one SKU, at most 150 units, packed the same way. One network per carton. |
| Make and pack | You | In Copacker | Today | Upload the commercial invoice, or keep the one Copacker generated. | Required to submit packing, and again to ship. |
| Make and pack | Copacker | In Copacker | Planned | Generate the commercial invoice from the purchase order and packing. The supplier can upload its own instead. |  |
| Make and pack | Copacker | In Copacker | Today | Split the shipment by network: one for FBA and one for AWD US. |  |
| Amazon inbound | Copacker | Copacker, through Amazon's API | Today | Create the FBA inbound plan: packing option, placement, box contents, your own carrier, a delivery window and box labels. | Every SKU needs a prep category, and each carton's products must fit one packing group. |
| Amazon inbound | Copacker | Copacker, through Amazon's API | Today | Check AWD eligibility, create and confirm the inbound order, and fetch the SSCC carton labels. | Amazon must find the cartons eligible and have AWD capacity. |
| Amazon inbound | You | In Copacker | Today | If creation fails, fix it and retry, or link the order you made in Seller Central. |  |
| Book transport | You | Outside Copacker | Today | Book your carrier outside Amazon. |  |
| Book transport | You | In Copacker | Today | Upload one shipping label per carton. |  |
| Book transport | You | Seller Central | Today | Give Amazon the tracking numbers, or the freight bill and bill of lading numbers for truck freight. |  |
| Book transport | Copacker | Copacker, through Amazon's API | Proposed | Send them to Amazon instead: a tracking number per box for small parcel, or the freight bill and bill of lading numbers for truck freight. |  |
| Book transport | Carrier | Carrier Central | Today | For truck freight, book a delivery appointment. |  |
| Release | You | In Copacker | Today | Release the packet, then share it with the supplier yourself. Copacker only emails suppliers on Copacker. | Every carton needs its Amazon label and a shipping label; the packing list, checklist and product labels must be current; you enter a booking reference. |
| Ship | Supplier | Outside Copacker | Today | Print the packet. Label every Amazon unit with its FNSKU and every Amazon carton with Amazon's label, then apply your carrier labels. |  |
| Ship | You | In Copacker | Today | Mark shipped. | The commercial invoice must still be current. |
| Delivery and receiving | Amazon | Outside Copacker | Today | Receive and count the cartons. |  |
| Delivery and receiving | You | In Copacker | Today | Mark the shipment received by hand. |  |
| Delivery and receiving | Copacker | Copacker, through Amazon's API | Planned | Read Amazon's received counts, and close the shipment when Amazon closes it. |  |
| Delivery and receiving | You | Seller Central | Today | Open a case with Amazon for missing or damaged units. |  |
| Close | Copacker | In Copacker | Today | The shipment closes when it's marked received: by you today, and when Amazon closes it once receipts are read. |  |
| Close | You | In Copacker | Today | Close the purchase order once every shipment is received or cancelled. Shipments still being packed are cancelled. |  |

| Document | From | Copacker today | Next |
| --- | --- | --- | --- |
| Purchase order | You | Copacker makes it |  |
| Commercial invoice | The supplier, as seller | Copacker makes it in some cases | Planned: Copacker generates it. Today Copacker generates one only after approved changes. Planned: generated for every shipment; the supplier can upload its own instead. |
| Packing list | The supplier | Copacker makes it |  |
| Packing checklist | Copacker | Copacker makes it |  |
| Unit labels (FNSKU) | Applied by the supplier | Copacker makes it |  |
| Suffocation warnings | Applied by the supplier, on polybags | Copacker makes it |  |
| FBA box labels | Amazon | Copacker fetches it from Amazon |  |
| AWD SSCC carton labels | Amazon | Copacker fetches it from Amazon |  |
| Shipping labels | Your carrier | Not from Copacker | You upload one per carton. |
| Pallet labels and bill of lading, for truck freight | Amazon and the carrier | Not from Copacker | Planned: optional upload on the shipment. Planned: the bill of lading is an optional upload on the shipment, by you, who arranges shipping. |
| Proof of delivery | The carrier | Not from Copacker |  |

**Closes.** The shipment closes when it's marked received: by you today, and when Amazon closes it once receipts are read. The purchase order closes when you close it, once every shipment is received or cancelled.

## FBA, AWD and your warehouse on one order

- **Status today:** Not supported yet.
- **Shipping arranged by:** You.
- **Steps you take in Amazon:** 4.
- Warehouse lines can't share an order with Amazon lines yet.
- Shipments to your warehouse have no step for your shipping labels.

| Phase | Who | Where | Status | Step | Gate |
| --- | --- | --- | --- | --- | --- |
| Before the first order | You | In Copacker | Today | Connect Shopify. Purchase order lines are Shopify variants. |  |
| Before the first order | You | In Copacker | Today | Save the delivery address and link it to its Shopify location. |  |
| Before the first order | You | In Copacker | Today | Connect Amazon, US marketplace. |  |
| Before the first order | You | Seller Central | Today | Create each product's listing, so it has an ASIN and FNSKU. | Sending is refused for any SKU without a listing. |
| Before the first order | You | Seller Central | Today | Give Amazon a prep category for any SKU it has none for. | The FBA inbound stops on a SKU without one. |
| Before the first order | Copacker | Copacker, through Amazon's API | Proposed | Set the missing prep category through Amazon's API instead, from the product's prep setting, once you confirm it. |  |
| Draft and send | You | In Copacker | Today | Draft the purchase order: supplier, reference, destination, products in whole packs, prices, currency, required-by date, payment terms and notes. | Products must exist in Shopify and ASINs must match Amazon. A supplier on Copacker must have the units available. |
| Draft and send | You | In Copacker | Planned | Pick FBA, AWD US or your warehouse for each line, or split a line's units across them. Amazon lines start at FBA, or at AWD for products set to it. |  |
| Draft and send | You | In Copacker | Planned | Confirm the packing requirements for each destination, since the supplier packs each one differently. | Sending is refused until you confirm. |
| Draft and send | You | In Copacker | Planned | Set who arranges shipping, here you. That decides who provides the shipping labels. |  |
| Draft and send | You | In Copacker | Proposed | Set the Incoterm. |  |
| Draft and send | You | In Copacker | Today | Send, then email the purchase order PDF to the supplier yourself. Copacker opens the first shipment. | Amazon must be connected and list every SKU. |
| Make and pack | Supplier | Outside Copacker | Today | Make the goods and set the ready date. |  |
| Make and pack | You | In Copacker | Today | Enter the cartons with contents, size in cm and weight in kg, the pickup address and phone, and the ready date. | Whole packs only, never more than ordered, with a current invoice. FBA cartons are at most 91.44 × 63.5 × 63.5 cm and 22.67 kg unless one unit is larger. AWD cartons hold one SKU, at most 150 units, packed the same way. One destination per carton. |
| Make and pack | You | In Copacker | Today | Upload the commercial invoice, or keep the one Copacker generated. | Required to submit packing, and again to ship. |
| Make and pack | Copacker | In Copacker | Planned | Generate the commercial invoice from the purchase order and packing. The supplier can upload its own instead. |  |
| Make and pack | Copacker | In Copacker | Planned | Split the shipment by destination: one each for FBA, AWD US and your warehouse, each on its own route. |  |
| Amazon inbound | Copacker | Copacker, through Amazon's API | Today | Create the FBA inbound plan: packing option, placement, box contents, your own carrier, a delivery window and box labels. | Every SKU needs a prep category, and each carton's products must fit one packing group. |
| Amazon inbound | Copacker | Copacker, through Amazon's API | Today | Check AWD eligibility, create and confirm the inbound order, and fetch the SSCC carton labels. | Amazon must find the cartons eligible and have AWD capacity. |
| Amazon inbound | You | In Copacker | Today | If creation fails, fix it and retry, or link the order you made in Seller Central. |  |
| Book transport | You | Outside Copacker | Today | Book your carrier outside Amazon. |  |
| Book transport | You | In Copacker | Today | Upload one shipping label per carton. |  |
| Book transport | You | Seller Central | Today | Give Amazon the tracking numbers, or the freight bill and bill of lading numbers for truck freight. |  |
| Book transport | Copacker | Copacker, through Amazon's API | Proposed | Send them to Amazon instead: a tracking number per box for small parcel, or the freight bill and bill of lading numbers for truck freight. |  |
| Book transport | Carrier | Carrier Central | Today | For truck freight, book a delivery appointment. |  |
| Release | You | In Copacker | Today | Release the packet, then share it with the supplier yourself. Copacker only emails suppliers on Copacker. | Every carton needs its Amazon label and a shipping label; the packing list, checklist and product labels must be current; you enter a booking reference. |
| Release | Copacker | In Copacker | Today | No release step for the warehouse shipment. It's ready as soon as packing is submitted. |  |
| Release | You | In Copacker | Planned | Release once your shipping labels are uploaded, so the supplier can print them. |  |
| Ship | Supplier | Outside Copacker | Today | Print the packet. Label every Amazon unit with its FNSKU and every Amazon carton with Amazon's label, then apply your carrier labels. |  |
| Ship | Supplier | Outside Copacker | Today | For your warehouse's cartons, label units only if a product is set to get SKU labels. No carton labels. Apply your shipping labels. |  |
| Ship | You | In Copacker | Today | Mark shipped. | The commercial invoice must still be current. |
| Delivery and receiving | Amazon | Outside Copacker | Today | Receive and count the cartons. |  |
| Delivery and receiving | You | In Copacker | Today | Mark the Amazon shipments received by hand. |  |
| Delivery and receiving | Copacker | Copacker, through Amazon's API | Planned | Read Amazon's received counts, and close the shipment when Amazon closes it. |  |
| Delivery and receiving | You | Seller Central | Today | Open a case with Amazon for missing or damaged units. |  |
| Delivery and receiving | You | In Copacker | Today | Mark the warehouse shipment received. Today that's one button with no quantities. |  |
| Delivery and receiving | You | In Copacker | Planned | Receive per line: received and rejected units. Rejected units never enter stock. |  |
| Close | Copacker | In Copacker | Today | Each destination's shipment closes on its own: the warehouse one when you receive it, the Amazon ones when they're marked received. |  |
| Close | You | In Copacker | Today | Close the purchase order once every shipment is received or cancelled. Shipments still being packed are cancelled. |  |

| Document | From | Copacker today | Next |
| --- | --- | --- | --- |
| Purchase order | You | Copacker makes it |  |
| Commercial invoice | The supplier, as seller | Copacker makes it in some cases | Planned: Copacker generates it. Today Copacker generates one only after approved changes. Planned: generated for every shipment; the supplier can upload its own instead. |
| Packing list | The supplier | Copacker makes it |  |
| Packing checklist | Copacker | Copacker makes it |  |
| Unit labels (FNSKU) | Applied by the supplier, on Amazon lines | Copacker makes it |  |
| Suffocation warnings | Applied by the supplier, on polybags | Copacker makes it |  |
| SKU labels | Warehouse lines, only for products set to get them | Copacker makes it |  |
| FBA box labels | Amazon | Copacker fetches it from Amazon |  |
| AWD SSCC carton labels | Amazon | Copacker fetches it from Amazon |  |
| Shipping labels | Your carrier | Not from Copacker | You upload one per carton. |
| Pallet labels and bill of lading, for truck freight | Amazon and the carrier | Not from Copacker | Planned: optional upload on the shipment. Planned: the bill of lading is an optional upload on the shipment, by you, who arranges shipping. |
| Proof of delivery | The carrier | Not from Copacker |  |

**Closes.** Each destination's shipment closes on its own: the warehouse one when you receive it, the Amazon ones when they're marked received. The purchase order closes when you close it, once every shipment is received or cancelled.
