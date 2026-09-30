# Supplier workspace

Part of the [app redesign spec](README.md). Every supplier page in the redesign, applying the
[foundations](design-spec.md). **New** marks a capability the app doesn't have yet.

## Navigation

| Group    | Item      | Route         | Area                         | Count shown                    |
| -------- | --------- | ------------- | ---------------------------- | ------------------------------ |
|          | Home      | `/home`       | always                       |                                |
|          | Inbox     | `/inbox`      | always                       | Open tasks                     |
| Sales    | Orders    | `/orders`     | `orders`                     | Orders to pack                 |
| Sales    | Shipments | `/shipments`  | `shipments`                  | Shipments to ship              |
| Sales    | Customers | `/customers`  | `customers`                  |                                |
| Products | Products  | `/products`   | `products`                   |                                |
| Products | Inventory | `/inventory`  | `inventory`                  | Short variants                 |
| Products | Catalogs  | `/catalogs`   | `catalogs`                   |                                |
| Insights | Analytics | `/analytics`  | `analytics` (was `overview`) |                                |
|          | Settings  | `/settings`   | always                       |                                |

A supplier keeps calling purchase orders **Orders**: they're orders it received. Each order's page names its side:
"PO-1045 from Harbor Goods". Create menu: Product, Catalog, Import products.

The supplier's home becomes Home, not Orders (F5); `homeFor` sends every kind to `/home`.

## Home `/home`

1. **To do:** Accept orders, Pack orders, Fix packing problems, Print labels and mark shipped, Answer declined changes,
   Short stock, Products without a price, Customers without a catalog. Each with its record, customer and required-by
   date.
2. **Order pipeline:** To accept, To pack, Waiting on customers, Ready to ship, In transit, each with orders and units,
   opening the Orders view.
3. **Pickups this week:** shipments by ready-for-pickup date: order, customer, cartons, pickup address, status.
4. **Stock against open orders:** short and out-of-stock variants with what open orders need, opening Inventory's
   Short view.
5. **Snapshot** (prices): orders received and order value for 30 days, and **Open analytics**.

## Orders `/orders`

Index template.

- **Views:** To accept, To pack, Waiting on customers, To ship, Shipped, Closed, All. To accept is the default when it
  has orders, then To pack.
- **Filters:** customer, required by, ready date, destination (Amazon or the customer's warehouse). Search by
  reference, customer or SKU.
- **Columns:** order (reference, products), customer, ordered (date sent), required by, ready date, units shipped of
  ordered, total (prices), status.

### Order `/orders/[id]`

The shared PO record, the supplier's view.

- **Header:** "PO-1045", status, "From Harbor Goods" in the meta row; **Download PDF** and **Propose changes** (from the
  moment the order arrives until its first shipment is submitted, while no proposal is pending). The next step card
  holds the step's actions: **Accept** with **Decline**, **Pack shipment** or **Continue packing**, **Print labels**,
  **Mark shipped**. On a phone, Propose changes moves into ⋯.
- **Meta row:** customer, ship to (destinations, via forwarder), required by, payment terms, ready date.
- **Lifecycle:** Ordered, Accepted, Packing, Approval, Ready for pickup, Shipped, Closed.
- **Accept and decline:** accepting holds the order's units, so the supplier's other channels sell fewer; the next
  step's meta says how many ("520 units, held when you accept"). If a tracked product is short, accepting is refused
  and lists the short lines with **Propose changes**. **Accept** acts at once, with a toast ("PO-1051 accepted. 520
  units held."), since it isn't destructive and the card already said what it holds. **Decline** opens a dialog that
  asks for a reason, which the buyer sees.
- **Next step card:** for the supplier: "Accept or decline PO-1051", "Pack 240 units in up to 3 shipments by Nov 15",
  "Waiting for Harbor Goods to approve your invoice", "Harbor Goods declined your changes: reason. Propose again or
  pack as ordered."
- **Tabs:** **Items** (product, variant, customer SKU, your SKU, where each line ships, with its units per destination
  when it's split, ordered, shipped, to ship, unit price and total with prices; an order to accept shows **Available**
  instead of shipped), then the **Packing requirements** card and the customer's note, **Shipments**, **Documents**,
  **Activity**.
- **Packing requirements:** the [shared card](design-spec.md#packing-requirements), grouped per destination into
  cartons, each unit and each carton, so the supplier knows before packing that, for example, AWD US takes one SKU per
  carton. An order going to several destinations leads with "pack them in separate cartons". It prints on the PO PDF and
  the packing checklist.
- **Rail:** Order value (prices), Details, Customer (contact), Ship to (route; shipping arranged by, so the supplier
  knows whether it books the carrier; customs handled by; the Optional Incoterm; and a link to the packing
  requirements naming how many destinations the order goes to).

### Propose changes `/orders/[id]/revise`

Editor template. The order's lines with editable SKU, quantity and price, added and removed lines marked, payment terms,
ready date and a note to the customer. Each changed value shows its original beside it. A change to the ready date
alone applies straight away, and the action bar says so. Action bar: **Discard**, **Send for approval**.

### Pack shipment `/orders/[id]/shipments/[shipmentId]/pack`

A task flow in the editor template (F4, F10), tablet-first. Replaces the packing form inside the shipment page.

- **Steps:**
  1. **Contents:** each line's packed quantity of what's left, supplier SKU and price per unit (without prices, only
     SKUs change). Changed prices or SKUs say they'll go to the customer for approval.
  2. **Cartons:** add, duplicate (with a count) and remove cartons; each with number, the destination it's packed for,
     contents (product and units, or one product for identical cartons), length, width, height in cm and weight in
     kg. Scan a barcode into contents. A **Packing rules** strip above the cartons checks each destination's rules as
     you type (mixed SKUs, one SKU per carton, units per carton, size, weight, every unit packed) and names the carton
     that breaks one; the carton's row explains how to fix it ("Market basket is packed for AWD US, which takes one SKU
     per carton. Move its 10 units to an AWD US carton").
  3. **Pickup:** a saved pickup address or a new one, the ready-for-pickup date. Asking for a phone only when Amazon or
     the buyer's carrier picks up is Optional; today it's asked for Amazon routes.
  4. **Invoice:** the commercial invoice Copacker makes from the order and this packing list, with customs details on
     overseas routes, or **Upload your own**.
  5. **Review:** everything in brief, and the check's results (Amazon eligibility, missing fields), each linking to
     its step.
- **Action bar:** "12 cartons, 420 units", problems count across every step, **Save draft**, **Check**, **Submit
  packing list**. Submit's confirm dialog says what happens next ("Copacker makes your commercial invoice from this
  list", "Amazon creates 2 shipments: FBA and AWD US"): submitting makes one shipment per destination. On a phone the
  steps become a progress card with previous and next, cartons become cards with a 4-field measurement row, and the bar
  docks to the bottom.
- Drafts save as today. Enter never submits.

### Shipment `/orders/[id]/shipments/[shipmentId]`

The shared shipment record, the supplier's view: lifecycle, next step, tabs Cartons, Invoice, Documents (labels and
packet when released), Activity. The next step card holds **Continue packing**, **Print labels**, **Mark shipped**. When the
supplier arranges shipping, Mark shipped asks for the carrier and tracking number. When it ships duty paid (`DDP`), it
uploads the bill of lading, which is optional and blocks nothing.

## Shipments `/shipments`

Index template. **Views:** Packing, Waiting on customer, Ready for pickup, Shipped, All. **Columns:** shipment (order
and number), customer, destination, cartons, ready date, status.

## Customers `/customers`

Index template.

- **Views:** All, With open orders, Without a catalog.
- **Columns:** customer, catalog (with status, or "No catalog, all products at list prices"), orders and open orders,
  last order, amount spent (prices). ⋯: Set catalog.

### Customer `/customers/[id]`

Record template. Header: name, "Customer since" in the meta row, **Set catalog**.

- **Tabs:** **Orders**, **Catalog** (the assigned catalog's products and prices for this customer, as the customer
  sees them, and **Open catalog**), **Activity**.
- **Rail:** amount spent, orders, since (prices where money), contact (name, email, phone, website).

## Products `/products`

Index template.

- **Header:** ⋯ with Export to CSV, Download template; **Import** (secondary); **Add product** (primary).
- **Views:** All, Active, Draft, Archived, Without a price.
- **Columns:** product with photo, status, inventory ("420 in stock for 3 variants", Not tracked), category, catalogs,
  price range (prices).
- **Bulk:** Set as active, Archive, Add to catalog.

### Import products `/products/import` (page, was a dialog)

Steps **Upload** (template links: Excel, CSV, your products in Excel), **Preview** (new, updated and unchanged
variants, each expandable), **Import**. The preview's hash guards the import, as today.

### Product `/products/[id]` and `/products/new`

Editor template, sections as steps on one page:

1. **Details:** title, description, category, product code, store page.
2. **Media:** photos, reordered by drag and by keyboard.
3. **Options and variants:** up to four options, the variant table (SKU, options, price, currency, basis, packaging).
4. **Pricing:** per variant, volume pricing breaks and quantity rules, with the checks in the pricing controls.
5. **Inventory:** track, on hand, continue selling.
6. **Catalogs:** which catalogs include the product and its catalog price.

Action bar: **Discard**, **Save**. Without prices the page is View only, as today.

## Inventory `/inventory`

Index template with inline editing.

- **Views:** Tracked, Short, Not tracked.
- **Columns:** product and variant, SKU, on hand (editable), committed (marketplace orders not yet shipped), held
  (accepted purchase orders), available (on hand less committed and held), sell when out. Committed and held each
  have an info tip. A change shows its difference in green or red.
- **Action bar:** "3 unsaved changes", **Discard**, **Save**. One transaction, recorded as counted movements; eBay and
  other channels update within a minute.

## Catalogs `/catalogs`

Index template. **Views:** Active, Draft, Archived. **Columns:** title, status, assigned to, price overrides, overall
adjustment, products. **Create catalog** (primary).

### Catalog `/catalogs/[id]` and `/catalogs/new`

Editor template. Header ⋯: Export to Excel, Export to PDF.

1. **Details:** title, status, overall adjustment, include new products.
2. **Customers:** assigned customers, add and remove.
3. **Products:** included variants with list price, catalog price (fixed or adjusted), volume pricing and quantity
   rules overrides.

## Analytics `/analytics`

The current supplier Overview's reports: orders received, order value, units ordered and shipped against the previous
period, the orders received chart, top products, top customers, inventory health. Period picker in the URL.
