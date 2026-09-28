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
- Suppliers may propose changes to their SKU and price, never to the buyer's SKU or product. Changes need the buyer's
  approval, publish a new PO revision and keep the earlier ones. An approved supplier SKU is written to the Shopify
  variant's `custom.supplier_sku`; writing the unit cost back to Shopify is the buyer's choice, with currency and pack
  checks.
- Partial shipments reserve quantities independently. A commercial invoice PDF is required.

## Shipments

The supplier submits carton identifiers, contents, cm/kg measurements, the ship-from contact and address, and the local
ready-for-pickup date. Copacker validates them and checks Amazon eligibility before creating anything in Amazon, then maps
Amazon's carton labels to the supplier's carton numbers ([Amazon inbound shipments](amazon-inbound.md)). The buyer books
the carrier in Amazon and uploads its shipping labels; a ready date isn't a booked pickup. Released documents are the
packing list, product labels, carton and shipping labels, and the packing checklist. A correction invalidates the
documents it affects and goes through Amazon's update or replacement paths; labels are never silently reused.

## Architecture

- Next.js App Router with shadcn/ui; every read and write is authorized on the server.
- Postgres on Railway with Drizzle migrations, transactional quantity reservations and immutable PO revisions.
- One private Railway bucket for every uploaded and generated document, downloaded only through authorized routes.
- Store credentials are encrypted per workspace; OAuth state is single-use and expires; supplier invitations match the
  exact email.
- Durable Postgres jobs run Amazon, email and Shopify work. A create that times out is an unknown outcome to reconcile,
  never retried blindly.
