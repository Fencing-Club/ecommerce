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

- TanStack Start and Router with shadcn/ui; every read and write is authorized on the server.
- Postgres on Railway with Drizzle migrations, transactional quantity reservations and immutable PO revisions.
- One private bucket per environment for uploaded and generated documents, downloaded only through authorized routes.
  The Cloudflare release uses R2; moving the existing Railway files requires the verified storage cutover.
- Store credentials are encrypted per workspace; OAuth state is single-use and expires; supplier invitations match the
  exact email.
- Durable Postgres jobs run Amazon, eBay, email and Shopify work
  ([Failures and cancellation](amazon-inbound.md#failures-and-cancellation) covers Amazon creates).
