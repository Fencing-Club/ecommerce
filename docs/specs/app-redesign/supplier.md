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

1. **To do:** Pack orders, Fix packing problems, Print labels and mark shipped, Answer declined changes, Short stock,
   Products without a price, Customers without a catalog. Each with its record, customer and required-by date.
2. **Order pipeline:** To pack, Waiting on customers, Ready to ship, In transit, each with orders and units, opening the
   Orders view.
3. **Pickups this week:** shipments by ready-for-pickup date: order, customer, cartons, pickup address, status.
4. **Stock against open orders:** short and out-of-stock variants with what open orders need, opening Inventory's
   Short view.
5. **Snapshot** (prices): orders received and order value for 30 days, and **Open analytics**.

## Orders `/orders`

Index template.

- **Views:** To pack, Waiting on customers, To ship, Shipped, Closed, All. To pack is the default when it has orders.
- **Filters:** customer, required by, ready date, destination (Amazon or the customer's warehouse). Search by
  reference, customer or SKU.
- **Columns:** order (reference, products), customer, received (date sent), required by, ready date, units shipped of
  ordered, total (prices), status.

### Order `/orders/[id]`

The shared PO record, the supplier's view.

- **Header:** "PO-1045", status, "From Harbor Goods" in the meta row. Primary by step: **Pack shipment** or **Continue
  packing**, **Print labels**, **Mark shipped**. Secondary: **Propose changes** (while shipments are packing and no
  proposal is pending), **Download PDF**.
- **Meta row:** customer, ship to (destination, via forwarder), required by, payment terms, ready date.
- **Lifecycle:** Received, Packing, Approval, Ready for pickup, Shipped, Closed.
- **Next step card:** for the supplier: "Pack 240 units in up to 3 shipments by Nov 15", "Waiting for Harbor Goods to
  approve your invoice", "Harbor Goods declined your changes: reason. Propose again or pack as ordered."
- **Tabs:** **Items** (product, variation, customer SKU, your SKU, the Amazon network each line is packed for, ordered,
  shipped, to ship, unit price and total with prices), then the **Packing requirements** card and the customer's note,
  **Shipments**, **Documents**, **Activity**.
- **Packing requirements:** the [shared card](design-spec.md#packing-requirements), grouped per network into cartons,
  each unit and each carton, so the supplier knows before packing that, for example, AWD US takes one SKU per carton
  and two labels on each carton. A PO going to two networks leads with "pack them in separate cartons". It prints on
  the PO PDF and the packing checklist.
- **Rail:** Order value (prices), Details, Customer (contact), Ship to (route, and a link to the packing requirements
  naming how many networks the order goes to).

### Propose changes `/orders/[id]/revise`

Editor template. The order's lines with editable SKU, quantity and price, added and removed lines marked, payment terms,
ready date and a note to the customer. Each changed value shows its original beside it. A change to the ready date
alone applies straight away, and the action bar says so. Action bar: **Discard**, **Send for approval**.

### Pack shipment `/orders/[id]/shipments/[shipmentId]/pack`

A task flow in the editor template (F4, F10), tablet-first. Replaces the packing form inside the shipment page.

- **Steps:**
  1. **Commercial invoice:** upload the PDF (one, replaceable).
  2. **Contents:** each line's packed quantity of what's left, supplier SKU and price per unit (without prices, only
     SKUs change). Changed prices or SKUs say they'll go to the customer for approval.
  3. **Cartons:** add, duplicate (with a count) and remove cartons; each with number, the network it's packed for,
     contents (product and units, or one product for identical cartons), length, width, height in cm and weight in
     kg. Scan a barcode into contents. A **Packing rules** strip above the cartons checks each network's rules as you
     type (mixed SKUs, one SKU per carton, units per carton, size, weight, every unit packed) and names the carton that
     breaks one; the carton's row explains how to fix it ("Market basket is packed for AWD US, which takes one SKU per
     carton. Move its 10 units to an AWD US carton").
  4. **Pickup:** a saved pickup address or a new one (with phone for Amazon), the ready-for-pickup date.
  5. **Review:** everything in brief, and the check's results (Amazon eligibility, missing fields), each linking to
     its step.
- **Action bar:** "12 cartons, 420 units", problems count across every step, **Save draft**, **Check**, **Submit
  packing list**. Submit explains what happens next ("Harbor Goods approves the invoice, then Amazon creates the
  shipment"). On a phone the steps become a progress card with previous and next, cartons become cards with a 4-field
  measurement row, and the bar docks to the bottom.
- Drafts save as today. Enter never submits.

### Shipment `/orders/[id]/shipments/[shipmentId]`

The shared shipment record, the supplier's view: lifecycle, next step, tabs Cartons, Invoice, Documents (labels and
packet when released), Activity. Primary by step: **Continue packing**, **Print labels**, **Mark shipped**.

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
- **Columns:** product and variant, SKU, on hand (editable), committed to open orders, available, sell when out. A
  change shows its difference in green or red.
- **Action bar:** "3 unsaved changes", **Discard**, **Save**. One transaction, as today.

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
