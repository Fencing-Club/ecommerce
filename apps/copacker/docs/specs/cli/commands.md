# Copacker command inventory

All commands are proposed for the initial operational release. Deferred endpoints are omitted. A reuse target is an
existing service, not an already available public endpoint; new work is identified explicitly.
Commands below omit the `copacker` prefix. Comma-separated names are separate commands.
The [operation schemas](operations/README.md) specify exact input/result records, access, effects and errors for this
inventory. [Bulk inputs](bulk.md) reuse the relevant entity command; they do not introduce a batch command group.

## Account and workspace

| Commands | Purpose | Scope |
| --- | --- | --- |
| `login`, `logout` | Browser sign-in; revoke/clear the local session | Initial |
| `account show` | Signed-in account, authentication state and effective current workspace; no token values | Initial |
| `account credential list`, `account credential show <id>` | Workspace-bound automation credential metadata, scopes, expiry and last use; never secret values | Initial; interactive admin |
| `account credential create`, `account credential rotate <id>`, `account credential revoke <id>` | Explicit scopes/lifetime or guarded rotation/revocation; protected credential-store/file delivery | Initial; new credential lifecycle, interactive admin |
| `workspace list`, `workspace show`, `workspace use <id>` | Accessible workspaces, selected workspace details and local context selection | Initial |
| `status` | Workspace connection and ingestion health, incomplete datasets and operations requiring attention | Initial |
| `schema list`, `schema show <operation>` | Deployed operation schemas, permissions, supported fields and effects | Initial |

`--workspace` overrides the local default. Noninteractive workspace operations require `--workspace` or `COPACKER_WORKSPACE`.
`--help` and `--version` do not require login. `workspace use` changes only local CLI context. `status` reports
operational health; it does not reproduce the dashboard's sales/profit/stock cards.
Credential issuance is [fully specified here](credentials.md), including setup from an empty CI runner. `logout`
clears the selected interactive grant; automation credentials have explicit revocation.

## Customer orders

`order` is a customer sales order from Shopify, Amazon or eBay. The same meaning applies in every workspace.

| Commands | Main inputs and result | Scope and foundation |
| --- | --- | --- |
| `order list` | Provider/account, marketplace, date range, SKU, source payment/fulfillment status and search; paged orders | Initial; stored sales orders |
| `order show <id-or-reference>` | Items, quantities, amounts if permitted, discounts/refund information actually ingested, fulfillment attribution, source identity and sync time | Initial; new detail operation over stored rows |
| `order export` | The same filters, declared columns, CSV or JSON and output file | Initial; shared order reader |

A display number such as `1043` requires source/account disambiguation when not unique. Fulfillments and refunds are
read data where ingested; order cancellation, refund and fulfillment writes belong to future marketplace-order work.
The importer currently excludes some cancelled/test orders; do not promise a complete cancellation history. Source
status filters operate only on stored records and expose retention/exclusion limits.

## Purchase orders

| Commands | Main inputs and result | Scope and foundation |
| --- | --- | --- |
| `po list`, `po show <id-or-reference>` | Status, supplier, destination, due date and search; summaries or full permitted detail | Initial; PO page readers |
| `po coverage`, `po history <id>` | Open quantities and allocations; immutable revisions, events and comments | Initial; order summary/workflow readers |
| `po check` | Proposed input or existing PO; validate identity, quantities, commercial terms and effects | Initial; validation wrapper |
| `po create`, `po update <id>` | Structured draft input; update requires expected revision and complete editable order snapshot | Initial; existing `order.create/update` handlers |
| `po submit <id>`, `po close <id>`, `po delete <id>` | Revision and lifecycle checks; submit sends, close completes eligible POs, delete removes drafts only | Initial; existing order actions |
| `po comment <id>` | Message; append to the PO timeline | Initial |
| `po export` | `--id <id> --file-format pdf` for the PO document, or filtered collection CSV/JSON | Initial |
| `po label list <id>`, `po label download <id>` | Product/warning labels, optionally one PO line; current metadata or PDF | Initial; PO label routes |
| `po proposal create <id>`, `po proposal list <id>`, `po proposal show <proposal-id>` | Supplier's proposed commercial changes and their review state | Initial; proposal service |
| `po proposal approve <id>`, `po proposal decline <id>`, `po proposal withdraw <id>` | Expected PO/proposal revisions and reason where required | Initial |
| `po import <path>` | PDF to reviewed extraction; return import ID and processing/review state, never send a PO | Initial; existing PO import service |
| `po import list`, `po import show <id>`, `po import source <id>` | Processing, unresolved rows, saved PO link and source PDF download | Initial |
| `po import match <id>`, `po import update <id>` | Pinned-store candidate search and revisioned corrections | Initial |
| `po import apply <id>`, `po import cancel <id>` | Explicit review acknowledgement; save one draft, or cancel an unsaved import | Initial |

There is no customer-order mutation hidden behind `po`, or PO mutation hidden behind `order`. Submitted POs use proposals
and invoice approval; `po update` edits drafts only. Existing internal `orderId` and `/api/orders` names are implementation
details mapped to public `poId`, `poRevision` and `--po` fields. PO costs appear under `expense --po`.

## Shipments

A Copacker shipment follows the goods from the supplier, optionally via a forwarder, to Amazon or a buyer warehouse.
Amazon inbound records are provider representations of some of those movements. See [resource ownership](resources.md).

| Commands | Main inputs and result | Scope and foundation |
| --- | --- | --- |
| `shipment list` | Origin `copacker/external/all`, PO, supplier, forwarder, destination, state and network; default all | Initial; Copacker shipments plus Amazon FBA/AWD discovery |
| `shipment show <id>`, `shipment lookup` | Canonical detail or provider/external ID lookup; route, known legs, cartons, provider references, documents and next action | Initial |
| `shipment create --po <id>` | Expected PO revision; resume packing or create the next allowed partial shipment | Initial |
| `shipment packing show <id>`, `shipment packing save <id>` | Full draft, shipment/PO revisions; incomplete packing is allowed | Initial |
| `shipment check <id>`, `shipment submit <id>` | Validate, or submit packing and reserve quantities; return all network splits and current operation state | Initial |
| `shipment approve <id>`, `shipment correct <id>` | Accept invoice changes or request correction; Shopify cost write-back is a separate explicit option | Initial |
| `shipment release <id>`, `shipment ship <id>`, `shipment forward <id>`, `shipment receive <id>` | Booking, supplier dispatch, forwarder carrier/reference/freight, or destination receipt; revisions required | Initial |
| `shipment reconcile <id>`, `shipment cancel <id>` | Resolve an uncertain provider create, or cancel an eligible shipment with provider confirmation | Initial |
| `shipment invoice upload <id> <path>`, `shipment invoice download <id>` | Current commercial invoice, with target revisions and price access | Initial |
| `shipment label list <id>`, `shipment label upload <id> <path>`, `shipment label download <id>` | Carton/shipping label metadata and bytes; upload includes one-based page-to-carton assignments | Initial |
| `shipment packet download <id>` | Current authorized supplier packet, preserving page sizes | Initial |

`ship` and `forward` advance physical legs; neither means changing an arbitrary Amazon status. External-only rows remain
read-only. One Copacker shipment can have several Amazon shipment IDs. Linked records are shown together, not counted as
unrelated shipments. Customer parcel tracking belongs to `order` fulfillment data, not the inbound PO shipment workflow.
No generic status patch, file upload or retry command is exposed.

## Products and inventory

| Commands | Main inputs and result | Scope and foundation |
| --- | --- | --- |
| `product list`, `product show <id>`, `product search <query>` | Products, variants, source SKUs/barcodes, bundles, supplier, prices/costs, listing links and field authority | Initial; buyer catalog projection and supplier-owned products |
| `product create` | Supplier-owned product, options, variants, prices, packaging and tracking settings | Initial; supplier product service |
| `product update <id>`, `product variant update <id>` | Typed fields and expected revisions; operational metadata writes locally, an editable SKU writes to its authority; supplier products include descriptions, prices and variants | Initial; existing services plus controlled Shopify SKU writes and expanded target metadata |
| `product price update <variant-id>` | Price/currency and expected source/link revisions; update the price source and every linked price target; return per-target results | Initial; new controlled Shopify/Amazon selling-price writes |
| `product cost update <variant-id>` | Unit cost/currency and expected source state; update the configured cost source | Initial; reuse Shopify cost adapter and add typed Copacker cost storage where needed |
| `product listing list`, `product listing show <listing-id>` | Account-scoped discovery with connection/marketplace, `--unlinked`, seller-SKU and optional `--variant` filters; canonical listing ID, current price/quantity, capabilities and nullable linked item | Initial; new normalized listing projection including unmatched offers |
| `product listing link <listing-id>`, `product listing unlink <listing-id>` | Item identity, pack conversion and expected link revision | Initial; new durable listing links; edits never rename an Amazon seller SKU |
| `product supplier assign` | Product IDs, supplier partner and expected revisions | Initial |
| `product import <path>`, `product import show <id>`, `product import apply <id>` | Preview CSV/XLSX, inspect row issues and commit reviewed allowed fields | Initial; existing supplier import; buyer Copacker-settings import is new |
| `product import --source shopify --connection <id>` | Preview one-time metadata seeding from Shopify fields/metafields; apply through the same product import review | Initial; extend existing one-time field migration |
| `product export`, `product template` | Filtered CSV/XLSX/JSON and import template for the selected workspace/product kind | Initial; existing supplier export, new shared buyer projection |
| `product label show <id>`, `product label update <id>`, `product label upload <id> <path>`, `product label download <id>`, `product label remove <id>` | Label settings and uploaded one-page barcode PDF; source/type and revision | Initial; product-label/barcode services |
| `product image upload <id> <path>`, `product image remove <id>` | Supplier-owned catalog images and revision | Initial; current supplier image support |
| `inventory list`, `inventory show <product-id>`, `inventory export` | Source/account/location, native balances and units, snapshot ID and observation time | Initial |
| `inventory history <product-id>` | Available stock-day history with origin and covered period; capability depends on stock source | Initial; existing `stock_days`, not a complete supplier movement ledger |
| `inventory update <variant-id> --location <id>` or `inventory update --input <path>` | Absolute count/availability at a required location per row; location determines provider, quantity state and write target; expected current quantity | Initial; supplier counts plus controlled Shopify and Amazon FBM writes |
| `inventory adjust <variant-id> --location <id>` | Signed delta, reason and concurrency guards; available only where the location supports safe adjustment | Initial; Copacker/Shopify correction operation; no fabricated Amazon atomic delta |
| `location list`, `location show <id>`, `location update <id>` | Physical locations and typed channel-availability targets, classifications, quantity state and write capability; revision on classification changes | Initial; existing services plus supplier and FBM target projection |

Listing discovery includes ingested offers that have no product match; it does not require a Copacker variant ID.
`--unlinked` and `--variant` are mutually exclusive. Provider/account/marketplace and seller SKU remain visible so callers
can select the correct canonical listing ID before linking it. Incomplete ingestion returns coverage, not a false empty
catalog. Refresh through `connection sync` when needed.

`product update` has no arbitrary property bag. [Resource ownership](resources.md) distinguishes a source-owned SKU
from Copacker-owned supplier SKU and FBA/AWD/location stock targets. Operational metadata is seeded once, then edited
in Copacker; no general Shopify metafield editor is included. Inventory collection is requested through
`connection sync --dataset inventory`. [Write routing](write-routing.md) defines product-wide price updates and
location-specific inventory updates. SKU edits write to Shopify only for connected buyer products; the initial release
has no Amazon SKU handler. Amazon supports offer-price and FBM-availability writes; FBA/AWD counts remain read-only.
Tracking and continue-selling policies are editable through `product variant update`. Supplier products retain
create/update/archive behavior through their typed status field; historical PO snapshots are preserved.
Descriptive product saves cannot overwrite stock. Supplier count-bearing creates/imports use the same explicit location,
inventory permission and stock revision guards as `inventory update`; see [supplier stock](resources.md#supplier-catalogs-and-inventory).

Buyer product metadata, variant SKU/metadata, price, cost, supplier assignment and absolute inventory writes also accept
typed `rows` through `--input`; `--batch-id` reads that command's run. Initial limits are 100 rows, 500 resolved targets
and 1 MiB JSON. Product/variant kinds and atomicity rules are explicit in [bulk writes](bulk.md). Product and inventory
reads/previews show [write destinations](destinations.md), including missing mappings and ownership conflicts.

## Supplier catalogs

| Commands | Main inputs and result | Scope and foundation |
| --- | --- | --- |
| `catalog list`, `catalog show <id>` | Supplier-owned price lists, status, settings, variants, overrides and assigned customer relationships | Initial; existing catalog readers |
| `catalog create`, `catalog update <id>` | Full reviewed catalog input: product membership, fixed/volume prices, quantity rules, adjustment, include-new-products policy and assignments | Initial; existing revisioned save service |
| `catalog remove <id>` | Expected revision and assignment effects; customers revert to their normal eligible product pricing | Initial; existing removal service with added guard |
| `catalog export <id>` | Excel or PDF price list with permitted prices, currency and price basis | Initial; existing catalog export |

Only the owning supplier manages a catalog. Buyers see their eligible products and effective pricing, not another
customer's private price list. `partners catalog assign/remove` manages the individual B2B customer relationship.
Each customer has at most one assigned catalog; only an active catalog applies. Catalog price changes do not rewrite
sent POs. Suppliers can manage both their product catalog and physical stock entirely through the initial CLI.

## Partners and addresses

| Commands | Main inputs and result | Scope and foundation |
| --- | --- | --- |
| `partners list`, `partners show <id>` | `--type supplier/forwarder/customer`, search, relationship/join status, permitted contacts and addresses | Initial; existing partner and supplier-customer readers |
| `partners create` | Required type and name, permitted contact details; buyer creates supplier/forwarder relationships | Initial; existing create services |
| `partners update <id>`, `partners remove <id>` | Expected revision and supported fields; optional type assertion, ownership/open-PO restrictions retained | Initial |
| `partners invite <id>` | Explicit recipient and type; invoking it again sends a fresh eligible invitation | Initial; existing invitation services |
| `address list`, `address show <id>`, `address create`, `address update <id>`, `address remove <id>` | Workspace/partner owner, address kind and revision; create addresses needed by purchasing/shipping | Initial |
| `partners catalog assign <id>`, `partners catalog remove <id>` | Supplier assigns one of its catalogs to a B2B customer, or clears the assignment; relationship and catalog revisions | Initial; existing catalog assignment service with added guards |

Partner results use a discriminated `type` field and typed identity, not a name that might identify several partners.
Customer here means the supplier's B2B buyer relationship, not an imported retail customer's personal profile.
Creation alone does not send an invitation. Once a supplier/forwarder joins, contact/address ownership follows existing
rules; the buyer cannot silently edit the joined workspace's own records.

## Connections and ingestion

| Commands | Main inputs and result | Scope and foundation |
| --- | --- | --- |
| `connection list`, `connection show <id>` | Provider/account, authorization, supported datasets/operations, missing scopes and data coverage | Initial |
| `connection connect <provider>`, `connection reconnect <id>` | Shopify, Amazon, eBay or Amazon Ads; browser authorization bound to the workspace and expected account | Initial; existing consent flows |
| `connection disconnect <id>` | Revision and explicit effects; report local disconnection separately from provider revocation | Initial |
| `connection sync <id>` | One supported dataset or `all`; queue or resume ingestion, optionally `--wait` | Initial; existing stock/order/Ads workers |
| `connection sync show <id>` | Latest run, dataset stages, covered period, pending/running/failed state and actionable errors | Initial; new public projection of sync state |
| `connection settings show <id>`, `connection settings update <id>` | Supported import preferences such as excluded Shopify tags; provider-specific schema and revision | Initial; current settings |

Datasets distinguish products/inventory, customer orders, financial transactions, stock history and ad spend. Expose
which can run independently and which are collected together by today's worker; do not imply separate jobs exist for
every dataset. A sync request ingests source data; product and inventory updates write through their own entity operations. No
`sales sync`, `inventory refresh` or top-level `job` aliases are needed. Re-running `connection sync` safely resumes or
repeats the requested read; it never means pushing inventory quantities upstream.

## Expenses

| Commands | Main inputs and result | Scope and foundation |
| --- | --- | --- |
| `expense list`, `expense show <id>`, `expense export` | Source/type, date basis, currency, channel, order, PO and shipment filters; values, source references and inclusion basis | Initial; imported charges, Ads days, landed costs and recurring definitions |
| `expense create`, `expense update <id>`, `expense remove <id>` | Manual `landed` or `recurring` type, amount/currency, PO or recurring period, revisions | Initial; existing create/remove services, new revisioned update handlers |

Imported amounts are read-only. Recurring definitions, daily Ads accruals, posted charges and allocated landed costs
are distinct types, not summable duplicates. Expenses do not include payouts/reserve movements merely because they
appear in a financial feed. See [expense semantics](resources.md#expenses).

## Restock and focused reports

| Commands | Main inputs and result | Scope |
| --- | --- | --- |
| `report restock` | Channel/supplier, sales days, lead time, status/SKU; recommended quantities, explanations and source coverage | Initial |
| `restock channel list` | Eligible replenishment destinations and availability | Initial |
| `restock plan create`, `restock plan show <id>`, `restock plan create-pos <id>` | Report selection, review and atomic creation of draft POs only | Initial |
| `report demand` | Fulfilled demand, product/location attribution, measurement basis and gaps | Initial |

There is no `report overview`. Primary data reads remain available independently of these aggregations. Report
export uses the same command's `--file-format` and `--output`, not a separate generic export service command.
All entity exports and file-producing reports support `--export-id <id>` to retrieve a particular run through the same
operation. This read selector excludes generation filters; its result contains status, provenance and the authorized
artifact when ready. `--wait` follows the returned selector. See [export contract](contract.md#pagination-and-exports).

Capability discovery exposes only deployed operations. The initial contract includes controlled source and channel
writes; it does not claim that continuous order/inventory synchronization or the complete
Marketplace Connect replacement is already implemented. Deferred endpoints are omitted.
