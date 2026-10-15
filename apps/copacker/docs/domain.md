# Copacker's product rules

The rules the rest of the app is built on. Pages and flows are described in their own docs.

## Workspaces and access

Copacker is a portal shared by buyer, supplier and freight forwarder workspaces. WorkOS signs people in; Copacker's own
memberships and buyer/supplier links decide what each record shows to whom ([Roles and page access](permissions.md)).
A supplier can work for several buyers.

## Purchase orders

- A PO has one destination: Amazon, or one of the buyer's own locations. A freight forwarder is only a stop on the way
  (`via`), never a destination.
- Quantities and prices are per piece. A pack size converts pieces into Amazon's sellable units.
- The draft editor and saved PO group Amazon products into separate AWD US and FBA shipment cards. The group names
  carry the destination and shipment total, so product rows do not repeat the destination. Totals include the product's
  supplier service costs and update with quantities, costs and product moves; PO-level charges remain in the overall
  total. Members without price access do not see shipment totals. At narrower widths the cost and details panels move below
  the products to leave room for the table. In the editor, select individual products or
  a whole group, then use **Move to** to change their destination together. Quantities, prices and packing instructions
  stay with each product. Groups can be collapsed; packing details hold preparation, labels, instructions and supplier costs.
  Sending the PO creates a packing draft for each network. These groups do not yet split one product's quantity
  across networks or create multiple planned shipments to the same network.
- Packing details has **Add expense** with standard cost types such as Packing, Labeling and Freight fee. The cost summary
  combines expenses of the same type into one row. Each cost has a rate per pack, per piece, or
  a flat amount. These costs belong to the product and are included once in its line total, shipment total, PO total
  and PDF. Product-specific costs stay with that product when calculating landed cost; shared charges are allocated
  across the PO. Do not also enter the same charge in the PO-level adjustments.
- Suppliers never change the buyer's SKU. Their commercial invoice can change a line's supplier SKU and price, and on a
  sent PO they can propose adding or removing products and changing quantities, prices and payment terms
  ([Order changes](supplier-workspace.md#order-changes)). These need the buyer's approval, publish a new PO revision and
  keep the earlier ones. An approved supplier SKU is saved in Copacker's
  [variation details](api-contract.md#variation-and-product-details), not in Shopify; writing the unit cost back to
  Shopify is the buyer's choice, with currency and pack checks.
- Partial shipments reserve quantities independently. A commercial invoice PDF is required.

## Shipments

The supplier submits cartons, measurements and a ready date, Copacker creates the Amazon shipment and matches its labels
to the cartons, and a correction outdates the shipment’s documents and replaces an Amazon shipment rather than updating
it ([Amazon inbound shipments](amazon-inbound.md)).

## Architecture

- Next.js App Router with shadcn/ui; every read and write is authorized on the server.
- Postgres on Neon with Drizzle migrations, transactional quantity reservations and immutable PO revisions.
- One private Railway bucket for every uploaded and generated document, downloaded only through authorized routes.
- Store credentials are encrypted per workspace; OAuth state is single-use and expires; supplier invitations match the
  exact email.
- Durable Postgres jobs run Amazon, eBay, email and Shopify work
  ([Failures and cancellation](amazon-inbound.md#failures-and-cancellation) covers Amazon creates).
