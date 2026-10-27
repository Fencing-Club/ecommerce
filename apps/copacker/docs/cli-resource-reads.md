# CLI resource reads

The operations API adds sixteen read handlers over existing application services. This is a first read projection,
not completion of the full domain contracts in the CLI proposal. Discovery advertises the exact executable input
and result schemas. Unsupported filters fail validation rather than being ignored.

| Commands | Existing implementation reused |
| --- | --- |
| `product list`, `product search`, `product show` | Current-account stock snapshots, buyer product defaults, supplier product list |
| `inventory list`, `inventory show`, `location list` | Provider stock snapshots and scope definitions; supplier stock commitments |
| `order list`, `order show` | Ingested sales orders, current-account joins, excluded Shopify tags, shared sales summaries |
| `po list`, `po show` | Buyer/supplier/forwarder visibility rules and the shared PO line schema |
| `shipment list`, `shipment show` | PO visibility, Amazon shipment links, the web app's provider reader and completed-result cache |
| `partners list`, `partners show` | Buyer partners and supplier customer relationships |
| `catalog list`, `catalog show` | Supplier catalog list/editor and shared pricing schemas |

Connections already have list/show/settings reads. All handlers use the bearer principal's explicit workspace,
never the browser workspace cookie. Page permissions remain authoritative: customer orders require Sales; buyer
products and inventory require Products; supplier stock requires Inventory; supplier customers require Customers;
catalogs additionally require Prices. Forwarders see only purchasing records routed through their active relationship,
and only the shipments whose route stops at them. A shipment's `route.forwarderId` is its route's forwarder.
Supplier drafts and removed relationships remain hidden. Invitation hashes, provider credentials and storage keys
are never public fields. Price redaction occurs before output validation and pagination.

The provider-write release adds variant write policies to `product show` and linked FBM availability to inventory
reads. Offer availability is explicitly `channel_availability`, in seller-offer units, and is excluded from physical
restock totals. Writable capabilities are eligibility hints; preview checks live provider values and ownership.

## Identities and quantities

Supplier products and variants use their database UUIDs. Buyer products use an explicitly provider-scoped identifier:
connection, account and provider ID, encoded into one opaque string. `identityBasis: provider` and `source` make this
visible. Pass the returned ID unchanged to show commands. These are read selectors, not durable cross-channel links
or write guards. Buyer lifecycle status is `unknown` because the current stock snapshot does not ingest that field.
Supplier revisions are real product revisions; missing inventory and relationship revisions are null.

Inventory is one row per source variant, location and quantity state. Its unit remains the provider inventory unit
or a supplier piece. FBA and AWD are separate reported locations; no implicit SKU matching or pooling is performed.
FBA listing identities retain FNSKU and condition. Native quantities are not additive: available, on-hand, inbound
and committed counts describe different states. Null stays unknown, including untracked supplier inventory.
Location and inventory writes are unavailable. Extensible per-variant targets are separate work.

## Coverage and boundaries

Customer order reads currently return safe order summaries, source references, observed timestamps, items and net
product sales. They explicitly report partial coverage: full payment/fulfillment/refund evidence and line pricing
are not yet exposed. Date ranges are inclusive UTC calendar dates; both endpoints are required. Lists support
created-date ordering and at most 10,000 selected stored orders; narrow the date range or connection for larger data.
Reference lookups reject ambiguity. They never return purchase orders.

PO reads expose operational lines with permitted unit prices and adjustments, route references and linked shipment
IDs. They do not yet expose complete commercial snapshots, document artifacts, history or workflow actions.
Shipment list combines Copacker records with unmatched live/cached Amazon inbound records for buyers; suppliers and
forwarders see their accessible Copacker records only. `origin: copacker` avoids provider reads. External records have
null Copacker IDs and no update actions. Deduplication uses account/network/provider ID, not names. Provider failure
returns partial coverage, and the cache's unknown observation time remains null.

Lists bind their signed cursor to caller, workspace, operation, filters and the entire selected result. Changing a
record or permission between pages invalidates the cursor instead of silently skipping records. These are live
reads that must restart on change, not retained database snapshots. Catalog projections include existing assignments
but do not yet claim assignment dependency guards. Only implemented read actions appear in `allowedActions`.

## Validation

Database tests cover product/stock reads, current-account replacement, role redaction, changed-page rejection,
supplier catalogs/stock, customer order references, PO/shipment visibility and provider-failure reporting. Contract
tests exercise strict discovery schemas, read-only effects and date-window validation. Live provider qualification
and the authentication acceptance described in [CLI server](cli-server.md) remain separate from mocked tests.
