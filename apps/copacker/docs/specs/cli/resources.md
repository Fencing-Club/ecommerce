# Resource ownership and write destinations

Status: **proposed**. These boundaries define what the command names mean. Current behavior is distinguished from new
public operations; adding a CLI command does not make a planned product feature available.

## Orders, purchase orders and partners

`order` reads customer orders ingested from Shopify, Amazon and eBay. `po` manages purchasing between buyer and supplier.
Public fields use `orderId` for customer orders and `poId` for purchase orders, even where today's database uses
`orders` and `orderId` for POs. Canonical IDs, source references and display numbers are separate fields.

`partners` is one command group with `type: supplier | forwarder | customer`. Shared operations are list, show, create,
update, remove and invite, exposed only where supported for that relationship and caller. `partners list` without a type
returns all accessible types; `--type` filters it. Creation requires a type. A canonical relationship ID determines type
for show/update/remove; an optional supplied type is an assertion, not a way to convert a supplier into a forwarder.

The common result has `id`, `type`, `name`, `relationshipStatus`, permitted contact details, address references,
`revision` and `allowedActions`. Type-specific fields use a discriminated schema: supplier lead times and purchasing
settings do not become meaningless nullable fields on forwarders. The same organization may participate in multiple
typed relationships without duplicating its own profile. Adapters can unify today's separate storage models without
requiring a partner database migration for the CLI.

Buyer workspaces initially create suppliers and forwarders through existing services. Supplier workspaces read their
B2B customer relationships; arbitrary customer creation needs a supported onboarding workflow. These customers are
business partners, not the retail shoppers on imported orders. Creation does not send an invitation. A joined partner
owns its workspace profile and addresses; relationship edits must retain that distinction.

## Shipments

The default `shipment list` returns Copacker inbound shipments and discoverable Amazon inbound shipments together,
with origin, route and capabilities visible. `--origin copacker` selects the operational records; `--origin external`
selects unmatched provider records. A supplier-to-forwarder movement is part of a Copacker shipment's route, not a
different interpretation of the noun depending on which integration is connected.

| Concept | Public representation | Initial behavior |
| --- | --- | --- |
| Copacker shipment | Stable `id`, `poId`, revisions, cartons, packing/approval state and allowed actions | Create, pack, approve, release, dispatch, forward and receive through existing workflow rules |
| Physical route | Supplier origin, optional forwarder stop, Amazon or warehouse destination; known dispatch/forwarding/receipt events | Expose current route and events; do not invent a general multi-leg freight booking system |
| Amazon inbound record | Typed provider reference with connection, FBA/AWD network, external ID and source status | Linked records appear within the Copacker shipment; unmatched records are read-only external rows |
| Customer delivery | Fulfillment data on `order` when ingested | Does not appear as an editable inbound PO shipment |

One Copacker shipment may link to several Amazon shipment IDs; one mixed-network packing submission may produce several
Copacker shipments. Return all IDs and typed `providerReferences[]`. Never expose comma-separated IDs as an identity or
merge records solely because their names match. A linked Amazon record is not counted again as an external-only row.

`shipment show` exposes the route, known events, current responsible party and provider states separately. A local
`shipped` event does not claim that Amazon has received the goods. External-only results use a typed provider selector
through `shipment lookup`; they have no invented Copacker UUID or editable lifecycle.

Current Amazon discovery is a provider read with a short cache, whereas Copacker records are stored locally. Return
observation time and provider warnings. An Amazon outage can produce a partial list, never an assertion that there are
no external shipments. This is not yet carrier tracking, arbitrary freight consignment CRUD or an AGL booking API.

## Products and operational metadata

An edit belongs to the field's configured authority. Copacker stores a typed view and durable provider links; a cached
value does not make Copacker the owner. For the current buyer catalog, Shopify owns the SKU. Supplier-owned products
have a Copacker SKU. Inventory and price edits resolve their own source settings rather than inferring ownership from
which platform happened to supply a product record. See [source routing and channel writes](write-routing.md).

| Field family | Authority | Initial operation |
| --- | --- | --- |
| Buyer SKU | Shopify for the Shopify catalog | `product variant update --sku` changes Shopify only, verifies it and refreshes Copacker's projection |
| Amazon seller SKU | Identity of the seller's existing listing | Read and link it; no in-place rename or hidden delete/recreate |
| Supplier SKU, supplier assignment, preparation, packaging and label settings | Copacker operational metadata | Typed product/variant updates and product label operations |
| FBA, AWD and location stock targets | Copacker per-variant, per-pool/location metadata | Typed `stockTargets` through variant updates and reviewed import |
| Selling price | Explicit price authority, initially Shopify or Copacker | `product price update` changes the source and linked price targets, with per-target results |
| Unit cost | Explicit cost authority, initially Shopify or Copacker | `product cost update`; invoice approval uses the same cost-write service when requested |
| Managed stock and FBM availability | Selected location/balance and its configured write target | `inventory update/adjust --location` changes that location's allowed state; source-managed channel copies cannot be edited independently |
| Amazon FBA/AWD stock | Amazon-reported physical inventory | Read-only; do not confuse it with merchant-controlled FBM offer availability |
| Supplier products and catalogs | Owning supplier's Copacker workspace | Full existing product, catalog and stock-management workflows |
| Buyer title, handle and images | Source catalog in the current model | Read-only in this initial field allowlist; no arbitrary provider-property patch |

The platform adapters share semantic operations and report capabilities. They do not pretend that every field is
editable on every provider. Shopify permits SKU and unit-cost edits through its
[inventory item input](https://shopify.dev/docs/api/admin-graphql/2026-07/input-objects/InventoryItemInput), and variant
selling-price updates through
[`productVariantsBulkUpdate`](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/productVariantsBulkUpdate).
Amazon supports offer-price and merchant-fulfilled quantity changes through its
[Listings Items API](https://developer-docs.amazon.com/sp-api/docs/manage-product-listings-guide), but an existing
[seller SKU cannot be renamed](https://sellercentral.amazon.com/seller-forums/discussions/t/bae657d2-8168-4aa8-a364-e1efe766ec8d).
Changing a Shopify SKU therefore preserves the linked Amazon seller SKU. New-offer creation is outside this contract.

Supplier SKU, ASIN, the current Amazon/store stock targets, case quantity and supplier selection already have a
one-time Shopify-field import in `product-fields.ts`. Separate FBA/AWD/per-location targets need expanded storage and
consumer changes. A real SKU is a source field, not one of those operational metafields. No generic Shopify metafield
editor is needed for the initial operational metadata surface.

### Migration and identity rules

1. Use durable product/variant identities and explicit provider links. A Shopify SKU edit must not break the link to an
   Amazon listing, incoming stock, demand history or a supplier product. Persist source SKU observations separately;
   never repeatedly relink products solely by matching a mutable SKU string.
   Supplier SKU edits have the same identity requirement: migrate commitment and invoice stock joins to the supplier
   catalog variant ID, including durable component IDs for bundles, before enabling renames. Current stock routines
   still match SKU text and cannot be reused unchanged. An affected rename with unresolved stock commitments/deductions
   returns `identity_unresolved` and the affected records. Preserve
   historical PO SKU text, and do not reuse an old SKU string as another item's operational identity.
2. Seed operational metadata from existing local values and the matching Shopify metafields. Existing local values win;
   disagreement becomes a review issue. Record source identity, copied value and import time. Shopify SKU
   remains a refreshed source-owned field, not a one-time local ownership migration.
3. Define targets by stable stock pool/location ID, quantity and explicit unit. FBA and AWD are separate pools. Create
   explicit network targets; prelaunch target data needs no migration.
   Their pooled purchasing meaning and explicit network allocation follow the [restock calculation policy](workflows.md#restock-to-draft-purchase-orders).
4. Import previews show additions, conflicts and unresolved identities. Apply is revisioned and repeatable. Provider
   ingestion never overwrites established Copacker-owned metadata. Missing values stay unknown rather than zero.
5. Restock, PO preparation, matching, labels, search and exports read the same merged view. Provider calls use the stored
   external identities. Preserve immutable sent-PO and customer-order snapshots after SKU or supplier changes.

Product imports follow the same ownership rules as individual edits. The initial buyer settings import changes only
Copacker metadata; upstream SKU, price, cost and inventory writes use their explicit operations. Supplier product imports
retain current create/update behavior subject to the stock guards below. Neither import implicitly creates Shopify
products nor renames Amazon listings.

## Supplier catalogs and inventory

Every supplier workspace has the initial command surface to create/edit/archive its own products and variants, upload
images, import/export product sheets, maintain prices and packaging, manage catalogs and update stock, subject to its
members' existing permissions. This does not depend on connecting Shopify.

Catalogs are customer price lists: product membership, price adjustment, fixed overrides, volume breaks, quantity rules,
status and whether new products join automatically. `catalog create/update` retains the current complete-save semantics
and revision guard. `partners catalog assign/remove` changes the catalog on a B2B customer relationship. A customer has
at most one assignment; inactive or absent catalogs use current default-pricing rules. No operation exposes another
supplier's private catalog or changes historical sent-PO prices.

Supplier `inventory list/show` returns tracked state, on-hand pieces, open-PO commitments, computed availability and
continue-selling policy. Untracked/made-to-order stock is not zero. The current supplier model has one count per variant;
it must not pretend to have location-level stock or a complete movement ledger.
Expose that existing balance through one workspace-owned supplier stock location, so every count has an explicit
destination. This projection does not create independent counts for additional warehouses.

`inventory update` replaces one or several supplier on-hand counts in one transaction. Add expected row revisions to
the current count-saving handler and its UX caller so automation cannot overwrite a concurrent invoice deduction using
an old count. Return before/after counts and revisions. Tracking and continue-selling policy remain explicit variant
settings. Invoice acceptance/correction uses the existing supplier-stock rules; count updates must not also deduct PO
commitments. These writes affect Copacker-owned supplier stock, not marketplace availability.

The same stock guards apply wherever counts enter. Generic product/variant edits preserve current `onHand` and cannot
carry a stock replacement in a descriptive product snapshot. Supplier product creation/import may include an explicit
inventory section; each count row requires the supplier stock location (or an explicitly selected location applied to
all reviewed rows), inventory-write permission, expected quantity and stock-row revision for existing variants. New
variants require the location and an assertion that no stock row exists. Omitted/blank counts mean no stock write;
initial storage defaults are identified as defaults, not observed physical counts.

Import previews pin these stock revisions in addition to product/group revisions. Commit calls the same local stock
operation in the product/import transaction, so an invoice deduction after preview causes a conflict instead of being
overwritten. All local counts in that import commit atomically or not at all. Product and stock guards must also be
applied to the UX callers. This is required work: the existing full product/import save can include `onHand` and must
not be exposed unchanged as a second, unguarded stock-write path.

## Expenses

`expense` exposes the costs already ingested or maintained by Copacker and manual cost changes supported by the UX.
It is not a second accounting ledger. Types must retain their measurement and inclusion basis.

| Source/type | Available foundation | Write and counting rules |
| --- | --- | --- |
| Imported platform charge | Amazon financial transactions, ingested Shopify payment fees/balance charges and available channel fees | Read-only; retain provider transaction identity and coverage. Refunds, sales, payouts and reserve transfers are not all expenses. |
| Daily advertising spend | Amazon Ads daily profile/country totals | Read-only accrual estimate; current storage does not support campaign-level reporting. Complete Ads coverage replaces corresponding posted ad-payment costs in derived reports, not adds to them. |
| PO landed cost | Manual freight, duty and other PO costs, plus relevant matched inbound charges | Manual rows may be managed with permissions; preserve links and allocation basis. Allocation is not another incurred expense. |
| Recurring manual cost | Monthly cost definition with amount, currency, channel and effective dates | Create/update/remove definitions; report occurrences/proration separately from the definition. Update/revision guards need new handlers. |

Each expense result includes typed identity, source, category, signed amount, currency, date basis, related entities
where known, and an inclusion/replacement explanation. Missing PO/shipment attribution stays unknown. Preserve decimal
precision for Ads accruals rather than rounding every daily record to minor units before aggregation. Manual monetary
inputs retain the current currency/minor-unit rules.

Raw expense records cannot simply be summed: recurring definitions are not transactions; accruals can replace posted
charges; allocated costs can repeat an underlying cost. `expense list` is source data and includes the basis required
to interpret it. There is no general expense-attachment/import workflow in the current application; those commands
are omitted from the initial contract.

## Connections and data availability

`connection` owns provider authorization, account identity, dataset capabilities, ingestion status and sync requests.
Initial providers are Shopify, Amazon, eBay and Amazon Ads. The effective capability list is provider-, grant- and
workspace-specific. Connection presence alone does not imply full data coverage or upstream write access.

Expose stored customer orders, stock snapshots, stock days, financial records and Ads days directly through their
business resources. Return source account, sync/observation time, requested and covered period, retention/exclusions and
failures. Current importers have provider-specific history windows and omit some cancelled/test orders. Optional Shopify
customer IDs do not imply that customer names, addresses or a retail customer CRM are stored.

`connection sync <id> --dataset <name>` requests supported ingestion; capability metadata declares datasets collected
together by the current worker. It never silently pushes inventory or prices upstream. Changing a connection or its
account identity invalidates dependent selections and snapshots rather than applying them to the replacement account.
`status` summarizes these operational conditions. No Overview command is needed to expose the underlying records.

