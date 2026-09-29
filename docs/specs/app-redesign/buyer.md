# Buyer workspace

Part of the [app redesign spec](README.md). Every buyer page in the redesign, applying the
[foundations](design-spec.md). **New** marks a capability the app doesn't have yet; everything else rearranges what
exists.

## Navigation

| Group      | Item            | Route         | Area (permission) | Count shown                         |
| ---------- | --------------- | ------------- | ----------------- | ----------------------------------- |
|            | Home            | `/home`       | always            |                                     |
|            | Inbox           | `/inbox`      | always            | Open tasks                          |
| Store      | Sales           | `/sales`      | `sales`           |                                     |
| Store      | Products        | `/products`   | `products`        |                                     |
| Store      | Restock         | `/restock`    | `restock`         | Items to reorder now                |
| Purchasing | Purchase orders | `/orders`     | `orders`          | Proposals and drafts waiting on you |
| Purchasing | Shipments       | `/shipments`  | `shipments`       | Shipments needing action            |
| Purchasing | Partners        | `/partners`   | `partners`        |                                     |
| Insights   | Analytics       | `/analytics`  | `analytics` (was `overview`) |                          |
|            | Settings        | `/settings`   | always            |                                     |

The store's orders are renamed **Sales** in the sidebar, search and page title (F1), so "Orders" never means two things
in one workspace. Create menu: Purchase order, Import purchase order, Supplier, Forwarder.

## Home `/home`

The landing page (F5). Open to everyone in the workspace; money blocks need prices.

1. **Setup checklist** for admins until Shopify, Amazon, order copies, stock, unit costs and a supplier are in place (the
   existing checklist), collapsible, with progress ("4 of 6 done").
2. **To do:** the first eight tasks from the task source, critical first: Approve invoice changes, Review proposed
   changes, Upload shipping labels, Release labels, Retry a failed shipment, Reorder due, Send drafts, Reconnect a store.
   Each row: icon in its tone, what, the record, who's waiting and since when, the action. **View all** opens the Inbox.
3. **Purchasing pipeline:** one row of stages with a count and units each, each opening Purchase orders or Shipments
   filtered to it: Drafts, With supplier, Packing, Ready for pickup, In transit, Received in the last 30 days.
4. **Arriving:** the next shipments by expected date: shipment, supplier, destination, cartons, status.
5. **Restock:** items to reorder by cover band with the estimated cost (prices) and **Open restock**.
6. **Snapshot** (prices): sales, gross profit and units for the last 30 days against the 30 before, and **Open
   analytics**.

## Inbox `/inbox`

As [Inbox](design-spec.md#inbox). Buyer task kinds are listed in [Tasks](design-spec.md#tasks).

## Sales `/sales`

Index template over the synced sales orders.

- **Views:** All, Unfulfilled, Awaiting price (Amazon proceeds or fees pending), Cancelled.
- **Filters:** source (Shopify with location, Amazon marketplace, eBay), date range with the period picker's presets,
  status. Search by order number, SKU or product.
- **Columns:** order, date, source, items (first product and "and 2 more"), units, sales, fees (prices), status.
- **Row opens the sales order page (new)** `/sales/[id]`: lines with SKU, units and price, fees and proceeds by
  kind, fulfillment location, status and dates, a link out to the platform, and for an Amazon replacement the order it
  replaces. Until it ships, rows keep opening the platform.

## Products `/products`

Index of Shopify products with stock, as today, with the dialogs moved to a product page.

- **Header:** Sync menu (secondary), **Export**.
- **Views:** All, Needs label, Without country of origin, Without supplier, Out of stock at a channel.
- **Filters:** location or channel, supplier, product type. Search by title, variation or SKU.
- **Columns:** product with image, variations, available, on hand, incoming, on order, supplier, ⋯ (Reorder, Edit
  details). Expanding a product shows its variations, as today.
- **Bulk:** select variations, then Set supplier, Upload barcodes, Print labels, Reorder.

### Product `/products/[id]` (new page)

Record template for one Shopify product. Header: title, Shopify status, **Reorder** (primary), Open in Shopify.

- **Tabs:**
  - **Stock:** variations by location and channel: available, on hand, incoming, on order, days of cover, restock status.
  - **Purchasing:** supplier and supplier SKU per variation, case packs and dimensions, preparation, the default
    description for PO lines. Edits save through the action bar.
  - **Labels:** barcode per variation, label type, the label preview, upload and print.
  - **Purchase orders:** POs with this product, quantity, landed unit cost (prices), status.
  - **Activity.**
- **Rail:** image, SKU range, Shopify unit cost and the landed markup (prices), the Amazon listing link and minimum.

## Restock `/restock`

Keeps the report and moves its controls into the index layout.

- **Filter bar:** channel, supplier, cover band, "Show products with enough stock"; sales period and lead time as
  chips that open a small popover, with "Workspace defaults" to reset.
- **Summary strip** (prices for money): estimated cost, lines, units, cases, volume, weight, lost sales. Warnings
  (lines without unit cost or case pack, products without a supplier) as links that filter the list.
- **Supplier groups:** as today, each with lead time, lines and **Reorder**.
- **Bulk reorder (new):** select several supplier groups, then **Create purchase orders** makes one draft per supplier
  and lands on Purchase orders' Drafts view.

## Purchase orders `/orders`

Index template (F6: the stat cards go).

- **Header:** **Import** (secondary), **Create purchase order** (primary).
- **Views:** Needs you (drafts to send, proposals to answer, labels to upload), Drafts, With supplier, In transit,
  Closed, All.
- **Filters:** supplier, destination (Amazon or a location), forwarder, required-by date, created date. Search by
  reference, supplier or Amazon ID.
- **Columns:** purchase order (reference, products count), supplier, route (forwarder and destination), required by,
  units shipped of ordered as a small bar, total (prices), status.
- **First run:** the existing next steps (connect Shopify, invite a supplier, create the first PO).

### New purchase order `/orders/new` and Edit draft `/orders/[id]/edit`

Editor template with steps: **Supplier and route** (supplier, destination, forwarder stop), **Products** (catalog
search, the supplier's catalog match, quantities in pieces and packs, barcode warnings), **Terms** (required by,
payment terms, currency, adjustments), **Notes and instructions**, **Review** (lines, requirements, total). Action
bar: **Discard**, **Save draft**, **Send to supplier** (or **Send** when the supplier isn't on Copacker). Lines
prefilled from Restock or Reorder (`?variant=`) land on Products.

**Notes and instructions** says Amazon's [packing requirements](design-spec.md#packing-requirements) for the PO's
networks are added automatically, as chips ("FBA", "Mixed SKUs allowed", "Up to 22.68 kg a carton"), with **Preview what
the supplier sees**. The buyer's own packing instructions are for anything beyond them. Setting a line's network to
AWD US adds AWD's rules. The PO page's Items tab shows the same card, read-only, as the supplier sees it.

### Import `/orders/import` and Review import `/orders/import/[id]`

- Import is a page with a dropzone and a table of past imports (file, supplier, lines, status, PO once saved).
- Review is an editor with steps **Supplier**, **Match lines** (each line with its match, confidence and a picker),
  **Review**. Action bar: **Create draft**. A catalog outage keeps corrections available, as today.

### Purchase order `/orders/[id]`

Record template, the buyer's view.

- **Header:** reference, status, **View only** if applicable. Primary by step: **Send to supplier** (draft), **Review
  changes** (proposal pending), **Upload labels** (a shipment needs them), else none. Secondary: **Edit** (draft),
  **Download PDF**. ⋯: Duplicate, Close, Delete (draft), Labels download.
- **Meta row:** supplier, forwarder, destination, required by, payment terms.
- **Lifecycle:** Draft, Sent, Packing, Shipped, Received, Closed. With partial shipments, Packing and Shipped show
  "2 of 3 shipments".
- **Next step card:** from the workflow for the buyer. Off Copacker: "Lotus Manufacturing isn't on Copacker. Send
  them the PDF, and pack for them when the goods are ready."
- **Tabs:**
  - **Items:** lines with product, variation, buyer SKU, supplier SKU (warning when not set), ordered, shipped and to
    ship, unit cost and total (prices), requirements as a secondary line, ⋯ per line (labels, warning labels, edit on a
    draft). Instructions under the table.
  - **Shipments:** one row per shipment: number, Amazon network and ID, cartons, ready date, status, the next step's
    owner; **Ship on** for a shipment that reached a forwarder not on Copacker (prices, as today).
  - **Documents:** the PO's and each shipment's, grouped.
  - **Activity:** comments and events.
- **Rail:** Cost summary (prices), Details (required by, terms, ready date, currency, note to supplier), Landed costs
  (prices), Route (supplier's pickup, forwarder, destination with Amazon's requirements).
- **Proposal review:** with a pending proposal, the Items tab shows each change inline (old value struck through, new
  value, added and removed lines marked), the supplier's note above, and a bar with **Decline** and **Approve
  changes**. Approving says what else happens: the new revision, the supplier SKU written to Shopify, and the choice to
  update Shopify unit costs.

### Shipment `/orders/[id]/shipments/[shipmentId]`

The shipment becomes a child of its PO (F4). `/shipments/[id]` redirects here.

- **Header:** "Shipment 2", status; breadcrumb Purchase orders, PO-1045. Primary by step: **Approve invoice**,
  **Upload shipping labels**, **Release labels**, **Mark received**, **Retry**, **Reconcile**. ⋯: Request correction,
  Cancel in Amazon, Open in Seller Central.
- **Meta row:** supplier, from (pickup address), via forwarder, to destination, Amazon shipment ID, ready date.
- **Lifecycle:** Packing, Approval, Amazon shipment, Labels, Ready for pickup, Shipped, Shipped on (with a forwarder),
  Received. Correction and Needs attention show on the current stage.
- **Next step card:** the step's message (`step.next`), its issues listed, and its action.
- **Tabs:** **Cartons** (carton number, contents, units, dimensions, weight, Amazon label), **Invoice** (the commercial
  invoice file and its lines, with changes against the PO highlighted), **Documents** (packet first when it's ready),
  **Activity**.
- **Rail:** Pickup (address, contact, ready date), Carrier (booking, tracking), Amazon (network, IDs, placement).
- **Packing for a supplier not on Copacker:** the buyer opens the same [packing flow](supplier.md#pack-shipment) as
  the supplier, with the supplier's name in the copy.

## Shipments `/shipments`

Index template of every shipment across POs, and the Amazon account's own inbound shipments.

- **Views:** Needs you, Packing, Ready for pickup, In transit, Received, Cancelled, All.
- **Filters:** supplier, destination, forwarder, source (Copacker or Amazon account), ready date.
- **Columns:** shipment (PO reference and number, Amazon ID), supplier, route, cartons, ready date, status, whose move
  it is (You, Supplier, Forwarder, Amazon).
- Amazon's own shipments open in Seller Central, marked with an external-link icon, as today.

## Partners `/partners`

Index template.

- **Header:** **Add partner** (primary, choosing supplier or forwarder).
- **Views:** All, Suppliers, Forwarders, Invited, Not on Copacker.
- **Columns:** name, type, standing (On Copacker, Invited, Invitation expired, Not invited), lead time (suppliers),
  open POs, contact. ⋯: Edit, Addresses, Invite or Resend invitation, Remove.
- The row opens the partner page; ⋯ Edit keeps the sheet for quick changes.

### Partner `/partners/[id]` (new page)

Record template. Header: name, standing, **Create purchase order** (supplier) and **Invite** when not on Copacker.

- **Tabs:** **Overview** (contact, Shopify supplier name, lead time, invitation), **Purchase orders**, **Products**
  (variations with this supplier, its SKU and last price), **Addresses** (pickup addresses for a supplier not on
  Copacker, warehouses for a forwarder), **Activity**.
- **Rail:** open POs and units, last order, average lead time as measured on the [Lead times](#lead-times) tab
  (production for a supplier, last delivery to received for a forwarder) beside the lead time set on the partner,
  on-time pickups (a shipment ready by its PO's ready date), spend this year (prices).

## Analytics `/analytics`

The current Overview's reports, moved (F5). Needs `analytics` access, which needs prices.

- **Filter bar:** period picker and channel filter, shared across tabs and kept in the URL (`?period=`, `?from=&to=`,
  `?channel=`).
- **Tabs:**
  - **Sales:** KPIs (sales, orders, average order value, units), sales trend, sales by channel, best sellers, trending,
    Shopify customers.
  - **Profit:** gross profit and margin, the line-by-line breakdown, fees, charges, monthly costs, stockout losses.
  - **Inventory:** units and value by channel, retail value, days of cover with links into Restock, slow-moving stock.
  - **Purchasing:** open POs by supplier, upcoming spend, purchasing by month, landed markup by supplier.
  - **Lead times (new):** how long each partner and each route takes, below.
- Every figure keeps its existing definition in [Overview page](../../overview.md).

### Lead times

How long purchase orders take, measured per handoff, so the buyer can see which partner is slow and, later, predict
when a new PO arrives from its exact route. The period picker chooses the shipments received in it (the last 12 months
by default), and the comparison is the period before. The channel filter becomes a **route** filter (supplier,
forwarder, destination).

**Handoffs.** Each received shipment is split into the handoffs of its route:

| Handoff                  | Whose            | From                                                        | To                                                       |
| ------------------------ | ---------------- | ----------------------------------------------------------- | -------------------------------------------------------- |
| Production               | Supplier         | The PO was sent to the supplier                             | The ready-for-pickup date on the submitted packing list  |
| Pickup to forwarder      | Carrier          | Ready for pickup                                            | The forwarder marked the shipment received               |
| Forwarder to destination | Forwarder        | The **last** of the PO's shipments reached the forwarder    | The destination received the last of them                |
| Direct transit           | Carrier          | Ready for pickup (routes without a forwarder)               | The destination received it                              |
| Door to door             | Everyone         | The PO was sent                                             | The destination received it                              |

- The forwarder's time is measured **per purchase order**, from its last shipment's arrival, because a forwarder ships
  on once every carton is in. Waiting for a late supplier shipment counts against the supplier, not the forwarder. It
  splits into **handling** (until the forwarder marks it shipped on) and **final transit** (until received).
- Arrival at a forwarder comes from the forwarder's **Mark received** step ([forwarder workspace](forwarder.md)).
  For a forwarder not on Copacker, the buyer's **Ship on** dialog asks for the date the goods arrived. A PO or
  shipment missing a timestamp is left out, and the page says how many.
- A figure shows only with at least 3 measurements; fewer show "—" with the count.

**Page.**

1. **KPI strip:** average door to door, supplier production, pickup to forwarder and forwarder to destination, each
   against the previous period (faster in the success tone, slower in destructive).
2. **Average lead time by route:** one row per route with a stacked bar of its handoffs in days, a marker at the day by
   which 90% of its shipments were received, the total and the number of shipments. A segmented control switches
   Average, Median and Slowest 10%. The slowest route is tagged.
3. **Suppliers:** production time, the lead time set on the partner (which Restock and new POs use today), how far
   apart they are, and the share of shipments ready by the PO's ready date. When the measured time is 3 or more days
   over the set one, a suggestion offers to use the measured time, which updates the partner's lead time (Partners: Edit).
4. **Forwarders:** last delivery to received as a split bar of handling and final transit, the average and the 90%
   figure, and the number of POs measured.
5. **Estimate for a new purchase order (planned):** choose a supplier, forwarder and destination to see the expected
   days, the arrival date if sent today and the 90% date, with a timeline of each handoff. It uses the route's own
   history with 3 or more shipments, otherwise the sum of each partner's averages. The same estimate will suggest a
   PO's required-by date in the builder and replace the fixed lead time in Restock.
